"use client";

import type { IssueForPrint } from "@/domain/issues";
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
  posted: "已過帳",
  completed: "已過帳",
  cancelled: "已作廢",
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(
    dt.getDate(),
  ).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(
    dt.getMinutes(),
  ).padStart(2, "0")}`;
}

const COLUMNS_NO_AMOUNT: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 100, align: "left" },
  { header: "品名 / 規格", align: "left" },
  { header: "倉位", width: 70, align: "left" },
  { header: "單位", width: 40, align: "center" },
  { header: "領用量", width: 60, align: "right" },
  { header: "已發數量", width: 60, align: "right" },
  { header: "備註", width: 110, align: "left" },
];

const COLUMNS_WITH_AMOUNT: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 90, align: "left" },
  { header: "品名 / 規格", align: "left" },
  { header: "倉位", width: 60, align: "left" },
  { header: "單位", width: 40, align: "center" },
  { header: "數量", width: 50, align: "right" },
  { header: "單價", width: 70, align: "right" },
  { header: "小計", width: 80, align: "right" },
];

export function StockIssuePrintable({ data }: { data: IssueForPrint }) {
  // 不 auto window.print() — 預覽歸預覽、列印歸列印
  const showAmount = data.hasAmount;

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/stock-issue/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle={data.docTitle}
        docNo={data.giNo}
        docDate={fmtDate(data.issueDate)}
      >
        {/* 申請單位 / 出庫倉 */}
        <PrintMetaGrid
          title="申請單位 / 出庫倉資訊"
          cols={2}
          items={[
            { label: "申請部門", value: data.applicant.department },
            { label: "來源單號", value: data.applicant.sourceDocNo },
            {
              label: "客戶 / 車主",
              value: data.applicant.customerName
                ? data.applicant.customerCode
                  ? `${data.applicant.customerCode} ${data.applicant.customerName}`
                  : data.applicant.customerName
                : null,
            },
            { label: "客戶電話", value: data.applicant.customerPhone },
            {
              label: "出庫倉庫",
              value: data.warehouse.code
                ? `${data.warehouse.code} ${data.warehouse.name}`
                : data.warehouse.name,
            },
            { label: "倉庫地址", value: data.warehouse.address },
          ]}
        />

        {/* 出庫資訊 */}
        <PrintMetaGrid
          title="出庫資訊"
          cols={3}
          items={[
            { label: "出庫日期", value: fmtDate(data.issueDate) },
            {
              label: "狀態",
              value: STATUS_LABEL[data.status] ?? data.status,
            },
            { label: "工單號 / 來源", value: data.applicant.sourceDocNo },
            { label: "過帳人員", value: data.postedByName },
            {
              label: "過帳時間",
              value: data.postedAt ? fmtDateTime(data.postedAt) : null,
            },
            {
              label: "明細筆數 / 總數量",
              value: `${data.lines.length} 筆 / ${data.qtyTotal} 件`,
            },
          ]}
        />

        {/* 明細 */}
        <PrintTable
          title="領料明細"
          columns={showAmount ? COLUMNS_WITH_AMOUNT : COLUMNS_NO_AMOUNT}
          rows={data.lines.map((l) =>
            showAmount
              ? [
                  l.lineNo,
                  l.itemCode ?? "—",
                  <div key="name">
                    <div>{l.itemName}</div>
                    {(l.serialNo || l.batchNo || l.notes) && (
                      <div
                        style={{
                          color: "#5A5955",
                          fontSize: "9pt",
                          marginTop: "2pt",
                        }}
                      >
                        {l.serialNo ? `S/N：${l.serialNo}` : null}
                        {l.batchNo
                          ? `${l.serialNo ? " · " : ""}Batch：${l.batchNo}`
                          : null}
                        {l.notes
                          ? `${l.serialNo || l.batchNo ? " · " : ""}備註：${l.notes}`
                          : null}
                      </div>
                    )}
                  </div>,
                  l.binLabel ?? "—",
                  l.uom,
                  Number(l.qtyIssued).toLocaleString(),
                  fmtMoney(l.unitPrice ?? l.unitCost),
                  fmtMoney(l.lineAmount),
                ]
              : [
                  l.lineNo,
                  l.itemCode ?? "—",
                  <div key="name">
                    <div>{l.itemName}</div>
                    {(l.serialNo || l.batchNo) && (
                      <div
                        style={{
                          color: "#5A5955",
                          fontSize: "9pt",
                          marginTop: "2pt",
                        }}
                      >
                        {l.serialNo ? `S/N：${l.serialNo}` : null}
                        {l.batchNo
                          ? `${l.serialNo ? " · " : ""}Batch：${l.batchNo}`
                          : null}
                      </div>
                    )}
                  </div>,
                  l.binLabel ?? "—",
                  l.uom,
                  Number(l.qtyIssued).toLocaleString(),
                  Number(l.qtyIssued).toLocaleString(),
                  l.notes ?? "—",
                ],
          )}
        />

        {/* 金額總計（僅 internal_sale 有金額才印） */}
        {showAmount ? (
          <PrintTotals
            items={[
              {
                label: "明細筆數",
                value: `${data.lines.length} 筆`,
              },
              {
                label: "出庫總數量",
                value: `${data.qtyTotal} 件`,
              },
            ]}
            grandTotal={{
              label: "出庫總金額",
              value: fmtMoney(data.amountTotal),
            }}
          />
        ) : (
          <PrintTotals
            items={[
              {
                label: "明細筆數",
                value: `${data.lines.length} 筆`,
              },
            ]}
            grandTotal={{
              label: "出庫總數量",
              value: `${data.qtyTotal} 件`,
            }}
          />
        )}

        {/* 單頭備註 */}
        {data.notes && (
          <div className="print-notes">
            <strong>備註</strong>
            {"\n"}
            {data.notes}
          </div>
        )}

        {/* 簽核欄（依 type 切換） */}
        <PrintSignatures roles={data.signatureRoles} />
      </PrintShell>
    </>
  );
}
