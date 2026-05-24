import type { ReactNode } from "react";

export type PrintMetaItem = {
  label: string;
  value: ReactNode;
};

/**
 * KV grid — 上方放單頭的「供應商 / 收貨倉 / 業務員 / 付款條件」之類成對欄位。
 * cols 預設 2（A4 上常用）；資料多再開 3 / 4。
 */
export function PrintMetaGrid({
  title,
  cols = 2,
  items,
}: {
  title?: string;
  cols?: 2 | 3 | 4;
  items: PrintMetaItem[];
}) {
  return (
    <section className="print-meta-grid-wrapper">
      {title && <h3 className="print-section-title">{title}</h3>}
      <div className={`print-meta-grid print-meta-grid-cols-${cols}`}>
        {items.map((it, i) => (
          <div key={i} className="print-meta-pair">
            <div className="print-meta-label">{it.label}</div>
            <div className="print-meta-value">
              {it.value === null || it.value === undefined || it.value === ""
                ? "—"
                : it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
