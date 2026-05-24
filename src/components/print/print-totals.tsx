import type { ReactNode } from "react";

export type PrintTotalItem = {
  label: string;
  value: ReactNode;
};

/**
 * 金額小計區 — 右靠齊，最後一列 (grandTotal) 加雙底線、字級放大。
 */
export function PrintTotals({
  items,
  grandTotal,
}: {
  items: PrintTotalItem[];
  grandTotal: PrintTotalItem;
}) {
  return (
    <section className="print-totals keep-together">
      <table className="print-totals-table">
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="print-totals-label">{it.label}</td>
              <td className="print-totals-value">{it.value}</td>
            </tr>
          ))}
          <tr className="print-grand-total-row">
            <td className="print-totals-label print-grand-total">
              {grandTotal.label}
            </td>
            <td className="print-totals-value print-grand-total">
              {grandTotal.value}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
