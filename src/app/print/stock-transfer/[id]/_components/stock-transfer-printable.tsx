"use client";

import type { TransferForPrint } from "@/domain/transfers";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  in_transit: "在途中",
  partial: "部分到貨",
  received: "已收貨",
  cancelled: "已取消",
  closed: "已結案",
};

const TRANSFER_TYPE_LABEL: Record<string, string> = {
  inter_store: "跨店調撥",
  intra_store: "店內調撥",
  warranty_to_temp: "保固暫存",
  consignment_to_main: "寄售轉主倉",
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

// 無金額單據：明細只列調撥量 / 已收數量，省略單價/小計欄
const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 100, align: "left" },
  { header: "品名 / 說明", align: "left" },
  { header: "規格", width: 90, align: "left" },
  { header: "單位", width: 40, align: "center" },
  { header: "調撥量", width: 60, align: "right" },
  { header: "已收數量", width: 70, align: "right" },
];

export function StockTransferPrintable({
  data,
}: {
  data: TransferForPrint;
}) {
  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/stock-transfer/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="調撥單 STOCK TRANSFER"
        docNo={data.trNo}
        docDate={fmtDate(data.shipDate)}
      >
        {/* 出庫倉 / 入庫倉 */}
        <PrintMetaGrid
          title="出庫倉 / 入庫倉資訊"
          cols={2}
          items={[
            {
              label: "出庫倉",
              value: data.fromWarehouse.code
                ? `${data.fromWarehouse.code} ${data.fromWarehouse.name ?? ""}`.trim()
                : data.fromWarehouse.name,
            },
            {
              label: "入庫倉",
              value: data.toWarehouse.code
                ? `${data.toWarehouse.code} ${data.toWarehouse.name ?? ""}`.trim()
                : data.toWarehouse.name,
            },
            { label: "出庫單位", value: data.fromWarehouse.orgName },
            { label: "入庫單位", value: data.toWarehouse.orgName },
            { label: "出庫地址", value: data.fromWarehouse.address },
            { label: "入庫地址", value: data.toWarehouse.address },
          ]}
        />

        {/* 調撥基本資料 */}
        <PrintMetaGrid
          title="調撥資訊"
          cols={3}
          items={[
            { label: "出庫日期", value: fmtDate(data.shipDate) },
            { label: "預計到貨", value: fmtDate(data.expectedArrivalDate) },
            { label: "實際到貨", value: fmtDate(data.actualArrivalDate) },
            {
              label: "調撥類型",
              value: data.transferType
                ? TRANSFER_TYPE_LABEL[data.transferType] ?? data.transferType
                : null,
            },
            {
              label: "狀態",
              value: STATUS_LABEL[data.status] ?? data.status,
            },
            { label: "調撥原因", value: data.reason },
            { label: "運送方式", value: data.logisticsProvider },
            { label: "貨運單號", value: data.logisticsTrackingNo },
            { label: "出庫人員", value: data.shippedByName },
            { label: "出庫時間", value: fmtDateTime(data.shippedAt) },
            { label: "收貨人員", value: data.receivedByName },
            { label: "收貨時間", value: fmtDateTime(data.receivedAt) },
          ]}
        />

        {/* 明細 — 無金額 */}
        <PrintTable
          title="調撥明細"
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
            l.spec ?? "—",
            l.uom ?? "—",
            Number(l.qtyShipped).toLocaleString(),
            Number(l.qtyReceived).toLocaleString(),
          ])}
        />

        {/* 數量合計（無金額；用 print-notes 樣式呈現一行小計） */}
        <div className="print-notes">
          <strong>數量合計</strong>
          {"\n"}
          調撥量 {Number(data.qtyShippedTotal).toLocaleString()}　／　已收數量{" "}
          {Number(data.qtyReceivedTotal).toLocaleString()}
        </div>

        {/* 單頭備註 */}
        {data.notes && (
          <div className="print-notes">
            <strong>備註</strong>
            {"\n"}
            {data.notes}
          </div>
        )}

        {/* 簽核欄 — 調撥單流程：出庫倉 → 在途 → 入庫倉 → 倉管主管 */}
        <PrintSignatures
          roles={["出庫倉", "在途", "入庫倉", "倉管主管"]}
        />
      </PrintShell>
    </>
  );
}
