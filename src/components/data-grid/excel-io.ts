"use client";

export type ExportColumn<T> = {
  id: string;
  header: string;
  getValue: (row: T) => string | number | null;
};

export async function exportToXlsx<T>(opts: {
  fileName: string;
  sheetName: string;
  columns: ExportColumn<T>[];
  data: T[];
}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName || "Sheet1");
  ws.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.id,
    width: Math.max(c.header.length * 2 + 4, 14),
  }));
  for (const row of opts.data) {
    const obj: Record<string, string | number | null> = {};
    for (const c of opts.columns) {
      const v = c.getValue(row);
      obj[c.id] = v ?? "";
    }
    ws.addRow(obj);
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF8F7F4" },
  };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseXlsx(opts: {
  file: File;
  columns: { id: string; header: string }[];
}): Promise<Record<string, unknown>[]> {
  const ExcelJS = (await import("exceljs")).default;
  const buf = await opts.file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // 第一列當 header；header 名稱對應到 column.id（用 header 字串對照）
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const headerToId = new Map<string, string>();
  for (const c of opts.columns) headerToId.set(c.header, c.id);

  const out: Record<string, unknown>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (!header) return;
      const id = headerToId.get(header);
      if (!id) return;
      let value: unknown = cell.value;
      if (
        value &&
        typeof value === "object" &&
        "richText" in (value as Record<string, unknown>)
      ) {
        const parts = (value as { richText: { text: string }[] }).richText;
        value = parts.map((p) => p.text).join("");
      }
      if (typeof value === "string") value = value.trim();
      obj[id] = value;
    });
    if (Object.keys(obj).length > 0) out.push(obj);
  });
  return out;
}
