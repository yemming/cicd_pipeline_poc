import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  render?: (row: T) => ReactNode;
  className?: string;
};

/** 通用 parts 列表 — 沿用 modern shell 配色,給 setup / list 頁批量用。 */
export function PartsTable<T>({
  columns,
  rows,
  emptyText = "尚無資料",
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  rowKey?: (row: T, idx: number) => string | number;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[700px]">
          <thead className="bg-[#FAFAF9] text-[10px] text-[#6B6A68] uppercase tracking-wide">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`py-2 px-3 font-semibold ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"
                  }`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-[#9A9890]">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={rowKey ? rowKey(row, idx) : (row as { id?: string | number }).id ?? idx}
                  className="border-t border-[#F5F5F4] hover:bg-[#FAFAF9]"
                >
                  {columns.map((c) => {
                    const content = c.render
                      ? c.render(row)
                      : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? "—";
                    return (
                      <td
                        key={c.key}
                        className={`py-2 px-3 ${
                          c.align === "right"
                            ? "text-right"
                            : c.align === "center"
                              ? "text-center"
                              : "text-left"
                        } ${c.className ?? ""}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({
  label,
  color,
}: {
  label: string;
  color: "green" | "blue" | "purple" | "amber" | "red" | "gray";
}) {
  const map: Record<string, string> = {
    green: "bg-[#E8F5F0] text-[#0F6E56]",
    blue: "bg-[#EBF3FF] text-[#185FA5]",
    purple: "bg-[#F0EEFF] text-[#7F77DD]",
    amber: "bg-[#FDF3E3] text-[#854F0B]",
    red: "bg-[#FDECEA] text-[#CC0000]",
    gray: "bg-[#F5F5F4] text-[#6B6A68]",
  };
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${map[color]}`}
    >
      {label}
    </span>
  );
}

export function ComingSoonNote({ feature }: { feature: string }) {
  return (
    <div className="text-[11px] text-[#854F0B] bg-[#FFF9F0] border border-[#FDF3E3] rounded px-2 py-1.5 inline-block">
      💡 {feature} 將於下個 sprint 開放編輯
    </div>
  );
}
