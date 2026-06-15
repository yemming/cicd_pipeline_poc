"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  AftersalesAuditRow,
  MonthlyApprovalRow,
  WeeklyWriteoffRow,
} from "@/domain/audit-logs";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

/** 事件類型業務語意選項（value=DB code, label=中文） */
const ACTION_OPTIONS = [
  { value: "all", label: "所有事件" },
  { value: "status_changed", label: "狀態變更" },
  { value: "customer_signature", label: "客戶簽名" },
  { value: "checkout_sig_cleared", label: "主管解鎖簽名" },
  { value: "approval_approved", label: "主管核准" },
  { value: "approval_rejected", label: "主管拒絕" },
  { value: "approval_requested", label: "授權申請" },
  { value: "damage_dispute", label: "損傷異議" },
  { value: "discount_applied", label: "費用變更" },
  { value: "addon_decision", label: "追加項目決定" },
  { value: "addon_cancelled", label: "退料核銷" },
  { value: "contact_record", label: "聯繫記錄" },
  { value: "ro_created", label: "工單建立" },
  { value: "checkout_completed", label: "結帳完成" },
];

/** action → 顯示中文標籤 */
const ACTION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ACTION_OPTIONS.filter((o) => o.value !== "all").map((o) => [o.value, o.label]),
);
function actionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] ?? action;
}

/** action → 時間軸色點顏色 CSS class */
function dotColor(action: string): string {
  if (action.includes("approved") || action.includes("passed") || action.includes("completed"))
    return "bg-[#3B6D11]";
  if (action.includes("rejected") || action.includes("cancelled") || action.includes("cleared"))
    return "bg-[#CC0000]";
  if (action.includes("discount") || action.includes("requested") || action.includes("dispute"))
    return "bg-[#854F0B]";
  if (action.includes("status_changed") || action.includes("created"))
    return "bg-[#1A3A5C]";
  return "bg-[#9A9890]";
}

/** action → chip 背景/文字 CSS class */
function actionChipClass(action: string): string {
  if (action.includes("approved") || action.includes("passed") || action.includes("completed"))
    return "bg-[#EAF3DE] text-[#3B6D11]";
  if (action.includes("rejected") || action.includes("cancelled") || action.includes("cleared"))
    return "bg-[#FDECEA] text-[#CC0000]";
  if (action.includes("discount") || action.includes("requested") || action.includes("dispute"))
    return "bg-[#FDF3E3] text-[#854F0B]";
  if (action.includes("status_changed") || action.includes("created"))
    return "bg-[#EAF4FB] text-[#185FA5]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
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

function renderJsonDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  const parts: string[] = [];
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  // 物件 / 陣列要序列化，否則 template literal 會印成 [object Object]
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };
  for (const k of allKeys) {
    const bv = before?.[k];
    const av = after?.[k];
    if (fmt(bv) !== fmt(av)) {
      parts.push(`${k}: ${fmt(bv)} → ${fmt(av)}`);
    }
  }
  return parts.join(" | ") || "—";
}

/** 時間軸視圖 — 單筆稽核事件 */
function TimelineItem({ row }: { row: AftersalesAuditRow }) {
  const diff = renderJsonDiff(row.before, row.after);
  const actorDisplay = row.actor_name ?? (row.actor_id ? row.actor_id.slice(0, 8) + "…" : "系統");
  const sourceLabel =
    row.source === "audit_log" ? "稽核日誌" : "工單事件";

  return (
    <div className="flex gap-3 py-3 border-b border-[#EEECE6] last:border-0">
      {/* 色點 */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor(row.action)} mt-0.5`} />
        <div className="w-px flex-1 bg-[#EEECE6] mt-1" />
      </div>
      {/* 內容 */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* 主文字：業務語意動作 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${actionChipClass(row.action)}`}>
            {actionLabel(row.action)}
          </span>
          {row.record_id && (
            <span className="font-mono text-[11px] text-[#185FA5] bg-[#EAF4FB] px-1.5 py-0.5 rounded">
              {row.record_id.length > 20
                ? row.record_id.slice(0, 8) + "…"
                : row.record_id}
            </span>
          )}
        </div>
        {/* meta 行 */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9A9890]">
          <span>{formatDatetime(row.created_at)}</span>
          <span>·</span>
          <span>{actorDisplay}</span>
          <span>·</span>
          <span className={`inline-flex items-center px-1 py-0 rounded text-[10px] ${row.source === "audit_log" ? "bg-[#EBF3FF] text-[#1A3A5C]" : "bg-[#E8F5F0] text-[#0F6E56]"}`}>
            {sourceLabel}
          </span>
        </div>
        {/* detail 行（差異摘要） */}
        {diff !== "—" && (
          <div className="mt-1 px-2 py-1 rounded bg-[#F8F7F4] text-[11px] text-[#5A5955] whitespace-pre-wrap break-all">
            {diff}
          </div>
        )}
      </div>
    </div>
  );
}

const dataGridColumns: DataGridColumn<AftersalesAuditRow>[] = [
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
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.source === "audit_log" ? "bg-[#EBF3FF] text-[#1A3A5C]" : "bg-[#E8F5F0] text-[#0F6E56]"}`}
      >
        {r.source === "audit_log" ? "稽核日誌" : "工單事件"}
      </span>
    ),
    exportValue: (r) => (r.source === "audit_log" ? "稽核日誌" : "工單事件"),
  },
  {
    id: "action",
    header: "動作",
    width: 160,
    cell: (r) => (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${actionChipClass(r.action)}`}
      >
        {actionLabel(r.action)}
      </span>
    ),
    exportValue: (r) => actionLabel(r.action),
    sortValue: (r) => r.action,
  },
  {
    id: "record_id",
    header: "工單號 / Record ID",
    width: 180,
    cell: (r) => (
      <span className="font-mono text-[11.5px] text-[#5A5955]" title={r.record_id ?? "—"}>
        {r.record_id ?? "—"}
      </span>
    ),
    exportValue: (r) => r.record_id ?? "",
  },
  {
    id: "actor",
    header: "操作人",
    width: 140,
    cell: (r) => (
      <span
        className="text-[12px] text-[#2C2C2A]"
        title={r.actor_id ?? "—"}
      >
        {r.actor_name ?? (r.actor_id ? r.actor_id.slice(0, 8) + "…" : "（系統）")}
      </span>
    ),
    exportValue: (r) => r.actor_name ?? r.actor_id ?? "系統",
    sortValue: (r) => r.actor_name ?? r.actor_id ?? "",
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
    record_id: string;
    date_from: string;
    date_to: string;
  };
  monthlyApprovals: MonthlyApprovalRow[];
  weeklyWriteoffs: WeeklyWriteoffRow[];
};

export function AftersalesAuditBoard({
  rows,
  totalCount,
  page,
  pageSize,
  filters: initFilters,
  monthlyApprovals,
  weeklyWriteoffs,
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
  const [localRecordId, setLocalRecordId] = useState(initFilters.record_id);
  const [localDateFrom, setLocalDateFrom] = useState(initFilters.date_from);
  const [localDateTo, setLocalDateTo] = useState(initFilters.date_to);
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");

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
      record_id: localRecordId,
      date_from: localDateFrom,
      date_to: localDateTo,
    });
  }

  function handleReset() {
    setLocalAction("all");
    setLocalRecordId("");
    setLocalDateFrom("");
    setLocalDateTo("");
    pushParams({ action: "", record_id: "", date_from: "", date_to: "" });
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

      {/* 2. 藍色資訊 Banner */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg border bg-[#EAF4FB] border-[#4A90D9] text-[12px] text-[#185FA5]">
        <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
        <span>
          層級二：工單事件時間軸（業務層稽核記錄）｜售後主管 / 店長可見｜保存 7 年｜只能新增，不可修改或刪除
        </span>
      </div>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          {/* 工單號篩選欄（record_id 跨欄搜尋） */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>工單號 / Record ID</label>
            <input
              type="text"
              className={inputClass + " w-[180px]"}
              placeholder="輸入工單號搜尋"
              value={localRecordId}
              onChange={(e) => setLocalRecordId(e.target.value)}
            />
          </div>
          {/* 事件類型：業務語意中文下拉 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>事件類型</label>
            <select
              className={inputClass + " w-[160px]"}
              value={localAction}
              onChange={(e) => setLocalAction(e.target.value)}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
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

      {/* 本月主管授權統計卡（amber header） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FDF3E3]">
          <span className="text-[13px] font-semibold text-[#854F0B]">
            本月主管授權統計（共 {monthlyApprovals.length} 筆）
          </span>
        </header>
        {monthlyApprovals.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-[#9A9890]">本月尚無主管授權記錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">授權類型</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">申請人</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">工單號</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">授權時間</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">授權結果</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">說明</th>
                </tr>
              </thead>
              <tbody>
                {monthlyApprovals.map((r) => (
                  <tr key={r.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2 text-[12px] text-[#2C2C2A]">
                      {ACTION_LABEL_MAP[r.action] ?? r.action}
                    </td>
                    <td className="px-3 py-2 text-[12px]">{r.actor_name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">
                      {r.record_id ? (r.record_id.length > 16 ? r.record_id.slice(0, 8) + "…" : r.record_id) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">
                      {formatDatetime(r.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${r.result === "approved" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"}`}
                      >
                        {r.result === "approved" ? "批准" : "拒絕"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                      {r.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 本週損耗核銷記錄卡（navy header） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#1A3A5C]">
          <span className="text-[13px] font-semibold text-white">
            本週損耗核銷記錄（共 {weeklyWriteoffs.length} 筆）
          </span>
        </header>
        {weeklyWriteoffs.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-[#9A9890]">本週尚無損耗核銷記錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">工單號</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">料號</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">零件名稱</th>
                  <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-medium">數量</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">SA 確認</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">主管授權</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">核銷原因</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">時間</th>
                </tr>
              </thead>
              <tbody>
                {weeklyWriteoffs.map((r) => (
                  <tr key={r.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">
                      {r.record_id ? (r.record_id.length > 16 ? r.record_id.slice(0, 8) + "…" : r.record_id) : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">{r.item_code ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px]">{r.item_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-[12px]">{r.qty ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px]">{r.actor_name ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px]">{r.approved_by_name ?? "—"}</td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">{r.reason ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">
                      {formatDatetime(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Toolbar（含視圖切換） */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆紀錄
        </span>
        <span className="text-[11px] text-[#9A9890] ml-1">（唯讀，不可修改）</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setViewMode("timeline")}
            className={`h-[26px] px-2.5 rounded text-[11.5px] border ${viewMode === "timeline" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"}`}
          >
            時間軸
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`h-[26px] px-2.5 rounded text-[11.5px] border ${viewMode === "table" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"}`}
          >
            表格
          </button>
        </div>
      </div>

      {/* 5. 時間軸 / DataGrid */}
      {viewMode === "timeline" ? (
        <section className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-2 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[#9A9890]">沒有符合條件的稽核記錄</p>
          ) : (
            rows.map((r) => <TimelineItem key={r.id} row={r} />)
          )}
          {/* 分頁（簡易版） */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-[#EEECE6]">
              <button
                disabled={page <= 1 || isPending}
                onClick={() => goToPage(page - 1)}
                className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
              >
                ← 上一頁
              </button>
              <span className="text-[11.5px] text-[#9A9890]">
                第 {page} 頁 / 共 {Math.ceil(totalCount / pageSize)} 頁
              </span>
              <button
                disabled={page >= Math.ceil(totalCount / pageSize) || isPending}
                onClick={() => goToPage(page + 1)}
                className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
              >
                下一頁 →
              </button>
            </div>
          )}
        </section>
      ) : (
        <DataGrid
          columns={dataGridColumns}
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
      )}
    </main>
  );
}
