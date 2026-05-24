"use client";

import type { SalesOrderForPrint } from "@/domain/sales-orders";
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
  submitted: "送簽中",
  signed: "已簽約",
  cancelled: "已作廢",
  fulfilled: "已交車",
};

const CONTRACT_TYPE_LABEL: Record<string, string> = {
  new: "新車訂購合約",
  used: "中古車買賣合約",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "現金全額",
  card: "刷卡一次",
  loan: "銀行貸款",
  installment: "分期付款",
};

function fmtMoney(n: number): string {
  return `NT$ ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null): string {
  return d ? d.slice(0, 10).replace(/-/g, "/") : "—";
}

const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "品名 / 說明", align: "left" },
  { header: "數量", width: 50, align: "right" },
  { header: "單價", width: 80, align: "right" },
  { header: "小計", width: 90, align: "right" },
];

export function SalesOrderPrintable({ data }: { data: SalesOrderForPrint }) {
  // 不 auto window.print() — 使用者看完預覽再自己點右上「列印 / 另存 PDF」
  const isUsed = data.contractType === "used";

  // 車輛資訊欄位：依新車 / 中古車切換
  const vehicleItems = isUsed
    ? [
        { label: "廠牌 / 車款", value: data.vehicle.usedBrandModel },
        { label: "年份", value: data.vehicle.usedYear },
        { label: "車牌號碼", value: data.vehicle.usedPlate },
        { label: "排氣量", value: data.vehicle.usedCc },
        { label: "里程數", value: data.vehicle.usedMileage },
        { label: "認證等級", value: data.vehicle.usedCertLevel },
      ]
    : [
        { label: "車款型號", value: data.vehicle.modelName },
        { label: "車身顏色", value: data.vehicle.color },
        { label: "VIN 車身號碼", value: data.vehicle.vin },
        { label: "引擎號碼", value: data.vehicle.engineNo },
      ];

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/sales-order/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="銷售訂單 SALES ORDER"
        docNo={data.orderNo}
        docDate={fmtDate(data.orderDate)}
      >
        {/* 買方（客戶）資訊 */}
        <PrintMetaGrid
          title="買方（客戶）資訊"
          cols={2}
          items={[
            {
              label: "客戶",
              value: data.customer.code
                ? `${data.customer.code} ${data.customer.name}`
                : data.customer.name,
            },
            { label: "聯絡電話", value: data.customer.phone },
            { label: "Email", value: data.customer.email },
            { label: "統一編號", value: data.customer.taxId },
            { label: "身分證字號", value: data.customer.nationalId },
            { label: "地址", value: data.customer.address },
          ]}
        />

        {/* 訂單基本資料 */}
        <PrintMetaGrid
          title="訂單資訊"
          cols={3}
          items={[
            {
              label: "合約類型",
              value: CONTRACT_TYPE_LABEL[data.contractType] ?? data.contractType,
            },
            { label: "訂單日期", value: fmtDate(data.orderDate) },
            { label: "預計交車", value: fmtDate(data.deliveryDate) },
            {
              label: "付款方式",
              value: data.paymentMethod
                ? PAYMENT_METHOD_LABEL[data.paymentMethod] ?? data.paymentMethod
                : null,
            },
            { label: "尾款日期", value: fmtDate(data.finalPaymentDate) },
            { label: "過戶方式", value: data.transferBy },
            { label: "業務員", value: data.rsName },
            {
              label: "狀態",
              value: STATUS_LABEL[data.status] ?? data.status,
            },
            {
              label: "簽約時間",
              value: data.signedAt ? fmtDate(data.signedAt) : null,
            },
          ]}
        />

        {/* 車輛資訊 */}
        <PrintMetaGrid
          title={isUsed ? "中古車輛資訊" : "新車輛資訊"}
          cols={2}
          items={vehicleItems}
        />

        {/* 明細 */}
        <PrintTable
          title="交易明細"
          columns={COLUMNS}
          rows={data.lines.map((l) => [
            l.lineNo,
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
            Number(l.qty).toLocaleString(),
            fmtMoney(l.unitPrice),
            fmtMoney(l.total),
          ])}
        />

        {/* 金額總計 */}
        <PrintTotals
          items={[
            ...(data.downPayment != null
              ? [{ label: "訂金 / 頭期款", value: fmtMoney(data.downPayment) }]
              : []),
            ...(data.finalPayment != null
              ? [{ label: "尾款", value: fmtMoney(data.finalPayment) }]
              : []),
          ]}
          grandTotal={{
            label: "成交總額",
            value: fmtMoney(data.totalAmount),
          }}
        />

        {/* 特別約定事項 */}
        {data.specialNotes && (
          <div className="print-notes">
            <strong>特別約定事項</strong>
            {"\n"}
            {data.specialNotes}
          </div>
        )}

        {/* 中古車況註記 */}
        {isUsed && data.conditionNotes && (
          <div className="print-notes">
            <strong>車況註記</strong>
            {"\n"}
            {data.conditionNotes}
          </div>
        )}

        {/* 簽核欄 */}
        <PrintSignatures roles={["業務員", "業務主管", "客戶簽收"]} />
      </PrintShell>
    </>
  );
}
