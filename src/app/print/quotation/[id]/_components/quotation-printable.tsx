"use client";

import type { SalesQuoteForPrint } from "@/domain/sales-quote";
import {
  QUOTE_STATUS_LABELS,
  VEHICLE_KIND_LABELS,
} from "@/domain/sales-quote.constants";
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

const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "分類", width: 70, align: "center" },
  { header: "品項 / 說明", align: "left" },
  { header: "定價", width: 90, align: "right" },
  { header: "報價", width: 100, align: "right" },
];

export function QuotationPrintable({
  data,
}: {
  data: SalesQuoteForPrint;
}) {
  // 不 auto window.print() — 預覽歸預覽、列印歸列印（規格明文禁止）
  const buyer = {
    legalName: data.seller.legalName,
    taxId: data.seller.taxId,
    address: data.seller.address,
    phone: data.seller.phone,
  };

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/quotation/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={buyer}
        docTitle="報價單 QUOTATION"
        docNo={data.quoteNo}
        docDate={fmtDate(data.createdAt)}
      >
        {/* 客戶資訊 */}
        <PrintMetaGrid
          title="客戶資訊"
          cols={2}
          items={[
            {
              label: "客戶姓名",
              value: data.customer.code
                ? `${data.customer.code} ${data.customer.name}`
                : data.customer.name,
            },
            { label: "聯絡電話", value: data.customer.contactPhone },
            { label: "電子郵件", value: data.customer.email },
            { label: "統一編號", value: data.customer.taxId },
            { label: "聯絡地址", value: data.customer.address },
          ]}
        />

        {/* 車輛 / 報價資訊 */}
        <PrintMetaGrid
          title="車輛與報價資訊"
          cols={3}
          items={[
            {
              label: "車種",
              value: VEHICLE_KIND_LABELS[data.vehicleKind] ?? data.vehicleKind,
            },
            {
              label: "車款",
              value:
                data.vehicleKind === "new"
                  ? data.vehicle.modelName
                  : data.vehicle.usedBrandModel ?? data.vehicle.modelName,
            },
            { label: "車系", value: data.vehicle.series },
            {
              label: "排氣量",
              value: data.vehicle.engineCc ? `${data.vehicle.engineCc} c.c.` : null,
            },
            { label: "建議售價", value: fmtMoney(data.vehicle.msrp) },
            { label: "業務員 RS", value: data.rsName },
            {
              label: "報價有效期",
              value: (
                <strong style={{ color: "#1A3A5C" }}>
                  {fmtDate(data.expiresAt)}
                </strong>
              ),
            },
            { label: "預估交期", value: fmtDate(data.estimatedDeliveryDate) },
            {
              label: "狀態",
              value: QUOTE_STATUS_LABELS[data.status] ?? data.status,
            },
          ]}
        />

        {/* 報價明細（從 lines jsonb 拆） */}
        {data.lines.length > 0 ? (
          <PrintTable
            title="報價明細"
            columns={COLUMNS}
            rows={data.lines.map((l) => [
              l.lineNo,
              l.categoryLabel + (l.isGift ? "（贈）" : ""),
              <div key="name">
                <div>{l.name}</div>
                {l.note && (
                  <div
                    style={{
                      color: "#5A5955",
                      fontSize: "9pt",
                      marginTop: "2pt",
                    }}
                  >
                    備註：{l.note}
                  </div>
                )}
              </div>,
              l.listPrice != null ? fmtMoney(l.listPrice) : "—",
              l.isGift ? "贈品" : fmtMoney(l.quotePrice),
            ])}
          />
        ) : null}

        {/* 金額總計 — 車輛 / 加值附加 / 折扣 → 未稅 / 稅 / 含稅 */}
        <PrintTotals
          items={[
            { label: "車輛金額", value: fmtMoney(data.vehicleAmount) },
            { label: "加值附加", value: fmtMoney(data.addonAmount) },
            {
              label: "折扣",
              value:
                data.discountAmount > 0
                  ? `- ${fmtMoney(data.discountAmount)}`
                  : fmtMoney(0),
            },
            { label: "未稅小計", value: fmtMoney(data.amountPretax) },
            { label: "營業稅（5%）", value: fmtMoney(data.amountTax) },
          ]}
          grandTotal={{
            label: "含稅總計",
            value: fmtMoney(data.amountTotal),
          }}
        />

        {/* 單頭備註 */}
        {data.notes && (
          <div className="print-notes">
            <strong>備註</strong>
            {"\n"}
            {data.notes}
          </div>
        )}

        {/* 簽核欄 */}
        <PrintSignatures roles={["業務員 RS", "業務主管", "客戶簽收"]} />
      </PrintShell>
    </>
  );
}
