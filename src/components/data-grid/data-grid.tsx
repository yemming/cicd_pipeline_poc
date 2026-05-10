"use client";

import { useMemo, useRef, useState } from "react";

import { ColumnChooser } from "./column-chooser";
import { EditableCell, type EditableSpec } from "./editable-cell";
import { exportToXlsx, parseXlsx } from "./excel-io";
import { useColumnVisibility } from "./use-column-state";

export type SortValue = string | number | boolean | Date | null | undefined;

export type DataGridColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  width?: number;
  align?: "left" | "right";
  hideable?: boolean;
  defaultHidden?: boolean;
  exportValue?: (row: T) => string | number | null;
  sortable?: boolean;
  sortValue?: (row: T) => SortValue;
  editable?: EditableSpec<T>;
};

export type ImportResult = {
  ok: number;
  failed: number;
  errors?: string[];
};

export type PaginationState = {
  page: number; // 1-indexed
  pageSize: number;
  totalCount: number;
  onPageChange: (next: number) => void;
};

export type DataGridProps<T> = {
  columns: DataGridColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  persistKey: string;
  exportFileName?: string;
  onImport?: (
    rows: Record<string, unknown>[],
  ) => Promise<ImportResult | void>;
  rowActions?: (row: T) => React.ReactNode;
  rowActionsHeader?: string;
  rowActionsWidth?: number;
  emptyMessage?: string;
  disabled?: boolean;
  // 不傳就沒分頁；傳了會在表格底部顯示 pagination footer，sort 改成只作用於當頁
  pagination?: PaginationState;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

function compareValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "zh-Hant", { numeric: true, sensitivity: "base" });
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b), "zh-Hant");
}

export function DataGrid<T>({
  columns,
  data,
  rowKey,
  persistKey,
  exportFileName,
  onImport,
  rowActions,
  rowActionsHeader = "操作",
  rowActionsWidth = 210,
  emptyMessage = "沒有資料",
  disabled,
  pagination,
}: DataGridProps<T>) {
  const [visibility, setVisibility] = useColumnVisibility(persistKey, columns);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleColumns = columns.filter((c) => visibility[c.id] !== false);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.id === sort.id);
    if (!col) return data;
    const getValue: (row: T) => SortValue =
      col.sortValue ?? col.exportValue ?? (() => null);
    return [...data].sort((a, b) => {
      const cmp = compareValues(getValue(a), getValue(b));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const toggleSort = (id: string) => {
    setSort((cur) => {
      if (!cur || cur.id !== id) return { id, dir: "asc" };
      if (cur.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  };

  const handleExport = async () => {
    if (sortedData.length === 0) return;
    setExporting(true);
    try {
      const fileName = (exportFileName ?? persistKey).replace(/[\/\\:*?"<>|]/g, "-");
      await exportToXlsx({
        fileName: `${fileName}.xlsx`,
        sheetName: "Sheet1",
        columns: visibleColumns.map((c) => ({
          id: c.id,
          header: c.header,
          getValue: c.exportValue ?? (() => ""),
        })),
        data: sortedData,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;
    setImporting(true);
    try {
      const rows = await parseXlsx({
        file,
        columns: columns.map((c) => ({ id: c.id, header: c.header })),
      });
      await onImport(rows);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section
      className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="px-3 py-1.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || sortedData.length === 0}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 inline-flex items-center gap-1"
          title="把目前篩選後的資料匯出成 Excel"
        >
          <span aria-hidden>⬇</span>
          <span>{exporting ? "匯出中⋯" : "匯出 Excel"}</span>
        </button>
        {onImport && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 inline-flex items-center gap-1"
              title="從 Excel 匯入資料（依欄位 header 對齊）"
            >
              <span aria-hidden>⬆</span>
              <span>{importing ? "匯入中⋯" : "匯入 Excel"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => void handleFileChange(e)}
            />
          </>
        )}
        <ColumnChooser
          columns={columns}
          visibility={visibility}
          onChange={setVisibility}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              {visibleColumns.map((c) => {
                const sortable = c.sortable !== false;
                const isSorted = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    className={`${
                      c.align === "right" ? "text-right" : "text-left"
                    } font-medium py-2 px-3 ${
                      sortable
                        ? "cursor-pointer select-none hover:text-[#2C2C2A]"
                        : ""
                    }`}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={sortable ? () => toggleSort(c.id) : undefined}
                    aria-sort={
                      isSorted
                        ? sort?.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : sortable
                          ? "none"
                          : undefined
                    }
                  >
                    <span
                      className={`inline-flex items-center gap-1 ${
                        c.align === "right" ? "justify-end" : ""
                      }`}
                    >
                      {c.header}
                      {sortable && (
                        <span
                          className={`text-[10px] ${
                            isSorted ? "text-[#1A3A5C]" : "text-[#C9C7C0]"
                          }`}
                          aria-hidden
                        >
                          {isSorted ? (sort?.dir === "asc" ? "▲" : "▼") : "⇵"}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
              {rowActions && (
                <th
                  className="text-right font-medium py-2 px-3"
                  style={{ width: rowActionsWidth }}
                >
                  {rowActionsHeader}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (rowActions ? 1 : 0)}
                  className="py-12 text-center text-[12px] text-[#9A9890]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]"
                >
                  {visibleColumns.map((c) => (
                    <td
                      key={c.id}
                      className={`py-2 px-3 align-top ${
                        c.align === "right" ? "text-right" : ""
                      }`}
                    >
                      {c.editable ? (
                        <EditableCell
                          row={row}
                          renderValue={c.cell}
                          editable={c.editable}
                        />
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="py-2 px-3 text-right align-top">
                      <div className="flex gap-1.5 justify-end whitespace-nowrap">
                        {rowActions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalCount > 0 && (
        <PaginationFooter pagination={pagination} hasSort={sort !== null} />
      )}
    </section>
  );
}

function PaginationFooter({
  pagination,
  hasSort,
}: {
  pagination: PaginationState;
  hasSort: boolean;
}) {
  const { page, pageSize, totalCount, onPageChange } = pagination;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  const pillBase =
    "h-[26px] min-w-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40 disabled:hover:border-[#D5D3CB] inline-flex items-center justify-center";

  return (
    <div className="px-3 py-2 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2 text-[12px] text-[#5A5955] flex-wrap">
      <span>
        共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
        筆 · 顯示{" "}
        <b className="text-[#2C2C2A]">
          {start.toLocaleString("en-US")}–{end.toLocaleString("en-US")}
        </b>{" "}
        筆
      </span>
      {hasSort && (
        <span className="text-[10.5px] text-[#9A9890]">
          （排序僅作用於當頁）
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={isFirst}
          className={pillBase}
          title="首頁"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={isFirst}
          className={pillBase}
          title="上一頁"
        >
          ‹
        </button>
        <span className="px-2 text-[12px]">
          第 <b className="text-[#2C2C2A]">{page}</b> /{" "}
          <b className="text-[#2C2C2A]">{totalPages}</b> 頁
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={isLast}
          className={pillBase}
          title="下一頁"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={isLast}
          className={pillBase}
          title="末頁"
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
