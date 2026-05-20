/**
 * MatrixSelector — row × col 矩陣 checkbox 表。
 *
 * 用途：權限矩陣 / 商品適配 / 通路配置這類 row-col toggle 場景。
 * row header sticky-left、col header sticky-top；checked cell 套 tone bg。
 */

"use client";

import { TONE_CLASSES, cn, type ToneKey } from "./tone";

export interface MatrixSelectorProps {
  rows: { id: string; label: string }[];
  cols: { id: string; label: string }[];
  selected: Record<string, Record<string, boolean>>;
  onChange: (rowId: string, colId: string, value: boolean) => void;
  tone?: ToneKey;
  className?: string;
}

export function MatrixSelector({
  rows,
  cols,
  selected,
  onChange,
  tone = "blue",
  className,
}: MatrixSelectorProps) {
  const t = TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        "relative overflow-auto bg-white border border-tone-gray-100 rounded-md max-h-[480px]",
        className,
      )}
    >
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-20 bg-tone-gray-50 border-b border-r border-tone-gray-100 px-3 py-2 text-left text-[11px] text-tone-gray-500 font-medium"
              style={{ minWidth: 140 }}
            >
              {/* 左上角 */}
            </th>
            {cols.map((c) => (
              <th
                key={c.id}
                className="sticky top-0 z-10 bg-tone-gray-50 border-b border-tone-gray-100 px-3 py-2 text-center text-[11px] text-tone-gray-700 font-semibold whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-tone-gray-50">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white border-b border-r border-tone-gray-100 px-3 py-2 text-left text-[12px] text-tone-gray-700 font-medium whitespace-nowrap"
                style={{ minWidth: 140 }}
              >
                {r.label}
              </th>
              {cols.map((c) => {
                const checked = !!selected[r.id]?.[c.id];
                return (
                  <td
                    key={c.id}
                    className="border-b border-tone-gray-100 text-center p-0"
                  >
                    <button
                      type="button"
                      onClick={() => onChange(r.id, c.id, !checked)}
                      className={cn(
                        "w-full h-9 inline-flex items-center justify-center text-[14px] transition-tone",
                        checked
                          ? cn(t.bg500, "text-white font-semibold")
                          : "bg-white text-tone-gray-500 hover:bg-tone-gray-50",
                      )}
                      aria-pressed={checked}
                      aria-label={`${r.label} × ${c.label} ${checked ? "已勾選" : "未勾選"}`}
                    >
                      {checked ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default MatrixSelector;
