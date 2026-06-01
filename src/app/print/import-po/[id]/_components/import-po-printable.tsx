"use client";

import type { ImportPOForPrint } from "@/domain/vehicle-purchase-orders";
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
  submitted: "已送出",
  in_transit: "在途中",
  arrived: "到港完成",
  closed: "已結案",
  cancelled: "已取消",
};

function nt(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

const COLUMNS: PrintColumn[] = [
  { header: "項次", width: 34, align: "center" },
  { header: "車系 / 車型", align: "left" },
  { header: "顏色", width: 80, align: "left" },
  { header: "數量", width: 50, align: "right" },
  { header: "單價（未稅）", width: 100, align: "right" },
  { header: "小計", width: 110, align: "right" },
];

export function ImportPoPrintable({ data }: { data: ImportPOForPrint }) {
  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/import-po/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="進口採購單 IMPORT PURCHASE ORDER"
        docNo={data.po_no}
        docDate={fmtDate(data.order_date)}
      >
        <PrintMetaGrid
          title="採購與進口資訊"
          cols={3}
          items={[
            { label: "供應商 / 原廠", value: data.supplier_name },
            { label: "PI 號（預估發票）", value: data.pi_no },
            { label: "貿易條件 Incoterms", value: data.incoterms },
            { label: "原產國", value: data.origin_country },
            { label: "採購日期", value: fmtDate(data.order_date) },
            { label: "預計到港", value: fmtDate(data.expected_arrival) },
            {
              label: "幣別",
              value:
                data.currency === "TWD" || !data.currency
                  ? "新台幣 TWD"
                  : `${data.currency}（匯率 ${data.exchange_rate ?? "—"}）`,
            },
            { label: "狀態", value: STATUS_LABEL[data.status] ?? data.status },
          ]}
        />

        <PrintTable
          title="採購車款明細"
          columns={COLUMNS}
          rows={data.lines.map((l) => [
            l.seq ?? "",
            l.model,
            l.color ?? "—",
            l.qty.toLocaleString(),
            nt(l.unit_price_twd),
            nt(l.subtotal),
          ])}
        />

        <PrintTotals
          items={[
            { label: `訂金${data.deposit_ratio != null ? `（${(data.deposit_ratio * 100).toFixed(0)}%）` : ""}${data.deposit_paid_at ? ` · 已付 ${fmtDate(data.deposit_paid_at)}` : " · 未付"}`, value: nt(data.deposit_amount) },
            { label: `尾款${data.balance_paid_at ? ` · 已付 ${fmtDate(data.balance_paid_at)}` : " · 未付"}`, value: nt(data.balance_amount) },
          ]}
          grandTotal={{ label: "採購總額（未稅）", value: nt(data.total_amount_twd) }}
        />

        {data.notes ? (
          <div className="print-notes">
            <strong>備註</strong>
            {"\n"}
            {data.notes}
          </div>
        ) : null}

        <PrintSignatures roles={["採購人員", "採購主管", "財務", "原廠確認"]} />
      </PrintShell>
    </>
  );
}
