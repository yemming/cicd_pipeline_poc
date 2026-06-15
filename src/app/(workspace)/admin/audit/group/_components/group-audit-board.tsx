"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type {
  AuditLogRow,
  GroupAnomalySummaryRow,
  AuditBrandOption,
} from "@/domain/audit-logs";

const labelClass = "text-[11px] text-[#9A9890] font-medium";
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";

/** 集團事件類型業務語意選項（value=DB code, label=中文） */
const ACTION_OPTIONS = [
  { value: "all", label: "所有事件" },
  { value: "stock_in", label: "入庫" },
  { value: "stock_out", label: "出庫" },
  { value: "return_stock", label: "退料" },
  { value: "write_off", label: "損耗核銷" },
  { value: "transfer", label: "調撥" },
  { value: "status_changed", label: "狀態變更" },
  { value: "approval_approved", label: "主管核准" },
  { value: "approval_rejected", label: "主管拒絕" },
  { value: "discount_applied", label: "費用變更" },
];

const ACTION_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ACTION_OPTIONS.filter((o) => o.value !== "all").map((o) => [o.value, o.label]),
);
function actionLabel(action: string): string {
  return ACTION_LABEL_MAP[action] ?? action;
}

function dotColor(action: string): string {
  if (action.includes("approved") || action.includes("passed") || action.includes("complete"))
    return "bg-[#3B6D11]";
  if (action.includes("rejected") || action.includes("delete") || action.includes("cancel") || action.includes("cleared"))
    return "bg-[#CC0000]";
  if (action.includes("discount") || action.includes("requested") || action.includes("update"))
    return "bg-[#854F0B]";
  if (action.includes("status_changed") || action.includes("create"))
    return "bg-[#1A3A5C]";
  if (action.includes("transfer")) return "bg-[#185FA5]";
  return "bg-[#9A9890]";
}

function actionChipClass(action: string): string {
  if (action.includes("approved") || action.includes("passed") || action.includes("complete"))
    return "bg-[#EAF3DE] text-[#3B6D11]";
  if (action.includes("rejected") || action.includes("delete") || action.includes("cancel") || action.includes("cleared"))
    return "bg-[#FDECEA] text-[#CC0000]";
  if (action.includes("discount") || action.includes("requested") || action.includes("update"))
    return "bg-[#FDF3E3] text-[#854F0B]";
  if (action.includes("status_changed") || action.includes("create"))
    return "bg-[#EAF4FB] text-[#185FA5]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}

function formatDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    const tp = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    return `${tp.getFullYear()}-${String(tp.getMonth() + 1).padStart(2, "0")}-${String(tp.getDate()).padStart(2, "0")} ${String(tp.getHours()).padStart(2, "0")}:${String(tp.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

function renderJsonSummary(obj: Record<string, unknown> | null): string {
  if (!obj) return "—";
  const entries = Object.entries(obj).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${String(v ?? "—")}`).join(" | ") || "—";
}

/** 時間軸單筆元件 */
function TimelineItem({ row }: { row: AuditLogRow }) {
  const actorDisplay =
    row.actor_name ?? (row.actor_id ? row.actor_id.slice(0, 8) + "…" : "系統");

  return (
    <div className="flex gap-3 py-3 border-b border-[#EEECE6] last:border-0">
      <div className="flex flex-col items-center pt-1 shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor(row.action)} mt-0.5`} />
        <div className="w-px flex-1 bg-[#EEECE6] mt-1" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${actionChipClass(row.action)}`}
          >
            {actionLabel(row.action)}
          </span>
          {row.brand_id && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
              {row.brand_id}
            </span>
          )}
          {row.record_id && (
            <span className="font-mono text-[11px] text-[#185FA5] bg-[#EAF4FB] px-1.5 py-0.5 rounded">
              {row.record_id.length > 20 ? row.record_id.slice(0, 8) + "…" : row.record_id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9A9890]">
          <span>{formatDatetime(row.created_at)}</span>
          <span>·</span>
          <span>{actorDisplay}</span>
          <span>·</span>
          <span className="font-mono">{row.table_name}</span>
        </div>
        {row.after && (
          <div className="mt-1 px-2 py-1 rounded bg-[#F8F7F4] text-[11px] text-[#5A5955]">
            {renderJsonSummary(row.after)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 異常等級 badge */
function AnomalyBadge({ level }: { level: "normal" | "warning" | "critical" }) {
  if (level === "critical")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
        損耗異常
      </span>
    );
  if (level === "warning")
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
        需關注
      </span>
    );
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
      正常
    </span>
  );
}

const dataGridColumns: DataGridColumn<AuditLogRow>[] = [
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
    id: "action",
    header: "事件類型",
    width: 160,
    cell: (r) => (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${actionChipClass(r.action)}`}>
        {actionLabel(r.action)}
      </span>
    ),
    exportValue: (r) => actionLabel(r.action),
    sortValue: (r) => r.action,
  },
  {
    id: "record_id",
    header: "Record ID / 工單號",
    width: 180,
    cell: (r) => (
      <span className="font-mono text-[11.5px] text-[#5A5955]" title={r.record_id ?? "—"}>
        {r.record_id ?? "—"}
      </span>
    ),
    exportValue: (r) => r.record_id ?? "",
  },
  {
    id: "table_name",
    header: "資料表",
    width: 160,
    defaultHidden: true,
    cell: (r) => <span className="text-[12px] font-mono text-[#5A5955]">{r.table_name}</span>,
    exportValue: (r) => r.table_name,
    sortValue: (r) => r.table_name,
  },
  {
    id: "actor",
    header: "操作人",
    width: 140,
    cell: (r) => (
      <span className="text-[12px] text-[#2C2C2A]" title={r.actor_id ?? "—"}>
        {r.actor_name ?? (r.actor_id ? r.actor_id.slice(0, 8) + "…" : "（系統）")}
      </span>
    ),
    exportValue: (r) => r.actor_name ?? r.actor_id ?? "系統",
    sortValue: (r) => r.actor_name ?? r.actor_id ?? "",
  },
];

export type GroupAuditBoardProps = {
  rows: AuditLogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  filters: {
    brand_id: string;
    action: string;
    keyword: string;
    date_from: string;
    date_to: string;
  };
  anomalySummary: GroupAnomalySummaryRow[];
  /** 從 DB 動態撈的品牌選項（取代寫死的 BRAND_OPTIONS） */
  brandOptions: AuditBrandOption[];
};

export function GroupAuditBoard({
  rows,
  totalCount,
  page,
  pageSize,
  filters: initFilters,
  anomalySummary,
  brandOptions,
}: GroupAuditBoardProps) {
  useSetPageHeader({
    title: "集團稽核日誌",
    breadcrumb: [
      { label: "系統管理", href: "/admin" },
      { label: "稽核", href: "/admin/audit/group" },
      { label: "集團稽核日誌" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [localBrand, setLocalBrand] = useState(initFilters.brand_id);
  const [localAction, setLocalAction] = useState(initFilters.action);
  const [localKeyword, setLocalKeyword] = useState(initFilters.keyword);
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
      brand_id: localBrand !== "all" ? localBrand : "",
      action: localAction !== "all" ? localAction : "",
      keyword: localKeyword,
      date_from: localDateFrom,
      date_to: localDateTo,
    });
  }

  function handleReset() {
    setLocalBrand("all");
    setLocalAction("all");
    setLocalKeyword("");
    setLocalDateFrom("");
    setLocalDateTo("");
    pushParams({ brand_id: "", action: "", keyword: "", date_from: "", date_to: "" });
  }

  function goToPage(p: number) {
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("page", String(p));
    startTransition(() => router.push(`?${sp.toString()}`));
  }

  // 品牌選項：DB 動態撈 + 「所有品牌」置首
  const allBrandOptions: AuditBrandOption[] = [
    { value: "all", label: "所有品牌" },
    ...brandOptions,
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">集團稽核日誌</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RP4</span>
        <span className="text-[12px] text-[#9A9890]">跨品牌全域稽核記錄（集團管理員）</span>
      </header>

      {/* 2. 藍色資訊 Banner */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg border bg-[#EAF4FB] border-[#4A90D9] text-[12px] text-[#185FA5]">
        <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
        <span>
          📋 稽核記錄｜保存 7 年｜只能新增，不可修改或刪除 — 跨品牌全域操作均自動記錄於此
        </span>
      </div>

      {/* 跨門店異常統計表（本月） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 跨品牌異常統計（本月）</span>
        </header>
        {anomalySummary.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-[#9A9890]">本月尚無稽核事件</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">品牌</th>
                  <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-medium">主管授權</th>
                  <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-medium">損耗核銷</th>
                  <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-medium">費用爭議</th>
                  <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-medium">投訴件數</th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium">異常警示</th>
                </tr>
              </thead>
              <tbody>
                {anomalySummary.map((row) => (
                  <tr key={row.brand_id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {row.brand_id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[12px]">{row.approval_count}</td>
                    <td className="px-3 py-2 text-right text-[12px]">{row.writeoff_count}</td>
                    <td className="px-3 py-2 text-right text-[12px]">{row.dispute_count}</td>
                    <td className="px-3 py-2 text-right text-[12px]">{row.complaint_count}</td>
                    <td className="px-3 py-2">
                      <AnomalyBadge level={row.anomaly_level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          {/* 品牌（DB 動態撈） */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>品牌</label>
            <select
              className={inputClass + " w-[130px]"}
              value={localBrand}
              onChange={(e) => setLocalBrand(e.target.value)}
            >
              {allBrandOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {/* 事件類型業務語意下拉 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>事件類型</label>
            <select
              className={inputClass + " w-[140px]"}
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
          {/* 關鍵字跨欄搜尋 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字搜尋</label>
            <input
              className={inputClass + " w-[200px]"}
              placeholder="工單號 / 料號 / 操作人…"
              value={localKeyword}
              onChange={(e) => setLocalKeyword(e.target.value)}
            />
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

      {/* 4. Toolbar + 視圖切換 */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆稽核記錄（唯讀）
        </span>
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
            rows.map((r) => <TimelineItem key={String(r.id)} row={r} />)
          )}
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
          rowKey={(r) => String(r.id)}
          persistKey="admin/audit/group"
          exportFileName="集團稽核日誌"
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
