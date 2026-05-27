#!/usr/bin/env python3
"""輕量 Markdown → .docx 轉換器(零外部依賴,只用標準庫 zipfile)。

支援:# ## ### 標題、段落、**粗體**、`行內 code`、GFM 表格、
     - / * 項目、- [ ] 核取清單、1. 編號清單、> 引言、--- 分隔線、``` code block ```。
中文字型預設「微軟正黑體」(Taiwan Word 常見),標題套品牌深藍 #1A3A5C。

用法:python3 scripts/md_to_docx.py <input.md> [output.docx]
"""
import re
import sys
import zipfile

NAVY = "1A3A5C"


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline_runs(text):
    """切成 (文字, fmt) 串列,fmt 可含 bold / code。"""
    parts = re.split(r"(\*\*.+?\*\*|`[^`]+`)", text)
    runs = []
    for p in parts:
        if not p:
            continue
        if p.startswith("**") and p.endswith("**"):
            runs.append((p[2:-2], {"bold": True}))
        elif p.startswith("`") and p.endswith("`"):
            runs.append((p[1:-1], {"code": True}))
        else:
            runs.append((p, {}))
    return runs


def run_xml(text, fmt):
    rpr = []
    if fmt.get("code"):
        rpr.append('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>')
        rpr.append('<w:sz w:val="20"/>')
    if fmt.get("bold"):
        rpr.append("<w:b/>")
    if fmt.get("color"):
        rpr.append(f'<w:color w:val="{fmt["color"]}"/>')
    if fmt.get("sz"):
        rpr.append(f'<w:sz w:val="{fmt["sz"]}"/>')
    rpr_xml = f"<w:rPr>{''.join(rpr)}</w:rPr>" if rpr else ""
    return f'<w:r>{rpr_xml}<w:t xml:space="preserve">{esc(text)}</w:t></w:r>'


def para(runs_list, ppr=""):
    runs = "".join(run_xml(t, f) for t, f in runs_list) or "<w:r><w:t></w:t></w:r>"
    return f"<w:p>{ppr}{runs}</w:p>"


def heading(text, level):
    sz = {1: 36, 2: 30, 3: 26, 4: 24}.get(level, 22)
    ppr = '<w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>'
    runs_xml = "".join(
        run_xml(t, {**f, "bold": True, "sz": sz, "color": NAVY})
        for t, f in inline_runs(text)
    )
    return f"<w:p>{ppr}{runs_xml}</w:p>"


def hr():
    return (
        '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" '
        'w:color="9A9890"/></w:pBdr></w:pPr></w:p>'
    )


def bullet(text, checkbox=None):
    prefix = {"unchecked": "☐  ", "checked": "☑  ", None: "•  "}[checkbox]
    ppr = '<w:pPr><w:ind w:left="360"/><w:spacing w:after="20"/></w:pPr>'
    return para([(prefix, {})] + inline_runs(text), ppr)


def ordered(text, num):
    ppr = '<w:pPr><w:ind w:left="360"/><w:spacing w:after="20"/></w:pPr>'
    return para([(f"{num}.  ", {"bold": True})] + inline_runs(text), ppr)


def quote(text):
    ppr = (
        '<w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" '
        f'w:space="8" w:color="{NAVY}"/></w:pBdr>'
        '<w:shd w:val="clear" w:fill="F8F7F4"/>'
        '<w:spacing w:before="40" w:after="40"/></w:pPr>'
    )
    return para(inline_runs(text), ppr)


def codeblock(lines):
    out = ""
    for ln in lines:
        ppr = '<w:pPr><w:shd w:val="clear" w:fill="F2F2F2"/><w:spacing w:after="0"/></w:pPr>'
        out += para([(ln if ln else " ", {"code": True})], ppr)
    return out


def table(rows):
    ncol = max(len(r) for r in rows)
    colw = 9300 // ncol
    grid = "".join(f'<w:gridCol w:w="{colw}"/>' for _ in range(ncol))
    sides = ["top", "left", "bottom", "right", "insideH", "insideV"]
    borders = (
        "<w:tblBorders>"
        + "".join(
            f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="D5D3CB"/>'
            for s in sides
        )
        + "</w:tblBorders>"
    )
    tblpr = (
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/>'
        '<w:tblLayout w:type="fixed"/>' + borders + "</w:tblPr>"
    )
    rows_xml = ""
    for i, r in enumerate(rows):
        cells = ""
        for j in range(ncol):
            cell = r[j] if j < len(r) else ""
            shd = f'<w:shd w:val="clear" w:fill="{NAVY}"/>' if i == 0 else ""
            tcpr = f'<w:tcPr><w:tcW w:w="{colw}" w:type="dxa"/>{shd}</w:tcPr>'
            if i == 0:
                runs = "".join(
                    run_xml(t, {**f, "bold": True, "color": "FFFFFF"})
                    for t, f in inline_runs(cell)
                )
            else:
                runs = "".join(run_xml(t, f) for t, f in inline_runs(cell))
            if not runs:
                runs = "<w:r><w:t></w:t></w:r>"
            cells += (
                f'<w:tc>{tcpr}<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>'
                f"{runs}</w:p></w:tc>"
            )
        rows_xml += f"<w:tr>{cells}</w:tr>"
    return f"<w:tbl>{tblpr}<w:tblGrid>{grid}</w:tblGrid>{rows_xml}</w:tbl><w:p/>"


def is_table_sep(line):
    return bool(re.fullmatch(r"\|[\s:\-|]+\|?", line.strip()))


def split_row(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def md_to_body(md):
    lines = md.split("\n")
    body = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        # code fence
        if stripped.startswith("```"):
            buf = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # 跳過收尾 ```
            body.append(codeblock(buf))
            continue

        # table（連續 | 行,第二行為分隔線）
        if stripped.startswith("|") and i + 1 < n and is_table_sep(lines[i + 1]):
            tbl = []
            tbl.append(split_row(lines[i]))  # header
            i += 2  # 跳過 header + 分隔線
            while i < n and lines[i].strip().startswith("|"):
                if not is_table_sep(lines[i]):
                    tbl.append(split_row(lines[i]))
                i += 1
            body.append(table(tbl))
            continue

        # heading
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            body.append(heading(m.group(2).strip(), len(m.group(1))))
            i += 1
            continue

        # hr
        if stripped in ("---", "***", "___"):
            body.append(hr())
            i += 1
            continue

        # blockquote
        if stripped.startswith(">"):
            body.append(quote(re.sub(r"^>\s?", "", stripped)))
            i += 1
            continue

        # checkbox
        m = re.match(r"^\s*[-*]\s+\[([ xX])\]\s+(.*)", line)
        if m:
            box = "checked" if m.group(1).lower() == "x" else "unchecked"
            body.append(bullet(m.group(2).strip(), box))
            i += 1
            continue

        # bullet
        m = re.match(r"^\s*[-*]\s+(.*)", line)
        if m:
            body.append(bullet(m.group(1).strip()))
            i += 1
            continue

        # ordered
        m = re.match(r"^\s*(\d+)\.\s+(.*)", line)
        if m:
            body.append(ordered(m.group(2).strip(), m.group(1)))
            i += 1
            continue

        # blank
        if not stripped:
            i += 1
            continue

        # paragraph
        body.append(para(inline_runs(stripped)))
        i += 1

    return "".join(body)


CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    "</Types>"
)

RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    "</Relationships>"
)

DOC_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    "</Relationships>"
)

STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:docDefaults><w:rPrDefault><w:rPr>"
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft JhengHei" w:cs="Microsoft JhengHei"/>'
    '<w:sz w:val="21"/><w:szCs w:val="21"/>'
    "</w:rPr></w:rPrDefault></w:docDefaults>"
    "</w:styles>"
)


def build_document(body):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}"
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
        'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
        "</w:body></w:document>"
    )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    in_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else in_path.rsplit(".", 1)[0] + ".docx"
    with open(in_path, encoding="utf-8") as f:
        md = f.read()
    body = md_to_body(md)
    document = build_document(body)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/document.xml", document)
    print(f"✓ 寫出 {out_path}")


if __name__ == "__main__":
    main()
