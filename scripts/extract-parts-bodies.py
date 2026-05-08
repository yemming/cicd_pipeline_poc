#!/usr/bin/env python3
"""
從 docs/DUCATI_庫存管理模組_正式版/*.html 抽出 main 內容 + scoped style block,
產出 public/parts-stitch/{slug}.body.html,給 React server component 用
dangerouslySetInnerHTML 注入。

處理項目:
1. 抽 <main class="main"> innerHTML(沒有 main 的頁面 fallback 到 body 內所有非 header/aside)
2. 抽 <style> 區塊,把所有 selector 加 `.pd ` 前綴 scope(避免污染 modern shell)
3. 移除 chrome 相關 rules:.sidebar / .header / 它們的 children
4. 保留 :root CSS variables(不 scope,讓 design tokens 全域可用)
5. 移除 inline `onclick="..."` / `<script>`(React 會 warn)
6. 包 <div class="pd"> wrapper

idempotent — 重跑會覆蓋。

Usage:
    python3 scripts/extract-parts-bodies.py
"""
from __future__ import annotations
import os
import re
import sys
import glob

try:
    from bs4 import BeautifulSoup, NavigableString  # type: ignore
except ImportError:
    print("需要 beautifulsoup4: pip3 install --break-system-packages --user beautifulsoup4", file=sys.stderr)
    sys.exit(1)


SRC_DIR = "docs/DUCATI_庫存管理模組_正式版"
DST_DIR = "public/parts-stitch"

# 53 HTML 檔名 → 我們的 /parts URL(跟 PARTS_PAGE_META 對齊)
HTML_TO_URL = {
    "00_庫存管理模組_導覽總覽": "/parts",
    "00_模組功能流程關係圖": "/parts/overview/flow",
    "01_基礎設定_組織三層架構": "/parts/setup/org",
    "01_基礎設定_採購權限規則": "/parts/setup/purchase-permissions",
    "01_基礎設定_商品管理權限": "/parts/setup/item-permissions",
    "01_基礎設定_盤點回傳規則": "/parts/setup/count-rules",
    "01_基礎設定_管控類型定義": "/parts/setup/control-types",
    "02_基礎設定_倉儲四層架構": "/parts/setup/warehouse-arch",
    "02_基礎設定_倉庫庫區庫位設定": "/parts/setup/warehouse-bins",
    "02_基礎設定_供應商資訊": "/parts/setup/suppliers",
    "02_基礎設定_採購合約": "/parts/setup/contracts",
    "03_基礎設定_商品基礎資料": "/parts/setup/items",
    "03_基礎設定_商品資訊": "/parts/setup/items-info",
    "03_基礎設定_序列號追蹤": "/parts/setup/serial",
    "03_基礎設定_適配設定": "/parts/setup/compatibility",
    "03_基礎設定_門市定價": "/parts/setup/pricing",
    "04_採購流程鏈路說明": "/parts/purchase/flow",
    "04_採購管理_需求處理": "/parts/purchase/requisitions",
    "04_採購管理_日常補貨計畫": "/parts/purchase/replenishment",
    "04_採購管理_商品採購": "/parts/purchase/orders",
    "04_採購管理_採購退貨": "/parts/purchase/returns",
    "05_入庫管理_採購入庫": "/parts/receipt/po-grn",
    "05_入庫管理_調撥入庫": "/parts/receipt/transfer-in",
    "05_入庫管理_內售入庫": "/parts/receipt/internal-sale",
    "05_入庫管理_領料退貨入庫": "/parts/receipt/return-in",
    "06_出庫管理_維修領料": "/parts/issue/repair-pick",
    "06_出庫管理_調撥出庫": "/parts/issue/transfer-out",
    "06_出庫管理_內售出庫": "/parts/issue/internal-sale",
    "07_庫存管理_商品庫存查詢_v2": "/parts/operations/balance",
    "07_庫存作業_入庫查詢": "/parts/operations/receipts-history",
    "07_庫存作業_調撥在途查詢": "/parts/operations/transfers-in-transit",
    "07_庫存作業_例外出入庫": "/parts/operations/exceptions",
    "07_庫存作業_寄存管理": "/parts/operations/consignment",
    "07_庫存作業_備件庫存調整": "/parts/operations/adjust",
    "07_庫存作業_庫存盤點作業": "/parts/operations/count-ops",
    "08_盤點管理_盤點計畫": "/parts/count/plans",
    "08_盤點管理_盤點處理": "/parts/count/sessions",
    "08_盤點管理_報損報溢": "/parts/count/adjustments",
    "10_預警告警_庫存水位設定": "/parts/alerts/thresholds",
    "10_預警告警_告警類型與規則": "/parts/alerts/rules",
    "10_預警告警_告警階層設定": "/parts/alerts/escalation",
    "10_預警告警_工單增項閉環": "/parts/alerts/work-order-loop",
    "11_保固索賠_索賠流程說明": "/parts/warranty/flow",
    "11_保固索賠_RO工單串接": "/parts/warranty/ro-link",
    "11_保固索賠_舊件管理": "/parts/warranty/used-parts",
    "11_保固索賠_舊件出入庫邏輯": "/parts/warranty/used-parts-flow",
    "11_保固索賠_暫存倉設定": "/parts/warranty/staging-warehouse",
    "11_保固索賠_費用回收": "/parts/warranty/cost-recovery",
    "12_分析報表_ABC結構圖": "/parts/analytics/abc-structure",
    "12_分析報表_ABC分類": "/parts/analytics/abc",
    "12_分析報表_ABC分類設定": "/parts/analytics/abc-settings",
    "12_分析報表_呆滯庫存": "/parts/analytics/stale",
    "12_分析報表_庫存周轉率": "/parts/analytics/turnover",
}

# 設計稿 onclick 中的 '....html' 字串轉換成 /parts URL
HTML_LINK_RE = re.compile(r"""(['"])((?:\d{2}_[^'"]+))\.html\1""")


def rewrite_html_links(text: str) -> str:
    """把字串中所有 'NN_xxx.html' 換成 '/parts/xxx' URL(對 onclick / href 都有效)。"""
    def _sub(m: "re.Match[str]") -> str:
        quote = m.group(1)
        stem = m.group(2)
        url = HTML_TO_URL.get(stem)
        if not url:
            return m.group(0)  # 找不到 mapping,原樣保留
        return f"{quote}{url}{quote}"
    return HTML_LINK_RE.sub(_sub, text)

# Chrome selectors 直接刪掉(對應 element 已從 main 排除,CSS 留著只是死碼)
CHROME_SELECTOR_PATTERNS = [
    # 舊版命名(.sidebar/.header/.nav-*)
    r"^\.sidebar\b",
    r"^\.sidebar-",
    r"^\.sidebar::",
    r"^\.header\b",
    r"^\.header-",
    # 嚴格只比對 `.main` 本身(不含 .main-flow-row 之類的 design class);
    # \b 在 n→- 之間算 word boundary,會誤觸,所以改用 negative lookahead。
    r"^\.main(?![-\w])",  # design 自帶 sidebar offset,跟 modern shell 衝突
    r"^\.nav-section\b",
    r"^\.nav-section-",
    r"^\.nav-item\b",
    r"^\.nav-sub\b",
    r"^\.nav-sub-",
    r"^\.nav-badge\b",
    r"^\.nb-",
    r"^\.dot\b",
    r"^\.dot-",
    # 新版簡寫(.hdr/.sb/.ng/.ni/.nsi/.nsep)
    r"^\.hdr\b",
    r"^\.hdr-",
    r"^\.hdr\.",
    r"^\.sb\b",
    r"^\.sb-",
    r"^\.sb\.",
    r"^\.ng\b",
    r"^\.ngl\b",
    r"^\.nd\b",  # nav dot wrapper
    r"^\.ni\b",
    r"^\.ni\.",
    r"^\.nsub\b",
    r"^\.nsub\.",
    r"^\.nsi\b",
    r"^\.nsi\.",
    r"^\.nsep\b",
    r"^\.nbadge\b",
    r"^\.nbadge\.",
    r"^\.narr\b",
    r"^\.nico\b",
]
CHROME_SELECTOR_RE = re.compile("|".join(CHROME_SELECTOR_PATTERNS))

# @import 整段移除(內含 url 含 `;` 會打亂 CSS parser;modern shell 會自己載字型)
AT_IMPORT_RE = re.compile(r"@import\s+(?:url\([^)]*\)|\"[^\"]*\"|'[^']*')\s*;", re.IGNORECASE)


def is_chrome_selector(sel: str) -> bool:
    sel = sel.strip()
    return bool(CHROME_SELECTOR_RE.match(sel))


def scope_css(css: str) -> str:
    """把所有 top-level selector 加 `.pd ` prefix 做 scope,移除 chrome 相關 rules。
    保留 :root, @keyframes, @media 等 at-rule。"""
    # 先移除 @import(內含 url 帶 `;` 會破壞下面的 simple parser)
    css = AT_IMPORT_RE.sub("", css)
    out = []
    i = 0
    n = len(css)
    while i < n:
        # 跳過空白與註解
        while i < n and css[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        # 處理 /* ... */ 註解,直接保留
        if css[i:i+2] == "/*":
            end = css.find("*/", i+2)
            if end == -1:
                break
            out.append(css[i:end+2] + "\n")
            i = end + 2
            continue
        # 處理 @rule
        if css[i] == "@":
            # find matching {...} or ;
            # simple at-rule like @import ends with ;
            semi = css.find(";", i)
            brace = css.find("{", i)
            if semi != -1 and (brace == -1 or semi < brace):
                out.append(css[i:semi+1] + "\n")
                i = semi + 1
                continue
            # block at-rule (@keyframes / @media / @supports)
            if brace == -1:
                break
            # find matching }
            depth = 0
            j = brace
            while j < n:
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            block_end = j + 1
            # 對於 @media / @supports,遞迴 scope 內部 rules
            head = css[i:brace+1]
            inner = css[brace+1:j]
            head_kw = head.split()[0] if head.split() else ""
            if head_kw in ("@media", "@supports"):
                inner_scoped = scope_css(inner)
                out.append(head + "\n" + inner_scoped + "\n}\n")
            else:
                # @keyframes / @font-face 等不 scope,保留原樣
                out.append(css[i:block_end] + "\n")
            i = block_end
            continue
        # 一般 rule:selector { decl }
        brace = css.find("{", i)
        if brace == -1:
            break
        # find matching }
        depth = 1
        j = brace + 1
        while j < n and depth > 0:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        rule_end = j
        selectors_str = css[i:brace].strip()
        body_str = css[brace:rule_end]
        # 把多重 selector 拆開處理
        selectors = [s.strip() for s in selectors_str.split(",")]
        scoped_sels = []
        for sel in selectors:
            if not sel:
                continue
            if is_chrome_selector(sel):
                continue  # drop chrome rules
            if sel == ":root":
                scoped_sels.append(":root")  # keep design tokens global
                continue
            if sel == "*":
                scoped_sels.append(".pd *")
                continue
            if sel == "body":
                scoped_sels.append(".pd")
                continue
            if sel.startswith("html") or sel.startswith("body "):
                scoped_sels.append(".pd " + sel.split(maxsplit=1)[-1] if " " in sel else ".pd")
                continue
            if sel == ".main":
                scoped_sels.append(".pd")
                continue
            scoped_sels.append(".pd " + sel)
        if scoped_sels:
            out.append(", ".join(scoped_sels) + " " + body_str + "\n")
        i = rule_end
    return "".join(out)


def extract_one(src_path: str, dst_dir: str) -> str | None:
    with open(src_path, encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    style_tag = soup.find("style")
    style_css = scope_css(style_tag.string or "") if style_tag and style_tag.string else ""

    # 抽 main innerHTML
    main = soup.body.find("main") if soup.body else None
    container = main
    if not container:
        # fallback:body 中除了 header / aside 的所有內容
        if not soup.body:
            return None
        body = soup.body
        for tag in body.find_all(["header", "aside"]):
            tag.decompose()
        # 部分頁面用 <div class="hdr"> / <div class="sidebar"> 取代 <header>/<aside>;
        # 用 class 再掃一次避免它們殘留(會跟 modern shell 重複出現品牌列、左側 nav)。
        # 收集再刪,避免 iterator 中途 decompose 造成下次迭代 yield 已 detached 的節點。
        CHROME_CLASSES = {"hdr", "sidebar", "header", "sb"}
        to_remove = []
        for tag in body.find_all(True):
            if not hasattr(tag, "get"):
                continue
            classes = tag.get("class") or []
            if any(c in CHROME_CLASSES for c in classes):
                to_remove.append(tag)
        for tag in to_remove:
            tag.decompose()
        container = body

    # 處理 inline event handler:
    # - 保留 location.href / go() 跳轉 + rewrite .html 為 /parts URL
    # - 保留 alert(...)(讓 demo button 至少有提示)
    # - 其他自定 helper(closePanel / openPO / addItem 等)→ 改用 alert 提示「demo only」
    for el in container.find_all(True):
        for attr in list(el.attrs):
            if not attr.startswith("on"):
                continue
            value = el[attr]
            if not isinstance(value, str):
                del el[attr]
                continue
            value = value.strip()
            has_navigation = ("location.href" in value) or re.search(r"\bgo\s*\(", value)
            if has_navigation:
                el[attr] = rewrite_html_links(value)
                continue
            # alert(...) 直接保留,瀏覽器原生支援
            if re.match(r"^\s*alert\s*\(", value):
                el[attr] = value
                continue
            # 含 alert 但前後有其他語句:抽 alert 出來保留
            alert_match = re.search(r"alert\s*\(([^)]*)\)", value)
            if alert_match:
                el[attr] = f"alert({alert_match.group(1)})"
                continue
            # 純自定 helper(closePanel / openItem / addRow 等)— 刪掉避免 console error
            del el[attr]
    for script in container.find_all("script"):
        script.decompose()
    main_html = "".join(str(c) for c in container.contents)

    # 整段 main_html 也跑一次 link rewrite(處理 anchor href / data-href 等可能漏網的)
    main_html = rewrite_html_links(main_html)

    # 包成 .pd wrapper
    output = f'<style>{style_css}</style>\n<div class="pd">\n{main_html}\n</div>\n'

    # 輸出檔名:沿用 src 檔名 + .body.html
    base = os.path.basename(src_path).replace(".html", ".body.html")
    dst = os.path.join(dst_dir, base)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(output)
    return dst


def main() -> int:
    if not os.path.isdir(SRC_DIR):
        print(f"找不到 {SRC_DIR}", file=sys.stderr)
        return 1
    os.makedirs(DST_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC_DIR, "*.html")))
    if not files:
        print(f"在 {SRC_DIR} 沒找到 HTML")
        return 1
    ok = 0
    for fp in files:
        try:
            dst = extract_one(fp, DST_DIR)
            if dst:
                ok += 1
        except Exception as e:
            print(f"失敗 {os.path.basename(fp)}: {e}", file=sys.stderr)
    print(f"抽出 {ok}/{len(files)} 頁到 {DST_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
