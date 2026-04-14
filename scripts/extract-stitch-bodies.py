#!/usr/bin/env python3
"""
Extract body innerHTML from public/stitch/*.html into public/stitch/*.body.html
so <StitchInline> can embed Stitch designs directly in React via
dangerouslySetInnerHTML (no iframe).

Also applies Lexus → Ducati text substitutions so demo content reads correctly
even for screens that were originally car-themed in Stitch.

Safe to re-run any time. Idempotent.

Usage:
    python3 scripts/extract-stitch-bodies.py

Upstream:  scripts/strip-stitch-chrome.py (run this first)
Downstream: src/components/stitch-inline.tsx
"""
from __future__ import annotations
import os
import re
import glob
import sys

try:
    from bs4 import BeautifulSoup, Comment  # type: ignore
except ImportError:
    print("ERROR: beautifulsoup4 is required. Install via: pip3 install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

# Stitch frequently sprinkles design-doc annotations into the markup:
#   <!-- Top Navigation Bar (Shared Component: TopAppBar) -->
#   <!-- Side Navigation (Shared Component: SideNavBar) -->
# When the surrounding tag is stripped these can surface as visible text.
ANNOTATION_PATTERNS = [
    "Shared Component",
    "TopAppBar",
    "SideNavBar",
    "BottomNavBar",
    "Top Navigation",
    "Side Navigation",
    "Bottom Navigation",
    "SideNavBar Shell",
    "TopNavBar Shell",
    "Main Content Canvas",
    "Main Content Wrapper",
    "Authority Source",
]


ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "stitch")
ROOT = os.path.normpath(ROOT)

# Text-level Ducati pivot substitutions. Keep narrow and explicit — we don't
# want to butcher unrelated strings like 「汽配」 or 「二手車市場」.
SUBS: list[tuple[str, str]] = [
    (r"\bLexus\s+RX\s+350h\s*-?\s*豪華版", "Ducati Panigale V4 S - Rosso GP"),
    (r"\bLexus\s+RX\s+350h", "Ducati Panigale V4 S"),
    (r"\bLexus\s+NX\s+200\s*-?\s*菁英版", "Ducati Monster SP - Thrilling Black"),
    (r"\bLexus\s+NX\s+200", "Ducati Monster SP"),
    (r"\bLexus\s+ES\s+300h\s*-?\s*旗艦版", "Ducati Multistrada V4 S - Iceberg White"),
    (r"\bLexus\s+ES\s+300h", "Ducati Multistrada V4 S"),
    (r"\bLexus\s+LS\s+500h", "Ducati Diavel V4"),
    (r"\bLexus\s+LC\s+500", "Ducati Streetfighter V4 SP"),
    (r"\bLexus\s+IS\s+300h", "Ducati Hypermotard 950"),
    (r"\bLexus\s+UX\s+250h", "Ducati Scrambler Icon"),
    (r"\bLexus\b", "Ducati"),
    (r"\bLEXUS\b", "DUCATI"),
    # Mainland → Taiwan wording. Order matters: specific compounds must match
    # before the bare `車間 → 維修廠` fallback.
    (r"車間派工調度", "技師派工調度"),
    (r"車間派工", "技師派工"),
    (r"車間施工進度", "維修進度"),
    (r"維修車間", "維修廠"),
    (r"車間效率", "廠內效率"),
    (r"車間工位", "工作站"),
    (r"車間管理", "維修廠管理"),
    (r"車間", "維修廠"),
    (r"工位", "工作站"),
]


def extract(src_path: str) -> tuple[str, str]:
    with open(src_path, encoding="utf-8") as f:
        src = f.read()
    soup = BeautifulSoup(src, "html.parser")
    body = soup.body
    if body is None:
        return "", ""

    # Strip scripts / external CSS / meta — they don't belong in inline React.
    for tag in body.find_all(["script", "link", "meta"]):
        tag.decompose()

    # Strip HTML comments (Stitch design-doc noise like "<!-- Sidebar -->").
    for c in list(body.find_all(string=lambda s: isinstance(s, Comment))):
        c.extract()

    # Strip stray annotation text that surfaced when surrounding tags were
    # removed by strip-stitch-chrome.py (e.g. " Top Navigation Bar (Shared
    # Component: TopAppBar) " living as a NavigableString directly under body).
    for s in list(body.find_all(string=True)):
        txt = (s or "").strip()
        if not txt:
            continue
        if any(p in txt for p in ANNOTATION_PATTERNS):
            # Only strip if it's a bare text node between tags (no inline
            # content; length-bounded to avoid false positives on real copy).
            if len(txt) < 120 and s.parent and s.parent.name in ("body", "main", "div", "section"):
                # Make sure this NavigableString isn't wrapping meaningful content —
                # a plain loose text node next to structural tags is the target.
                prev = s.previous_sibling
                nxt = s.next_sibling
                # Bare text between tags, or at body-level, is safe to drop.
                if (prev is None or getattr(prev, "name", None)) and (
                    nxt is None or getattr(nxt, "name", None)
                ):
                    s.extract()

    # Capture first-style block from <head> (keyframes, clip-paths).
    style_html = ""
    head = soup.head
    if head is not None:
        for s in head.find_all("style"):
            style_html += str(s) + "\n"

    body_html = "".join(str(c) for c in body.children)

    for pat, repl in SUBS:
        body_html = re.sub(pat, repl, body_html)

    # Conservative 車輛 → 機車, 汽車 → 機車
    body_html = re.sub(r"(?<![一-龥])車輛(?![一-龥])", "機車", body_html)
    body_html = re.sub(r"汽車", "機車", body_html)

    return style_html, body_html


def main() -> int:
    src_files = [
        f
        for f in sorted(glob.glob(os.path.join(ROOT, "*.html")))
        if not f.endswith(".body.html")
    ]
    if not src_files:
        print(f"No source HTML files in {ROOT}")
        return 1
    count = 0
    for fp in src_files:
        style_html, body_html = extract(fp)
        sid = os.path.basename(fp).replace(".html", "")
        out_path = os.path.join(ROOT, f"{sid}.body.html")
        content = style_html + body_html
        # Idempotence: skip write if unchanged
        if os.path.exists(out_path):
            with open(out_path, encoding="utf-8") as f:
                if f.read() == content:
                    continue
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1
    print(f"Wrote/updated {count} body files in {ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
