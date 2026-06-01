"use client";

import type { LandedCostStatementForPrint } from "@/domain/import-shipments";
import {
  COST_TYPE_LABEL,
  ALLOCATION_BASIS_LABEL,
  type AllocationBasis,
} from "@/domain/import-landed-cost.constants";
import {
  PrintShell,
  PrintMetaGrid,
  PrintTable,
  PrintTotals,
  PrintSignatures,
  PrintToolbar,
  type PrintColumn,
} from "@/components/print";

function nt(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}
function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

const POOL_COLUMNS: PrintColumn[] = [
  { header: "費用類別", align: "left" },
  { header: "分攤基礎", width: 90, align: "center" },
  { header: "受款方", width: 110, align: "left" },
  { header: "金額", width: 110, align: "right" },
];

const VEHICLE_COLUMNS: PrintColumn[] = [
  { header: "VIN", width: 120, align: "left" },
  { header: "車型", align: "left" },
  { header: "CIF", width: 90, align: "right" },
  { header: "關稅", width: 80, align: "right" },
  { header: "貨物稅", width: 80, align: "right" },
  { header: "進口費用", width: 90, align: "right" },
  { header: "車型攤提", width: 80, align: "right" },
  { header: "Landed Cost", width: 100, align: "right" },
];

export function LandedCostStatementPrintable({
  data,
}: {
  data: LandedCostStatementForPrint;
}) {
  const s = data.shipment;
  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/landed-cost-statement/${data.id}`} />
      <PrintShell
        brand={data.brand}
        buyer={data.buyer}
        docTitle="進口落地成本結算表 LANDED COST STATEMENT"
        docNo={s.shipment_no}
        docDate={fmtDate(s.customs_clear_date ?? s.eta)}
      >
        <PrintMetaGrid
          title="批次與報關資訊"
          cols={3}
          items={[
            { label: "B/L 提單號", value: s.bl_no },
            { label: "進口報單號", value: s.customs_decl_no },
            { label: "貿易條件", value: s.incoterms },
            { label: "船名 / 航班", value: s.vessel },
            { label: "承攬業者", value: s.forwarder },
            { label: "ETD", value: fmtDate(s.etd) },
            { label: "ETA", value: fmtDate(s.eta) },
            { label: "報關放行日", value: fmtDate(s.customs_clear_date) },
            { label: "CIF 總額", value: s.total_cif == null ? "—" : nt(s.total_cif) },
          ]}
        />

        <PrintTable
          title="費用池明細"
          columns={POOL_COLUMNS}
          rows={data.poolLines.map((l) => [
            COST_TYPE_LABEL[l.cost_type] ?? l.cost_type,
            ALLOCATION_BASIS_LABEL[l.allocation_basis as AllocationBasis] ?? l.allocation_basis,
            l.payee ?? "—",
            nt(l.amount),
          ])}
        />

        <PrintTable
          title="各車輛落地成本分攤"
          columns={VEHICLE_COLUMNS}
          rows={data.vehicles.map((v) => [
            v.vin ?? "—",
            v.model_display_name ?? "—",
            nt(v.cif_value),
            nt(v.customs_duty),
            nt(v.commodity_tax),
            nt(v.import_fees),
            nt(v.model_amortized_cost),
            nt(v.total_cost),
          ])}
        />

        <PrintTotals
          items={[
            { label: "費用池合計", value: nt(data.poolTotal) },
            { label: "CIF 合計", value: nt(data.totals.cif) },
            { label: "關稅合計", value: nt(data.totals.customs_duty) },
            { label: "貨物稅合計", value: nt(data.totals.commodity_tax) },
            { label: "進口費用合計", value: nt(data.totals.import_fees) },
          ]}
          grandTotal={{ label: "落地成本總計", value: nt(data.totals.total_cost) }}
        />

        <PrintSignatures roles={["承辦會計", "財務主管", "採購主管"]} />
      </PrintShell>
    </>
  );
}
