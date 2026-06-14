"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { AuditLogRow } from "@/domain/audit-logs";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    const tp = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    return `${tp.getFullYear()}-${String(tp.getMonth() + 1).padStart(2, "0")}-${String(tp.getDate()).padStart(2, "0")} ${String(tp.getHours()).padStart(2, "0")}:${String(tp.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function actionChipClass(action: string): string {
  if (action.includes("approved") || action.includes("received")) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (action.includes("rejected") || action.includes("delete") || action.includes("cancel")) return "bg-[#FDECEA] text-[#CC0000]";
  if (action.includes("update") || action.includes("adjust")) return "bg-[#FDF3E3] text-[#854F0B]";
  if (action.includes("create") || action.includes("transfer")) return "bg-[#EAF4FB] text-[#185FA5]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}

function renderJsonSummary(obj: Record<string, unknown> | null): string {
  if (!obj) return "—";
  const entries = Object.entries(obj).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${String(v ?? "—")}`).join(" | ") || "—";
}

const columns: DataGridColumn<AuditLogRow>[] = [
  {
    id: "created_at",
    header: "時間",
    width: 140,
    hideable: false,
    cell: (r) => <span className="font-mono text-[12px] text-[#5A5955]">{formatDatetime(r.created_at)}</span>,
    exportValue: (r) => formatDatetime(r.created_at),
    sortValue: (r) => r.created_at,
  },
  {
    id: "action",
    header: "動作",
    width: 160,
    cell: (r) => (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${actionChipClass(r.action)}`}>
        {r.action}
      </span>
    ),
    exportValue: (r) => r.action,
    sortValue: (r) => r.action,
  },
  {
    id: "table_name",
    header: "資料表",
    width: 160,
    cell: (r) => <span className="text-[12px] font-mono text-[#5A5955]">{r.table_name}</span>,
    exportValue: (r) => r.table_name,
    sortValue: (r) => r.table_name,
  },
  {
    id: "brand_id",
    header: "品牌",
    width: 90,
    cell: (r) => (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
        {r.brand_id ?? "—"}
      </span>
    ),
    exportValue: (r) => r.brand_id ?? "",
    sortValue: (r) => r.brand_id ?? "",
  },
  {
    id: "record_id",
    header: "Record ID",
    width: 130,
    defaultHidden: true,
    cell: (r) => (
      <span className="font-mono text-[11px] text-[#9A9890]" title={r.record_id ?? "—"}>
        {r.record_id ? r.record_id.slice(0, 8) + "…" : "—"}
      </span>
    ),
    exportValue: (r) => r.record_id ?? "",
  },
  {
    id: "actor_id",
    header: "操作人",
    width: 130,
    cell: (r) => (
      <span className="font-mono text-[11px] text-[#9A9890]" title={r.actor_id ?? "—"}>
        {r.actor_id ? r.actor_id.slice(0, 8) + "…" : "（系統）"}
      </span>
    ),
    exportValue: (r) => r.actor_id ?? "系統",
  },
  {
    id: "before",
    header: "變更前",
    width: 200,
    sortable: false,
    cell: (r) => <span className="text-[11.5px] text-[#9A9890]">{renderJsonSummary(r.before)}</span>,
    exportValue: (r) => renderJsonSummary(r.before),
  },
  {
    id: "after",
    header: "變更後",
    width: 200,
    sortable: false,
    cell: (r) => <span className="text-[11.5px] text-[#5A5955]">{renderJsonSummary(r.after)}</span>,
    exportValue: (r) => renderJsonSummary(r.after),
  },
];

export type InventoryAuditBoardProps = {
  rows: AuditLogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filters: {
    table_name: string;
    action: string;
    date_from: string;
    date_to: string;
  };
};

export function InventoryAuditBoard({
  rows,
  totalCount,
  page,
  pageSize,
  filters: initFilters,
}: InventoryAuditBoardProps) {
  useSetPageHeader({
    title: "庫存稽核日誌",
    breadcrumb: [
      { label: "系統管理", href: "/admin" },
      { label: "稽核", href: "/admin/audit/inventory" },
      { label: "庫存稽核日誌" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [localAction, setLocalAction] = useState(initFilters.action);
  const [localTable, setLocalTable] = useState(initFilters.table_name);
  const [localDateFrom, setLocalDateFrom] = useState(initFilters.date_from);
  const [localDateTo, setLocalDateTo] = useState(initFilters.date_to);

  function pushParams(overrides: Record<string, string>) {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(overrides)) {
      if (v) sp.set(k, v); else sp.delete(k);
    }
    sp.delete("page");
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  function handleQuery() {
    pushParams({
      action: localAction !== "all" ? localAction : "",
      table_name: localTable !== "all" ? localTable : "",
      date_from: localDateFrom,
      date_to: localDateTo,
    });
  }

  function handleReset() {
    setLocalAction("all");
    setLocalTable("all");
    setLocalDateFrom("");
    setLocalDateTo("");
    pushParams({ action: "", table_name: "", date_from: "", date_to: "" });
  }

  function goToPage(p: number) {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("page", String(p));
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存稽核日誌</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RP4</span>
        <span className="text-[12px] text-[#9A9890]">庫存相關操作稽核記錄（倉管主管 / Admin）</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>動作關鍵字</label>
            <input
              className={inputClass + " w-[160px]"}
              placeholder="e.g. stock_adjusted"
              value={localAction === "all" ? "" : localAction}
              onChange={(e) => setLocalAction(e.target.value || "all")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>資料表</label>
            <input
              className={inputClass + " w-[160px]"}
              placeholder="e.g. stock_adjustments"
              value={localTable === "all" ? "" : localTable}
              onChange={(e) => setLocalTable(e.target.value || "all")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期從</label>
            <input type="date" className={inputClass} value={localDateFrom} onChange={(e) => setLocalDateFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期至</label>
            <input type="date" className={inputClass} value={localDateTo} onChange={(e) => setLocalDateTo(e.target.value)} />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleQuery}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={handleReset}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆稽核記錄（唯讀）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => String(r.id)}
        persistKey="admin/audit/inventory"
        exportFileName="庫存稽核日誌"
        emptyMessage="沒有符合條件的稽核記錄"
        disabled={isPending}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
      />
    </main>
  );
}
