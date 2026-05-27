"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  OutboundRow,
  OutboundKpi,
  OutboundType,
} from "@/domain/vehicle-outbound";

const BASE = "/sales/inventory/outbound";

const TYPE_LABELS: Record<OutboundType, string> = {
  SALE: "銷售出庫",
  TRANSFER: "調撥出庫",
  DEMO: "試乘/展覽",
  SCRAP: "報廢/下架",
};

function typeChip(t: OutboundType): string {
  switch (t) {
    case "SALE":
      return "bg-[#E8F5F0] text-[#0F6E56]"; // teal
    case "TRANSFER":
      return "bg-[#EAF4FB] text-[#185FA5]"; // blue
    case "DEMO":
      return "bg-[#FDF3E3] text-[#854F0B]"; // amber
    case "SCRAP":
      return "bg-[#FDECEA] text-[#CC0000]"; // red
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function kindChip(kind: "NEW" | "USED"): string {
  return kind === "NEW"
    ? "bg-[#EBF3FF] text-[#1A3A5C]"
    : "bg-[#FDF3E3] text-[#854F0B]";
}

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

export default function OutboundBoard({
  rows,
  kpi,
  filters,
}: {
  rows: OutboundRow[];
  kpi: OutboundKpi;
  filters: { type: OutboundType | ""; month: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fType, setFType] = useState<OutboundType | "">(filters.type);
  const [fMonth, setFMonth] = useState(filters.month);
  const [fQ, setFQ] = useState(filters.q);

  const buildQs = (overrides: { type?: OutboundType | ""; month?: string; q?: string }) => {
    const params = new URLSearchParams();
    const type = overrides.type ?? fType;
    const month = overrides.month ?? fMonth;
    const q = overrides.q ?? fQ;
    if (type) params.set("type", type);
    if (month.trim()) params.set("month", month.trim());
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return qs ? `${BASE}?${qs}` : BASE;
  };

  const submitFilters = () => {
    startTransition(() => router.push(buildQs({})));
  };
  const resetFilters = () => {
    setFType("");
    setFMonth("");
    setFQ("");
    startTransition(() => router.push(BASE));
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<OutboundRow>[] = [
    {
      id: "outbound_no",
      header: "出庫單號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[11.5px] text-[#1A3A5C]">
          {r.outbound_no}
        </span>
      ),
      exportValue: (r) => r.outbound_no,
      sortValue: (r) => r.outbound_no,
    },
    {
      id: "type",
      header: "出庫類型",
      width: 100,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${typeChip(
            r.type,
          )}`}
        >
          {TYPE_LABELS[r.type]}
        </span>
      ),
      exportValue: (r) => TYPE_LABELS[r.type],
      sortValue: (r) => r.type,
    },
    {
      id: "model",
      header: "車型",
      width: 200,
      cell: (r) => <span className="text-[12.5px] font-medium">{r.model}</span>,
      exportValue: (r) => r.model,
      sortValue: (r) => r.model,
    },
    {
      id: "vin_last6",
      header: "VIN末6碼",
      width: 100,
      cell: (r) => <span className="font-mono text-[12px]">{r.vin_last6}</span>,
      exportValue: (r) => r.vin_last6,
      sortValue: (r) => r.vin_last6,
    },
    {
      id: "vehicle_kind",
      header: "車輛類型",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${kindChip(
            r.vehicle_kind,
          )}`}
        >
          {r.vehicle_kind === "NEW" ? "新車" : "中古車"}
        </span>
      ),
      exportValue: (r) => (r.vehicle_kind === "NEW" ? "新車" : "中古車"),
      sortValue: (r) => r.vehicle_kind,
    },
    {
      id: "warehouse",
      header: "出庫倉庫",
      width: 120,
      cell: (r) => <span className="text-[12px]">{r.warehouse ?? "—"}</span>,
      exportValue: (r) => r.warehouse ?? "",
      sortValue: (r) => r.warehouse ?? "",
    },
    {
      id: "target",
      header: "對象/原因",
      width: 160,
      cell: (r) => <span className="text-[12px]">{r.target}</span>,
      exportValue: (r) => r.target,
      sortValue: (r) => r.target,
    },
    {
      id: "outbound_date",
      header: "出庫日期",
      width: 110,
      cell: (r) => <span className="font-mono text-[12px]">{r.outbound_date ?? "—"}</span>,
      exportValue: (r) => r.outbound_date ?? "",
      sortValue: (r) => r.outbound_date ?? "",
    },
    {
      id: "total_cost",
      header: "整車成本",
      width: 130,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px]">{r.total_cost ? fmtNT(r.total_cost) : "—"}</span>
      ),
      exportValue: (r) => r.total_cost ?? "",
      sortValue: (r) => r.total_cost ?? null,
    },
    {
      id: "price",
      header: "售價/備注",
      width: 150,
      align: "right",
      sortable: false,
      cell: (r) =>
        r.price != null ? (
          <div className="text-right">
            <div className="font-mono font-semibold text-[12px]">{fmtNT(r.price)}</div>
            {r.margin != null ? (
              <div
                className={`text-[10.5px] ${
                  r.margin >= 0 ? "text-[#0F6E56]" : "text-[#CC0000]"
                }`}
              >
                毛利 {fmtNT(r.margin)}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[11.5px] text-[#9A9890]">{r.note ?? "—"}</span>
        ),
      exportValue: (r) =>
        r.price != null
          ? r.margin != null
            ? `${r.price}（毛利 ${r.margin}）`
            : String(r.price)
          : r.note ?? "",
    },
  ];

  const kpis = [
    {
      label: "本月出庫台數",
      value: kpi.totalThisMonth,
      sub: "本月合計",
      color: "text-[#0F6E56]",
    },
    {
      label: "銷售出庫",
      value: kpi.saleThisMonth,
      sub: "正常銷售交車",
      color: "text-[#1A3A5C]",
    },
    {
      label: "調撥出庫",
      value: kpi.transferThisMonth,
      sub: "跨倉調撥",
      color: "text-[#854F0B]",
    },
    {
      label: "其他出庫",
      value: kpi.otherThisMonth,
      sub: "展覽 / 試乘 / 報廢",
      color: "text-[#CC0000]",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">出庫管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV06
        </span>
        <span className="text-[12px] text-[#9A9890]">
          各類整車出庫記錄查詢（銷售 / 調撥 / 試乘 / 報廢）・銷售出庫顯示毛利
        </span>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
          >
            <div className="text-[11px] text-[#9A9890] mb-1">{k.label}</div>
            <div className={`text-[24px] font-bold leading-none mb-0.5 font-mono ${k.color}`}>
              {k.value}
            </div>
            <div className="text-[10.5px] text-[#9A9890]">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>出庫類型</label>
            <select
              value={fType}
              onChange={(e) => setFType(e.target.value as OutboundType | "")}
              className={`${inputClass} w-[140px]`}
            >
              <option value="">全部類型</option>
              <option value="SALE">銷售出庫</option>
              <option value="TRANSFER">調撥出庫</option>
              <option value="DEMO">試乘/展覽</option>
              <option value="SCRAP">報廢/下架</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>出庫月份</label>
            <input
              type="month"
              value={fMonth}
              onChange={(e) => setFMonth(e.target.value)}
              className={`${inputClass} w-[150px]`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>車款 / VIN</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="搜尋車款 / VIN..."
              className={`${inputClass} w-[200px]`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆出庫記錄
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/outbound"
        exportFileName={`vehicle-outbound-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.type || filters.month
            ? "無符合條件的出庫記錄，請調整篩選條件"
            : "尚無出庫記錄"
        }
      />
    </main>
  );
}
