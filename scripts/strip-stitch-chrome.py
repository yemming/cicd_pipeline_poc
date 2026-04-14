#!/usr/bin/env python3
"""
Strip chrome (sidebar + topbar) from Stitch-exported HTML files in public/stitch/
so StitchViewer iframes show ONLY the page body. Our app shell (ModuleRail +
PagesPanel + Topbar) provides chrome — otherwise users get a "Russian nesting
doll" of two sidebars stacked side-by-side.

Safe to re-run any time. Idempotent.

Usage:
    python3 scripts/strip-stitch-chrome.py

Rules:
  - REMOVE any <aside|nav|div> that is positioned fixed + anchored to the left +
    tall (h-screen / top-0 / inset-y-0). These are app-shell sidebars.
  - REMOVE the first fixed/sticky top-0 <header|div|nav> that spans full width
    (w-full / inset-x-0 / justify-between). These are app-shell topbars.
  - KEEP anything with bottom-0 (mobile bottom tab bars, progress navs — those
    are legitimate design elements within a single screen).
  - KEEP inline <aside> panels without fixed positioning (content side-panels).
  - STRIP left-offset classes (ml-*, pl-64) from <main> since sidebar is gone.
"""
from __future__ import annotations
import os
import re
import glob
import sys

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:
    print("ERROR: beautifulsoup4 is required. Install via: pip3 install beautifulsoup4", file=sys.stderr)
    sys.exit(1)


ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "stitch")
ROOT = os.path.normpath(ROOT)

LEFT_OFFSET_CLS = re.compile(
    r"^(ml-\d+|ml-\[[^]]+\]|lg:ml-\d+|md:ml-\d+|sm:ml-\d+|pl-64)$"
)


def is_chrome_sidebar(tag) -> bool:
    cls = " ".join(tag.get("class", []) or [])
    if "fixed" not in cls:
        return False
    if "bottom-0" in cls:  # mobile bottom tab bars are legit content
        return False
    has_left = ("left-0" in cls) or ("inset-y-0" in cls)
    has_tall = ("h-screen" in cls) or ("h-full" in cls) or ("inset-y-0" in cls) or ("top-0" in cls)
    return has_left and has_tall


def is_chrome_topbar(tag) -> bool:
    cls = " ".join(tag.get("class", []) or [])
    if ("fixed" not in cls) and ("sticky" not in cls):
        return False
    if "top-0" not in cls:
        return False
    if "bottom-0" in cls:
        return False
    # Must span horizontally
    if "w-full" not in cls and "inset-x-0" not in cls and "right-0" not in cls and "justify-between" not in cls:
        return False
    return True


def strip_file(fp: str) -> bool:
    with open(fp, encoding="utf-8") as f:
        original = f.read()
    if len(original) < 300:
        return False
    soup = BeautifulSoup(original, "html.parser")
    body = soup.body
    if body is None:
        return False

    # 1) Remove all chrome sidebars
    for tag in list(soup.find_all(["aside", "nav", "div"])):
        if tag.parent is None:
            continue
        if is_chrome_sidebar(tag):
            tag.decompose()

    # 2) Remove the first chrome topbar
    for tag in list(soup.find_all(["header", "div", "nav"])):
        if tag.parent is None:
            continue
        if is_chrome_topbar(tag):
            tag.decompose()

    # 3) Normalize <main>: drop left-offset compensation classes
    main = soup.body.find("main") if soup.body else None
    if main is not None:
        cls_list = main.get("class", []) or []
        cls_list = [c for c in cls_list if not LEFT_OFFSET_CLS.match(c)]
        main["class"] = cls_list

    # 4) Normalize <body>: drop ml-*
    body_cls = body.get("class", []) or []
    body_cls = [c for c in body_cls if not LEFT_OFFSET_CLS.match(c)]
    body["class"] = body_cls

    new_html = str(soup)
    if new_html != original:
        with open(fp, "w", encoding="utf-8") as f:
            f.write(new_html)
        return True
    return False


def main() -> int:
    files = sorted(glob.glob(os.path.join(ROOT, "*.html")))
    if not files:
        print(f"No HTML files in {ROOT}")
        return 1
    modified = 0
    for fp in files:
        if strip_file(fp):
            modified += 1
    print(f"Stripped chrome from {modified}/{len(files)} Stitch HTML files in {ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
