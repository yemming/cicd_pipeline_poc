"use client";

import type { PurchaseOrderForPrint } from "@/domain/orders";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  approved: "已核准",
  partial_received: "部分入庫",
  received: "已入庫",
  cancelled: "已取消",
};

const PURCHASE_TYPE_LABEL: Record<string, string> = {
  planned: "計畫採購",
  replenish: "補貨採購",
  emergency: "緊急採購",
  promotional: "促銷採購",
};

function fmtMoney(n: number, currency = "TWD"): string {
  const prefix = currency === "TWD" ? "NT$ " : `${currency} `;
  return `${prefix}${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 90, align: "left" },
  { header: "品名 / 說明", align: "left" },
  { header: "單位", width: 40, align: "center" },
  { header: "數量", width: 50, align: "right" },
  { header: "單價", width: 70, align: "right" },
  { header: "未稅小計", width: 80, align: "right" },
  { header: "稅額", width: 60, align: "right" },
  { header: "含稅小計", width: 80, align: "right" },
];

export function PurchaseOrderPrintable({
  data,
}: {
  data: PurchaseOrderForPrint;
}) {
  // 不 auto window.print() — 使用者看完預覽再自己點右上「列印 / 另存 PDF」
  const currency = data.currency ?? "TWD";

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/purchase-order/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="採購單 PURCHASE ORDER"
        docNo={data.poNo}
        docDate={fmtDate(data.poDate)}
      >
        {/* 供應商 / 收貨地 */}
        <PrintMetaGrid
          title="供應商 / 收貨資訊"
          cols={2}
          items={[
            {
              label: "供應商",
              value: data.vendor.code
                ? `${data.vendor.code} ${data.vendor.name}`
                : data.vendor.name,
            },
            { label: "聯絡人", value: data.vendor.contact },
            { label: "電話", value: data.vendor.phone },
            { label: "統一編號", value: data.vendor.taxId },
            { label: "供應商地址", value: data.vendor.address },
            { label: "付款條件", value: data.vendor.paymentTerms },
            { label: "收貨倉庫", value: data.shipTo.name },
            { label: "收貨地址", value: data.shipTo.address },
          ]}
        />

        {/* 採購基本資料 */}
        <PrintMetaGrid
          title="採購資訊"
          cols={3}
          items={[
            { label: "採購日期", value: fmtDate(data.poDate) },
            { label: "預計到貨", value: fmtDate(data.etaDate) },
            {
              label: "採購類型",
              value: data.purchaseType
                ? PURCHASE_TYPE_LABEL[data.purchaseType] ?? data.purchaseType
                : null,
            },
            {
              label: "幣別",
              value:
                currency === "TWD"
                  ? "新台幣 TWD"
                  : `${currency} (匯率 ${data.exchangeRate})`,
            },
            { label: "請購單號", value: data.sourceReqNo },
            {
              label: "狀態",
              value: STATUS_LABEL[data.status] ?? data.status,
            },
            { label: "開立人員", value: data.createdByName },
            { label: "核准人員", value: data.approvedByName },
            { label: "核准時間", value: fmtDate(data.approvedAt?.slice(0, 10) ?? null) },
          ]}
        />

        {/* 明細 */}
        <PrintTable
          title="採購明細"
          columns={COLUMNS}
          rows={data.lines.map((l) => [
            l.lineNo,
            l.itemCode ?? "—",
            <div key="name">
              <div>{l.itemName}</div>
              {l.notes && (
                <div
                  style={{
                    color: "#5A5955",
                    fontSize: "9pt",
                    marginTop: "2pt",
                  }}
                >
                  備註：{l.notes}
                </div>
              )}
            </div>,
            l.uom ?? "—",
            Number(l.qty).toLocaleString(),
            fmtMoney(l.unitPrice, currency),
            fmtMoney(l.pretax, currency),
            fmtMoney(l.tax, currency),
            fmtMoney(l.total, currency),
          ])}
        />

        {/* 金額總計 */}
        <PrintTotals
          items={[
            { label: "未稅總額", value: fmtMoney(data.amountPretax, currency) },
            { label: "稅額", value: fmtMoney(data.amountTax, currency) },
          ]}
          grandTotal={{
            label: "含稅總計",
            value: fmtMoney(data.amountTotal, currency),
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
        <PrintSignatures
          roles={["請購人", "採購主管", "財務", "供應商簽收"]}
        />
      </PrintShell>
    </>
  );
}
