"use client";

import { useMemo, useState } from "react";

export type PickerColumn<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  width?: number;
};

export function HandcardPickerModal<T>({
  open,
  title,
  description,
  rows,
  columns,
  rowKey,
  searchableText,
  onPick,
  onClose,
  searchPlaceholder = "輸入姓名 / 電話搜尋",
  emptyMessage = "找不到符合的資料",
}: {
  open: boolean;
  title: string;
  description?: string;
  rows: T[];
  columns: PickerColumn<T>[];
  rowKey: (row: T) => string;
  searchableText: (row: T) => string;
  onPick: (row: T) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => searchableText(r).toLowerCase().includes(t));
  }, [rows, q, searchableText]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
            {description && (
              <p className="text-[11.5px] text-[#9A9890] mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full hover:bg-[#F8F7F4] text-[#5A5955] text-lg leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-[#9A9890]">
              {emptyMessage}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#F8F7F4] sticky top-0">
                <tr>
                  {columns.map((c, i) => (
                    <th
                      key={i}
                      className="text-left px-3 py-2 text-[11px] font-medium text-[#9A9890] border-b border-[#EEECE6]"
                      style={c.width ? { width: c.width } : undefined}
                    >
                      {c.header}
                    </th>
                  ))}
                  <th className="w-[80px] border-b border-[#EEECE6]" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={rowKey(r)}
                    className="border-b border-[#F2F2F2] hover:bg-[#F8F7F4] cursor-pointer"
                    onClick={() => onPick(r)}
                  >
                    {columns.map((c, i) => (
                      <td key={i} className="px-3 py-2 text-[12px] text-[#2C2C2A] align-top">
                        {c.cell(r)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right align-top">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPick(r);
                        }}
                        className="h-[24px] px-2.5 rounded text-[11px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                      >
                        選用
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className="px-5 py-2.5 border-t border-[#EEECE6] flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#9A9890]">
            共 {filtered.length} 筆{rows.length > filtered.length ? ` / 全部 ${rows.length} 筆` : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[28px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
