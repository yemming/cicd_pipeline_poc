"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { AftersalesAuditRow } from "@/domain/audit-logs";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

const ACTION_OPTIONS = [
  { value: "all", label: "所有動作" },
  { value: "status_changed", label: "狀態變更" },
  { value: "discount_applied", label: "折扣套用" },
  { value: "checkout_sig_cleared", label: "主管解鎖簽名" },
  { value: "approval_approved", label: "主管核准" },
  { value: "approval_rejected", label: "主管拒絕" },
  { value: "approval_requested", label: "授權申請" },
  { value: "addon_decision", label: "追加項目決定" },
  { value: "addon_cancelled", label: "追加項目取消" },
  { value: "ro_created", label: "工單建立" },
  { value: "checkout_completed", label: "結帳完成" },
];

const TABLE_OPTIONS = [
  { value: "all", label: "所有資料表" },
  { value: "repair_orders", label: "維修工單" },
  { value: "ro_checkouts", label: "結帳記錄" },
  { value: "repair_order_addons", label: "追加項目" },
  { value: "repair_order_events", label: "工單事件" },
];

function actionChipClass(action: string): string {
  if (action.includes("approved") || action.includes("passed")) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (action.includes("rejected") || action.includes("cancelled") || action.includes("cleared")) return "bg-[#FDECEA] text-[#CC0000]";
  if (action.includes("discount") || action.includes("requested")) return "bg-[#FDF3E3] text-[#854F0B]";
  if (action.includes("status_changed") || action.includes("completed")) return "bg-[#EAF4FB] text-[#185FA5]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}

function sourceChipClass(source: string): string {
  return source === "audit_log"
    ? "bg-[#EBF3FF] text-[#1A3A5C]"
    : "bg-[#E8F5F0] text-[#0F6E56]";
}

function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    const tp = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    const yy = tp.getFullYear();
    const mm = String(tp.getMonth() + 1).padStart(2, "0");
    const dd = String(tp.getDate()).padStart(2, "0");
    const hh = String(tp.getHours()).padStart(2, "0");
    const mi = String(tp.getMinutes()).padStart(2, "0");
    return `${yy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function renderJsonDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const parts: string[] = [];
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of allKeys) {
    const bv = before?.[k];
    const av = after?.[k];
    if (bv !== av) {
      parts.push(`${k}: ${bv ?? "—"} → ${av ?? "—"}`);
    }
  }
  return parts.join(" | ") || "—";
}

const columns: DataGridColumn<AftersalesAuditRow>[] = [
  {
    id: "created_at",
    header: "時間",
    width: 140,
    hideable: false,
    cell: (r) => (
      <span className="font-mono text-[12px] text-[#5A5955]">{formatDatetime(r.created_at)}</span>
    ),
    exportValue: (r) => formatDatetime(r.created_at),
    sortValue: (r) => r.created_at,
  },
  {
    id: "source",
    header: "來源",
    width: 90,
    cell: (r) => (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${sourceChipClass(r.source)}`}>
        {r.source === "audit_log" ? "稽核日誌" : "工單事件"}
      </span>
    ),
    exportValue: (r) => r.source === "audit_log" ? "稽核日誌" : "工單事件",
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
    width: 140,
    cell: (r) => <span className="text-[12px] font-mono text-[#5A5955]">{r.table_name}</span>,
    exportValue: (r) => r.table_name,
    sortValue: (r) => r.table_name,
  },
  {
    id: "record_id",
    header: "Record ID",
    width: 130,
    defaultHidden: true,
    cell: (r) => (
      <span className="font-mono text-[11px] text-[#9A9890] truncate" title={r.record_id ?? "—"}>
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
      <span className="font-mono text-[11px] text-[#9A9890] truncate" title={r.actor_id ?? "—"}>
        {r.actor_id ? r.actor_id.slice(0, 8) + "…" : "（系統）"}
      </span>
    ),
    exportValue: (r) => r.actor_id ?? "系統",
  },
  {
    id: "diff",
    header: "前後差異",
    width: 320,
    sortable: false,
    cell: (r) => (
      <span className="text-[11.5px] text-[#5A5955] whitespace-pre-wrap break-all">
        {renderJsonDiff(r.before, r.after)}
      </span>
    ),
    exportValue: (r) => renderJsonDiff(r.before, r.after),
  },
];

export type AftersalesAuditBoardProps = {
  rows: AftersalesAuditRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filters: {
    action: string;
    table_name: string;
    date_from: string;
    date_to: string;
  };
};

export function AftersalesAuditBoard({
  rows,
  totalCount,
  page,
  pageSize,
  filters: initFilters,
}: AftersalesAuditBoardProps) {
  useSetPageHeader({
    title: "售後稽核日誌",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "售後稽核日誌" },
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
      if (v) sp.set(k, v);
      else sp.delete(k);
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
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">售後稽核日誌</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RP4</span>
        <span className="text-[12px] text-[#9A9890]">工單狀態變更、折扣套用、主管授權等稽核記錄</span>
      </header>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>動作類型</label>
            <select
              className={inputClass}
              value={localAction}
              onChange={(e) => setLocalAction(e.target.value)}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>資料表</label>
            <select
              className={inputClass}
              value={localTable}
              onChange={(e) => setLocalTable(e.target.value)}
            >
              {TABLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期從</label>
            <input
              type="date"
              className={inputClass}
              value={localDateFrom}
              onChange={(e) => setLocalDateFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>日期至</label>
            <input
              type="date"
              className={inputClass}
              value={localDateTo}
              onChange={(e) => setLocalDateTo(e.target.value)}
            />
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

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆紀錄
        </span>
        <span className="text-[11px] text-[#9A9890] ml-1">（唯讀，不可修改）</span>
      </div>

      {/* 5. DataGrid */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/audit-log"
        exportFileName="售後稽核日誌"
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
