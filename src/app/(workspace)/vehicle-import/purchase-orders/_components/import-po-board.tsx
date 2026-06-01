"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { VehiclePORow, VehiclePOFilters } from "@/domain/vehicle-purchase-orders";

const nt = (n: number | null) => (n == null ? "—" : `NT$ ${Math.round(n).toLocaleString("en-US")}`);

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送出",
  in_transit: "在途中",
  arrived: "到港完成",
  closed: "已結案",
  cancelled: "已取消",
};

function payChip(paid: string | null, hasAmount: boolean) {
  if (!hasAmount) return <span className="text-[12px] text-[#9A9890]">—</span>;
  return paid ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
      已付 {paid}
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap">
      未付
    </span>
  );
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ImportPoBoard({
  rows,
  filters,
}: {
  rows: VehiclePORow[];
  filters: VehiclePOFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const buildHref = (o: Partial<VehiclePOFilters> = {}) => {
    const p = new URLSearchParams();
    const q = o.q ?? fQ.trim();
    const status = o.status ?? fStatus;
    if (q) p.set("q", q);
    if (status !== "all") p.set("status", status);
    const qs = p.toString();
    return qs ? `/vehicle-import/purchase-orders?${qs}` : "/vehicle-import/purchase-orders";
  };
  const submitFilters = () => startTransition(() => router.push(buildHref()));
  const resetFilters = () => {
    setFQ("");
    setFStatus("all");
    startTransition(() => router.push("/vehicle-import/purchase-orders"));
  };

  const columns: DataGridColumn<VehiclePORow>[] = [
    {
      id: "po_no",
      header: "採購單號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/vehicle-import/purchase-orders/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.po_no}
        </Link>
      ),
      exportValue: (r) => r.po_no,
      sortValue: (r) => r.po_no,
    },
    {
      id: "pi_no",
      header: "PI 號",
      width: 120,
      cell: (r) => <span className="font-mono text-[12px] text-[#5A5955]">{r.pi_no ?? "—"}</span>,
      exportValue: (r) => r.pi_no ?? "",
      sortValue: (r) => r.pi_no ?? "",
    },
    {
      id: "incoterms",
      header: "Incoterms",
      width: 90,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.incoterms ?? "—"}</span>,
      exportValue: (r) => r.incoterms ?? "",
      sortValue: (r) => r.incoterms ?? "",
    },
    {
      id: "origin_country",
      header: "原產國",
      width: 90,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.origin_country ?? "—"}</span>,
      exportValue: (r) => r.origin_country ?? "",
    },
    {
      id: "total_qty",
      header: "台數",
      width: 60,
      align: "right",
      cell: (r) => <span className="font-mono">{r.total_qty}</span>,
      exportValue: (r) => String(r.total_qty),
      sortValue: (r) => r.total_qty,
    },
    {
      id: "total_amount_twd",
      header: "採購總額",
      width: 120,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{nt(r.total_amount_twd)}</span>,
      exportValue: (r) => String(r.total_amount_twd),
      sortValue: (r) => r.total_amount_twd,
    },
    {
      id: "deposit",
      header: "訂金",
      width: 130,
      sortable: false,
      cell: (r) => payChip(r.deposit_paid_at, r.deposit_amount > 0),
      exportValue: (r) =>
        r.deposit_amount > 0 ? `${nt(r.deposit_amount)} ${r.deposit_paid_at ? `已付 ${r.deposit_paid_at}` : "未付"}` : "",
    },
    {
      id: "balance",
      header: "尾款",
      width: 130,
      sortable: false,
      cell: (r) => payChip(r.balance_paid_at, r.balance_amount > 0),
      exportValue: (r) =>
        r.balance_amount > 0 ? `${nt(r.balance_amount)} ${r.balance_paid_at ? `已付 ${r.balance_paid_at}` : "未付"}` : "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EBF3FF] text-[#1A3A5C]">
          {STATUS_LABEL[r.status] ?? r.status}
        </span>
      ),
      exportValue: (r) => STATUS_LABEL[r.status] ?? r.status,
      sortValue: (r) => r.status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">進口採購單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P2P
        </span>
        <span className="text-[12px] text-[#9A9890]">
          對原廠下單 + PI / Incoterms / 訂金尾款追蹤；明細與在途庫存沿用整車採購鏈
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="採購單號 / 供應商"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select className={inputClass} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="all">全部</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/vehicle-import/purchase-orders/new"
              className="h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            >
              ＋ 新增採購單
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 張採購單
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/purchase-orders"
        exportFileName="import-purchase-orders"
        emptyMessage="沒有符合條件的採購單（點右上「新增採購單」建立）"
        disabled={isPending}
        rowActions={(r) => (
          <button
            onClick={() => router.push(`/vehicle-import/purchase-orders/${r.id}`)}
            disabled={isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            檢視
          </button>
        )}
      />
    </main>
  );
}
