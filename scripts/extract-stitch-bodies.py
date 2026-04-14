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
import zlib

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
    # Standalone Lexus model codes that Stitch sprinkles without the brand —
    # match the whole family range (any displacement + trim suffix) rather
    # than a fixed list, so "RX 500h" / "UX 300e" etc. all get collapsed.
    (r"\bRX\s+\d+[a-z]?\b", "Panigale V4 S"),
    (r"\bNX\s+\d+[a-z]?\b", "Monster SP"),
    (r"\bES\s+\d+[a-z]?\b", "Multistrada V4 S"),
    (r"\bLS\s+\d+[a-z]?\b", "Diavel V4"),
    (r"\bLC\s+\d+[a-z]?\b", "Streetfighter V4 SP2"),
    (r"\bIS\s+\d+[a-z]?\b", "Hypermotard 950"),
    (r"\bUX\s+\d+[a-z]?\b", "Scrambler Icon"),
    # F SPORT is Lexus' performance trim; map to Ducati equivalent
    (r"\bF\s+SPORT\s+Performance\b", "V4 Performance"),
    (r"\bF\s+SPORT\b", "V4 Performance"),
    (r"\bF\s+Sport\b", "V4 Performance"),
    (r"\bLexus\b", "Ducati"),
    (r"\bLEXUS\b", "DUCATI"),
    (r"\blexus\b", "ducati"),
    # Toyota brand strays from Stitch auto-generated content
    (r"\bToyota\s+RAV4\b", "Ducati DesertX"),
    (r"\bToyota\s+Camry\b", "Ducati Monster"),
    (r"\bToyota\s+Corolla\b", "Ducati Scrambler"),
    (r"\bTOYOTA\b", "DUCATI"),
    (r"\bToyota\b", "Ducati"),
    (r"\btoyota\b", "ducati"),
    # Lower-case image-search query fragments that Stitch sprinkles as alt text
    (r"lexus sedan interior", "ducati motorcycle detail"),
    (r"lexus sedan", "ducati motorcycle"),
    (r"lexus\.com", "ducati.tw"),
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
    # Remnant Lexus-era body types → Ducati bike families
    body_html = re.sub(r"房車\s+LS\s+500h", "街車 Diavel V4", body_html)
    body_html = re.sub(r"轎車到剽悍\s*SUV", "超跑到剽悍冒險車", body_html)
    body_html = re.sub(r"絕美豪華轎車", "義式街車旗艦", body_html)
    body_html = re.sub(r"轎車", "街車", body_html)
    body_html = re.sub(r"(?<![一-龥])休旅車(?![一-龥])", "冒險車", body_html)
    body_html = re.sub(r"(?<![一-龥])房車(?![一-龥])", "街車", body_html)
    body_html = re.sub(r"(?<![一-龥])商務車(?![一-龥])", "旅行車", body_html)

    # Mainland Chinese → Traditional Taiwan wording.
    # 審批 is the biggest one — swap to 簽核 wholesale across Stitch bodies.
    body_html = body_html.replace("審批中心", "簽核中心")
    body_html = body_html.replace("審批", "簽核")
    body_html = body_html.replace("經銷商管理", "簽核管理")
    body_html = body_html.replace("菜單", "選單")
    body_html = body_html.replace("重置", "重設")
    body_html = body_html.replace("登錄", "登入")
    body_html = body_html.replace("視頻", "影片")
    body_html = body_html.replace("信息", "訊息")
    body_html = body_html.replace("默認", "預設")
    body_html = body_html.replace("創建", "建立")
    body_html = body_html.replace("新建", "新增")
    body_html = body_html.replace("界面", "介面")
    body_html = body_html.replace("屏幕", "螢幕")
    body_html = body_html.replace("服務器", "伺服器")
    body_html = body_html.replace("軟件", "軟體")
    body_html = body_html.replace("硬件", "硬體")
    body_html = body_html.replace("網絡", "網路")
    body_html = body_html.replace("激活", "啟用")
    body_html = body_html.replace("打印", "列印")

    # Replace Stitch's AI-generated Lexus car images (Google CDN) with our
    # locally downloaded Ducati photos, rotated deterministically by URL hash
    # so different pages/cards show different bikes.
    body_html = re.sub(
        r"https://lh3\.googleusercontent\.com/aida-public/[^\"'\s]+",
        _pick_bike_image,
        body_html,
    )

    return style_html, body_html


# Pool of locally-hosted Ducati imagery for demo use (public/bikes/).
# Mix of hero photos (large promotional shots) + menu thumbnails.
_BIKE_IMAGES = [
    "/bikes/hero/hero-1.jpg",
    "/bikes/hero/hero-2.jpg",
    "/bikes/hero/hero-3.jpg",
    "/bikes/hero/hero-4.jpg",
    "/bikes/hero/hero-monster.jpg",
    "/bikes/hero/lifestyle-1.jpg",
    "/bikes/hero/lifestyle-2.jpg",
    "/bikes/hero/lifestyle-3.jpg",
    "/bikes/thumbs/panigale-v4-s.png",
    "/bikes/thumbs/streetfighter-v4-sp2.png",
    "/bikes/thumbs/multistrada-v4-s.png",
    "/bikes/thumbs/monster-sp.png",
    "/bikes/thumbs/desertx.png",
    "/bikes/thumbs/hypermotard-950-sp.png",
]


def _pick_bike_image(match: re.Match[str]) -> str:
    url = match.group(0)
    idx = zlib.crc32(url.encode("utf-8")) % len(_BIKE_IMAGES)
    return _BIKE_IMAGES[idx]


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
