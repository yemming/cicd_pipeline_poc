#!/usr/bin/env python3
"""
Strip global ::-webkit-scrollbar CSS from stitch body HTML files.

Stitch-generated HTML frequently ships a global scrollbar override such as:

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #e2e0fc; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #c6c4df; }

Because <StitchInline> injects the body HTML via dangerouslySetInnerHTML,
these rules leak into the global document and recolor the dark sidebar nav
scrollbar to near-white, showing up as "white line / white dot" artifacts.

Global scrollbar styling for the app shell lives in globals.css scoped
under .pages-panel-nav, so stripping from stitch bodies is safe.

Idempotent: running multiple times produces no further changes.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BODY_DIR = Path(__file__).resolve().parents[1] / "public" / "stitch"

# Match ONLY rules where ::-webkit-scrollbar is the top-level selector
# (i.e. anchored at line start, with no class/element prefix).
# Scoped rules like `.no-scrollbar::-webkit-scrollbar { ... }` are safe —
# they only affect their own class and must be preserved.
SCROLLBAR_RULE = re.compile(
    r"^[ \t]*::-webkit-scrollbar[^{}]*\{[^}]*\}[ \t]*\n?",
    re.MULTILINE,
)

# Match "/* Custom scrollbar */" or similar comments left behind
SCROLLBAR_COMMENT = re.compile(
    r"[ \t]*/\*[^*]*scrollbar[^*]*\*/[ \t]*\n?",
    re.IGNORECASE,
)


def strip_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    cleaned = SCROLLBAR_RULE.sub("", original)
    cleaned = SCROLLBAR_COMMENT.sub("", cleaned)
    if cleaned == original:
        return False
    path.write_text(cleaned, encoding="utf-8")
    return True


def main() -> int:
    if not BODY_DIR.exists():
        print(f"stitch body dir not found: {BODY_DIR}", file=sys.stderr)
        return 1
    changed = 0
    total = 0
    for file in sorted(BODY_DIR.glob("*.body.html")):
        total += 1
        if strip_file(file):
            changed += 1
            print(f"cleaned {file.name}")
    print(f"\n{changed}/{total} files modified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
