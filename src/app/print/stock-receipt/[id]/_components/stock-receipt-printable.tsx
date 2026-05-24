"use client";

import type { StockReceiptForPrint } from "@/domain/receipts";
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
  completed: "已過帳",
  posted: "已過帳",
  cancelled: "已作廢",
};

const RECEIPT_TYPE_LABEL: Record<string, string> = {
  purchase: "採購入庫",
  transfer: "調撥入庫",
  ro_return: "工單退料入庫",
  warranty_return: "保固退料入庫",
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtQty(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}

function fmtDiff(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toLocaleString()}`;
}

// GRN 通常不印金額（金額在 PO 上）—— 數量導向
const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 90, align: "left" },
  { header: "品名 / 規格", align: "left" },
  { header: "單位", width: 40, align: "center" },
  { header: "應收", width: 50, align: "right" },
  { header: "實收", width: 50, align: "right" },
  { header: "差異", width: 50, align: "right" },
  { header: "儲位", width: 60, align: "center" },
];

export function StockReceiptPrintable({
  data,
}: {
  data: StockReceiptForPrint;
}) {
  const isPurchase = data.receiptType === "purchase";

  // 簽核欄：採購收貨用 spec 指定的三欄；其他類型保留通用版（POC v1 只接 po-grn）
  const signatureRoles = isPurchase
    ? ["收貨人 / 倉管", "驗收主管", "供應商交貨員"]
    : ["收貨人 / 倉管", "驗收主管", "申請人"];

  // 來源單號：採購→PO 單號；其他類型備用
  const sourceDocNo =
    data.sourcePoNo ?? data.sourceGiNo ?? data.sourceTrNo ?? null;
  const sourceDocLabel = data.sourcePoNo
    ? "來源採購單"
    : data.sourceGiNo
      ? "來源領料單"
      : data.sourceTrNo
        ? "來源調撥單"
        : "來源單號";

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/stock-receipt/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="進貨單 GOODS RECEIPT NOTE"
        docNo={data.grNo}
        docDate={fmtDate(data.receiptDate)}
      >
        {/* 供應商 / 收貨倉 */}
        <PrintMetaGrid
          title="供應商 / 收貨資訊"
          cols={2}
          items={[
            {
              label: "供應商",
              value: isPurchase
                ? data.vendor.code
                  ? `${data.vendor.code} ${data.vendor.name}`
                  : data.vendor.name
                : "（非採購來源）",
            },
            { label: "聯絡人", value: isPurchase ? data.vendor.contact : null },
            { label: "電話", value: isPurchase ? data.vendor.phone : null },
            { label: "統一編號", value: isPurchase ? data.vendor.taxId : null },
            {
              label: "供應商地址",
              value: isPurchase ? data.vendor.address : null,
            },
            {
              label: "付款條件",
              value: isPurchase ? data.vendor.paymentTerms : null,
            },
            { label: "收貨倉庫", value: data.shipTo.name },
            { label: "收貨地址", value: data.shipTo.address },
          ]}
        />

        {/* 進貨基本資料 */}
        <PrintMetaGrid
          title="進貨資訊"
          cols={3}
          items={[
            {
              label: "進貨類別",
              value:
                RECEIPT_TYPE_LABEL[data.receiptType] ?? data.receiptType,
            },
            { label: "實際收貨日期", value: fmtDate(data.receiptDate) },
            { label: sourceDocLabel, value: sourceDocNo },
            {
              label: "狀態",
              value: STATUS_LABEL[data.status] ?? data.status,
            },
            { label: "過帳人員", value: data.postedByName },
            {
              label: "過帳時間",
              value: fmtDate(data.postedAt?.slice(0, 10) ?? null),
            },
          ]}
        />

        {/* 明細 — 數量導向（應收 / 實收 / 差異） */}
        <PrintTable
          title="收貨明細"
          columns={COLUMNS}
          rows={data.lines.map((l) => [
            l.lineNo,
            l.itemCode ?? "—",
            <div key="name">
              <div>{l.itemName}</div>
              {l.spec && (
                <div
                  style={{
                    color: "#5A5955",
                    fontSize: "9pt",
                    marginTop: "2pt",
                  }}
                >
                  規格：{l.spec}
                </div>
              )}
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
            fmtQty(l.qtyOrdered),
            fmtQty(l.qtyReceived),
            <span
              key="diff"
              style={{
                color:
                  l.qtyDiff === null || l.qtyDiff === 0
                    ? "#2C2C2A"
                    : l.qtyDiff < 0
                      ? "#CC0000"
                      : "#3B6D11",
              }}
            >
              {fmtDiff(l.qtyDiff)}
            </span>,
            l.binLabel ?? "—",
          ])}
        />

        {/* 數量小結 — 不印金額（金額看採購單） */}
        <div
          style={{
            marginTop: "8pt",
            padding: "6pt 10pt",
            border: "1px solid #EEECE6",
            borderRadius: "4pt",
            fontSize: "10pt",
            display: "flex",
            justifyContent: "flex-end",
            gap: "24pt",
          }}
        >
          <div>
            <span style={{ color: "#5A5955" }}>應收總數：</span>
            <strong>{fmtQty(data.totalQtyOrdered)}</strong>
          </div>
          <div>
            <span style={{ color: "#5A5955" }}>實收總數：</span>
            <strong>{fmtQty(data.totalQtyReceived)}</strong>
          </div>
          {data.totalQtyOrdered !== null && (
            <div>
              <span style={{ color: "#5A5955" }}>差異：</span>
              <strong
                style={{
                  color:
                    data.totalQtyReceived - data.totalQtyOrdered === 0
                      ? "#2C2C2A"
                      : data.totalQtyReceived - data.totalQtyOrdered < 0
                        ? "#CC0000"
                        : "#3B6D11",
                }}
              >
                {fmtDiff(data.totalQtyReceived - data.totalQtyOrdered)}
              </strong>
            </div>
          )}
        </div>

        {/* 單頭備註 */}
        {data.notes && (
          <div className="print-notes">
            <strong>驗收備註</strong>
            {"\n"}
            {data.notes}
          </div>
        )}

        {/* 簽核欄 */}
        <PrintSignatures roles={signatureRoles} />
      </PrintShell>
    </>
  );
}
