import type { ReactNode } from "react";

export type PrintColumn = {
  header: string;
  /** 欄寬 pt（不傳就靠 flex 平均分） */
  width?: number;
  align?: "left" | "right" | "center";
};

/**
 * 明細表格 — thead 在 @media print 設成 table-header-group，跨頁自動 repeat。
 *
 * 用法：
 *   <PrintTable
 *     columns={[
 *       { header: '項次', width: 32, align: 'center' },
 *       { header: '品名', align: 'left' },
 *       { header: '數量', width: 50, align: 'right' },
 *     ]}
 *     rows={[
 *       [1, '機油濾芯', 10],
 *       [2, '剎車片', 4],
 *     ]}
 *   />
 */
export function PrintTable({
  title,
  columns,
  rows,
}: {
  title?: string;
  columns: PrintColumn[];
  rows: ReactNode[][];
}) {
  return (
    <section>
      {title && <h3 className="print-section-title">{title}</h3>}
      <table className="print-table">
        <colgroup>
          {columns.map((c, i) => (
            <col
              key={i}
              style={c.width ? { width: `${c.width}pt` } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={`print-table-header text-${c.align ?? "left"}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="print-table-cell text-center"
                style={{ color: "#9A9890", padding: "12pt" }}
              >
                （無資料）
              </td>
            </tr>
          ) : (
            rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`print-table-cell text-${columns[ci]?.align ?? "left"}`}
                  >
                    {cell ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
