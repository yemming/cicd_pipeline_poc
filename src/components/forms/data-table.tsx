import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  className?: string;
};

/**
 * 共用 DataTable：list 頁的標準表格。
 *
 * 設計原則（per CLAUDE.md「不過度工程」）：
 *   - 不做 client-side sort / filter / virtual scroll（用到再加）
 *   - pagination 由呼叫端傳 page/total/onPage（server-side range 查詢）
 *   - 純 server component 友好（不強制 client）
 *
 * 用法：
 *   <DataTable
 *     rows={items}
 *     getKey={(i) => i.id}
 *     columns={[
 *       { key: 'code', header: '料號', cell: (i) => i.code },
 *       { key: 'name', header: '品名', cell: (i) => i.name },
 *     ]}
 *   />
 */
export function DataTable<T>({
  rows,
  columns,
  getKey,
  empty = "尚無資料",
  rowHref,
  className = "",
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getKey: (row: T) => string;
  empty?: ReactNode;
  rowHref?: (row: T) => string | undefined;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className={`bg-white border border-[#DFE1E6] rounded-md px-6 py-12 text-center text-[14px] text-[#6B778C] ${className}`}
      >
        {empty}
      </div>
    );
  }

  return (
    <div className={`bg-white border border-[#DFE1E6] rounded-md overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px] text-[#172B4D]">
          <thead className="bg-[#F4F5F7] border-b border-[#DFE1E6]">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-4 py-2.5 font-semibold text-[12px] uppercase tracking-wide text-[#42526E] ${
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                        ? "text-center"
                        : "text-left"
                  } ${c.className ?? ""}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={getKey(row)}
                  className={`border-b last:border-b-0 border-[#F4F5F7] hover:bg-[#FAFBFC] ${
                    href ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 align-middle ${
                        c.align === "right"
                          ? "text-right"
                          : c.align === "center"
                            ? "text-center"
                            : "text-left"
                      } ${c.className ?? ""}`}
                    >
                      {href ? (
                        // eslint-disable-next-line @next/next/no-html-link-for-pages
                        <a href={href} className="block -m-2 px-2 py-2 hover:no-underline">
                          {c.cell(row)}
                        </a>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
