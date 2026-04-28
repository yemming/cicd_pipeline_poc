#!/usr/bin/env python3
"""
Extract Ducati 售後完整工單套件 v4 → JSON for the new dev module.
Each sheet → one structured JSON object preserving rows + cell values.
"""
import json, openpyxl, sys
from pathlib import Path

SRC = Path(__file__).parent.parent / "docs" / "Ducati_售後完整工單套件_v4.xlsx"
OUT = Path(__file__).parent.parent / "src" / "lib" / "aftersales-kit" / "data.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

wb = openpyxl.load_workbook(SRC, data_only=True)

result = []
for name in wb.sheetnames:
    ws = wb[name]
    rows = []
    for r in range(1, ws.max_row + 1):
        row = []
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            row.append(v if v is not None else "")
        if any(str(x).strip() for x in row):
            rows.append({"r": r, "cells": row})
    result.append({
        "sheetName": name,
        "maxCol": ws.max_column,
        "rows": rows,
    })

OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(f"Extracted {len(result)} sheets → {OUT.relative_to(Path.cwd())}")
for s in result:
    print(f"  - {s['sheetName']}: {len(s['rows'])} non-empty rows × {s['maxCol']} cols")
