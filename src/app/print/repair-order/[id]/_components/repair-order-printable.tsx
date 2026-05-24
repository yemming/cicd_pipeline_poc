"use client";

import type { RepairOrderForPrint } from "@/domain/repair-orders";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

function fmtMoney(n: number): string {
  return `NT$ ${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// 工資項欄位（按 LU 計價）
const LABOR_COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "工項名稱", align: "left" },
  { header: "LU", width: 50, align: "right" },
  { header: "單價 / LU", width: 80, align: "right" },
  { header: "金額", width: 90, align: "right" },
  { header: "保固", width: 40, align: "center" },
];

// 零件項欄位
const PART_COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "料號", width: 100, align: "left" },
  { header: "品名 / 說明", align: "left" },
  { header: "數量", width: 50, align: "right" },
  { header: "單價", width: 80, align: "right" },
  { header: "金額", width: 90, align: "right" },
  { header: "保固", width: 40, align: "center" },
];

export function RepairOrderPrintable({
  data,
}: {
  data: RepairOrderForPrint;
}) {
  const hasLabor = data.laborLines.length > 0;
  const hasParts = data.partLines.length > 0;

  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/repair-order/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="維修工單 REPAIR ORDER"
        docNo={data.roCode}
        docDate={fmtDate(data.issueDate)}
      >
        {/* 客戶 / 車輛 */}
        <PrintMetaGrid
          title="車主 / 車輛資訊"
          cols={2}
          items={[
            { label: "車主姓名", value: data.customer.name },
            { label: "聯絡電話", value: data.customer.phone },
            { label: "電子郵件", value: data.customer.email },
            { label: "通訊地址", value: data.customer.address },
            { label: "車牌號碼", value: data.vehicle.licensePlate },
            { label: "車型", value: data.vehicle.modelName },
            { label: "車身號碼 (VIN)", value: data.vehicle.vin },
            { label: "引擎號碼", value: data.vehicle.engineNo },
            { label: "車身顏色", value: data.vehicle.color },
            {
              label: "出廠年份",
              value: data.vehicle.manufacturedYear
                ? String(data.vehicle.manufacturedYear)
                : null,
            },
            {
              label: "現有里程",
              value:
                data.vehicle.currentMileage != null
                  ? `${data.vehicle.currentMileage.toLocaleString()} km`
                  : null,
            },
            { label: "保固到期", value: fmtDate(data.vehicle.warrantyUntil) },
          ]}
        />

        {/* 工單資訊 */}
        <PrintMetaGrid
          title="工單資訊"
          cols={3}
          items={[
            { label: "報修日期", value: fmtDate(data.issueDate) },
            { label: "開單時間", value: fmtDateTime(data.openedAt) },
            { label: "預計完工", value: fmtDate(data.estimatedCompletion) },
            { label: "實際完工", value: fmtDateTime(data.closedAt) },
            { label: "進廠里程", value: data.mileageIn != null ? `${data.mileageIn.toLocaleString()} km` : null },
            { label: "工單狀態", value: data.status },
            {
              label: "工單分類",
              value: `${data.prefixP1}-${data.prefixP2}`,
            },
            { label: "服務顧問 (SA)", value: data.saName },
            {
              label: "主修技師",
              value: data.leadTechnicianName
                ? data.leadTechnicianCode
                  ? `${data.leadTechnicianCode} ${data.leadTechnicianName}`
                  : data.leadTechnicianName
                : null,
            },
            { label: "服務據點", value: data.workshop.name },
            { label: "服務點地址", value: data.workshop.address },
            { label: "車主聯絡電話", value: data.customer.phone },
          ]}
        />

        {/* 客訴 / 故障描述 */}
        {data.customerComplaint && (
          <div className="print-notes">
            <strong>客戶反應 / 故障描述</strong>
            {"\n"}
            {data.customerComplaint}
          </div>
        )}

        {/* 工資明細 */}
        {hasLabor && (
          <PrintTable
            title="工資項目 (Labor)"
            columns={LABOR_COLUMNS}
            rows={data.laborLines.map((l) => [
              l.lineNo,
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
              Number(l.units).toFixed(1),
              fmtMoney(l.unitPrice),
              fmtMoney(l.amount),
              l.isWarranty ? "✓" : "—",
            ])}
          />
        )}

        {/* 零件明細 */}
        {hasParts && (
          <PrintTable
            title="零件項目 (Parts)"
            columns={PART_COLUMNS}
            rows={data.partLines.map((l) => [
              l.lineNo,
              l.code ?? "—",
              l.name,
              Number(l.qty).toLocaleString(),
              fmtMoney(l.unitPrice),
              fmtMoney(l.amount),
              l.isWarranty ? "✓" : "—",
            ])}
          />
        )}

        {/* 無明細時提示一行（避免空白頁） */}
        {!hasLabor && !hasParts && (
          <div
            style={{
              fontSize: "10pt",
              color: "#9A9890",
              textAlign: "center",
              padding: "12pt 0",
            }}
          >
            （本工單尚無工項 / 零件明細）
          </div>
        )}

        {/* 總計 */}
        <PrintTotals
          items={[
            { label: "工資小計", value: fmtMoney(data.amountLaborSubtotal) },
            { label: "零件小計", value: fmtMoney(data.amountPartsSubtotal) },
            { label: "未稅小計", value: fmtMoney(data.amountSubtotal) },
            ...(data.discountPct > 0
              ? [
                  {
                    label: `折扣 ${data.discountPct}%`,
                    value: `-${fmtMoney(
                      Math.round(
                        data.amountSubtotal * (data.discountPct / 100),
                      ),
                    )}`,
                  },
                ]
              : []),
            { label: "稅額 (5%)", value: fmtMoney(data.amountTax) },
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
        <PrintSignatures roles={["服務顧問 SA", "技師", "車主簽收"]} />
      </PrintShell>
    </>
  );
}
