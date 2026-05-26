"use client";

import type { UsedCarEvaluationForPrint } from "@/domain/used-car-evaluations";
import { STATUS_LABELS } from "@/domain/used-car-evaluations";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtDate(d: string | null | undefined): string {
  return d ? d.slice(0, 10).replace(/-/g, "/") : "—";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const GRADE_LABEL: Record<string, string> = {
  S: "S（CPO 認證）",
  A: "A（優良）",
  B: "B（良好）",
  C: "C（普通）",
  D: "D（整備中）",
};

const PRICING_COLUMNS: PrintColumn[] = [
  { header: "項次", width: 36, align: "center" },
  { header: "項目", align: "left" },
  { header: "金額", width: 110, align: "right" },
];

export function UsedCarEvaluationPrintable({
  data,
}: {
  data: UsedCarEvaluationForPrint;
}) {
  // PrintShell 的 buyer 欄位給「賣方」資訊（中古車情境買賣關係相反 — 經銷商收車）
  const buyer = {
    legalName: data.customer.name,
    taxId: null,
    address: null,
    phone: data.customer.phone,
  };

  // pricing_jsonb 拆欄位（key 跟 wizard handleSaveDraft 寫入時對齊）
  const p = data.pricing_jsonb ?? {};
  const pricingRows = [
    { label: "市場參考價", value: asNumber(p.pMarket) },
    { label: "原廠新車牌價", value: asNumber(p.pMsrp) },
    { label: "整備維修費", value: asNumber(p.pRepair), neg: true },
    { label: "板金烤漆費", value: asNumber(p.pPaint), neg: true },
    { label: "輪胎更換費", value: asNumber(p.pTire), neg: true },
    { label: "延長保固費", value: asNumber(p.pWarranty), neg: true },
    { label: "行政成本", value: asNumber(p.pAdmin), neg: true },
    { label: "業務佣金", value: asNumber(p.pComm), neg: true },
    { label: "目標利潤", value: asNumber(p.pProfit), neg: true },
  ].filter((r) => r.value != null);

  const finalNew = asNumber(p.pNew);
  const market = asNumber(p.pMarket) ?? 0;
  const totalCost =
    (asNumber(p.pRepair) ?? 0) +
    (asNumber(p.pPaint) ?? 0) +
    (asNumber(p.pTire) ?? 0) +
    (asNumber(p.pWarranty) ?? 0) +
    (asNumber(p.pAdmin) ?? 0) +
    (asNumber(p.pComm) ?? 0) +
    (asNumber(p.pProfit) ?? 0);
  const suggested = market > 0 ? market - totalCost : null;

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/usedcar-evaluation/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={buyer}
        docTitle="中古車評估鑑價單 USED-CAR EVALUATION"
        docNo={data.eval_no ?? data.id.slice(0, 8)}
        docDate={fmtDate(data.created_at)}
      >
        {/* 賣方 / 評估資訊 */}
        <PrintMetaGrid
          title="評估資訊"
          cols={2}
          items={[
            { label: "賣方", value: data.customer.name },
            { label: "聯絡電話", value: data.customer.phone },
            { label: "鑑價人", value: data.appraiser },
            {
              label: "車況等級",
              value: data.condition_grade
                ? (GRADE_LABEL[data.condition_grade] ?? data.condition_grade)
                : "—",
            },
            { label: "建立日期", value: fmtDate(data.created_at) },
            { label: "單據狀態", value: STATUS_LABELS[data.status] },
          ]}
        />

        {/* 車輛資訊 */}
        <PrintMetaGrid
          title="車輛資訊"
          cols={3}
          items={[
            { label: "廠牌", value: data.vehicle.brand_name },
            { label: "車款", value: data.vehicle.model },
            {
              label: "出廠年份",
              value: data.vehicle.year ? String(data.vehicle.year) : "—",
            },
            { label: "車身號碼 VIN", value: data.vehicle.vin },
            { label: "牌照號碼", value: data.vehicle.license_plate },
            { label: "車身顏色", value: data.vehicle.color },
            { label: "排氣量", value: data.vehicle.displacement },
            {
              label: "里程數",
              value:
                data.vehicle.mileage != null
                  ? `${data.vehicle.mileage.toLocaleString()} km`
                  : "—",
            },
            { label: "收購決定", value: data.decision },
          ]}
        />

        {/* 定價核算（按 wizard 段 D） */}
        {pricingRows.length > 0 && (
          <PrintTable
            title="收購定價核算"
            columns={PRICING_COLUMNS}
            rows={pricingRows.map((r, i) => [
              i + 1,
              r.label,
              r.value != null
                ? `${r.neg ? "- " : ""}${fmtMoney(r.value)}`
                : "—",
            ])}
          />
        )}

        {/* 結論 — 建議收購價 / 給賣方報價 */}
        {(suggested != null || finalNew != null || data.estimated_value != null) && (
          <PrintTotals
            items={[
              ...(market > 0
                ? [{ label: "市場參考價", value: fmtMoney(market) }]
                : []),
              ...(totalCost > 0
                ? [{ label: "整備 + 成本合計", value: `- ${fmtMoney(totalCost)}` }]
                : []),
              ...(suggested != null
                ? [{ label: "建議收購價", value: fmtMoney(suggested) }]
                : []),
              ...(finalNew != null
                ? [{ label: "對外售價", value: fmtMoney(finalNew) }]
                : []),
            ]}
            grandTotal={{
              label: "本單估值",
              value: fmtMoney(data.estimated_value),
            }}
          />
        )}

        {/* 評估結論 */}
        {data.conclusion && (
          <div className="print-notes">
            <strong>評估結論</strong>
            {"\n"}
            {data.conclusion}
          </div>
        )}

        {/* 簽核欄 */}
        <PrintSignatures roles={["鑑價人 RS", "業務主管", "賣方簽收"]} />
      </PrintShell>
    </>
  );
}
