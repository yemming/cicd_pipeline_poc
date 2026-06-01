"use client";

import type { VehicleCostCardForPrint } from "@/domain/import-cost-cards";
import { COST_TYPE_LABEL } from "@/domain/import-landed-cost.constants";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

function nt(n: number | null): string {
  return n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

const STATUS_LABEL: Record<string, string> = {
  in_transit: "在途中",
  in_stock: "在庫",
  pending_pdi: "待 PDI",
  reserved: "已預訂",
  sold: "已售出",
  delivered: "已交車",
};

const BUCKET_LABEL: Record<string, string> = {
  cost_price: "車輛貨款（CIF / 進價）",
  customs_duty: "進口關稅",
  commodity_tax: "貨物稅",
  import_fees: "進口費用（運保稅雜支）",
  model_amortized_cost: "車型攤提",
  import_vat: "進口營業稅（進項，不計入存貨）",
};

const ALLOC_COLUMNS: PrintColumn[] = [
  { header: "費用類別", align: "left" },
  { header: "歸集科目", width: 150, align: "left" },
  { header: "金額", width: 120, align: "right" },
];

export function VehicleCostCardPrintable({
  data,
}: {
  data: VehicleCostCardForPrint;
}) {
  const c = data.card;
  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/vehicle-cost-card/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="車輛成本歸集卡 VEHICLE COST CARD"
        docNo={c.vin ?? data.id.slice(0, 8)}
        docDate={fmtDate(c.cost_frozen_at)}
      >
        <PrintMetaGrid
          title="車輛資訊"
          cols={3}
          items={[
            { label: "車型", value: c.model_display_name },
            { label: "顏色", value: c.color },
            { label: "狀態", value: STATUS_LABEL[c.status] ?? c.status },
            { label: "進口批次", value: c.shipment_no },
            { label: "成本凍結時間", value: c.cost_frozen_at ? fmtDate(c.cost_frozen_at) : "未凍結" },
            { label: "建議售價", value: nt(c.list_price) },
          ]}
        />

        <PrintTable
          title="成本構成（依成本欄）"
          columns={[
            { header: "成本項目", align: "left" },
            { header: "金額", width: 140, align: "right" },
          ]}
          rows={[
            [BUCKET_LABEL.cost_price, nt(c.cost_price)],
            [BUCKET_LABEL.customs_duty, nt(c.customs_duty)],
            [BUCKET_LABEL.commodity_tax, nt(c.commodity_tax)],
            [BUCKET_LABEL.import_fees, nt(c.import_fees)],
            [BUCKET_LABEL.model_amortized_cost, nt(c.model_amortized_cost)],
          ]}
        />

        {c.allocations.length > 0 ? (
          <PrintTable
            title="費用歸集明細（from Landed Cost 分攤）"
            columns={ALLOC_COLUMNS}
            rows={c.allocations.map((a) => [
              COST_TYPE_LABEL[a.cost_type] ?? a.cost_type,
              BUCKET_LABEL[a.bucket] ?? a.bucket,
              nt(a.allocated_amount),
            ])}
          />
        ) : null}

        <PrintTotals
          items={[
            { label: "總成本（Landed Cost）", value: nt(c.total_cost) },
            { label: "建議售價", value: nt(c.list_price) },
            {
              label: `毛利${c.margin_pct != null ? `（${c.margin_pct}%）` : ""}`,
              value: nt(c.gross_margin),
            },
          ]}
          grandTotal={{ label: "車輛總成本", value: nt(c.total_cost) }}
        />

        <PrintSignatures roles={["承辦會計", "財務主管"]} />
      </PrintShell>
    </>
  );
}
