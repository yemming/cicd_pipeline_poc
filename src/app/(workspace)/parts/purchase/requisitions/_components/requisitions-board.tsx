"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  approveRequisition,
  convertRequisition,
  rejectRequisition,
  setRequisitionPriority,
  type RequisitionKpi,
  type RequisitionPriority,
  type RequisitionWithLines,
} from "@/domain/requisitions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, type ToneKey } from "@/components/visualization";

type Banner = { ok: boolean; msg: string } | null;
type ConfirmTone = "danger" | "primary" | "success";
type ConfirmState =
  | null
  | {
      title: string;
      message: React.ReactNode;
      confirmLabel: string;
      confirmTone: ConfirmTone;
      onConfirm: () => void;
    };

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",       chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  pending:   { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:  { label: "已核准",     chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  converted: { label: "已轉採購單", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  rejected:  { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]" },
  cancelled: { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "submitted", label: "待審核" },
  { value: "approved", label: "已核准" },
  { value: "converted", label: "已轉採購單" },
  { value: "cancelled", label: "已拒絕" },
];

type PriorityMeta = {
  label: string;
  chip: string;
  tone: ToneKey;
  sort: number;
};
const PRIORITY_META: Record<string, PriorityMeta> = {
  urgent: { label: "🔥 緊急", chip: "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]", tone: "red",    sort: 0 },
  high:   { label: "⬆ 高",   chip: "bg-[#FDF3E3] text-[#854F0B] border border-[#F4D78A]", tone: "amber",  sort: 1 },
  normal: { label: "─ 中",   chip: "bg-[#EAF4FB] text-[#185FA5] border border-[#B5D4F4]", tone: "blue",   sort: 2 },
  low:    { label: "⬇ 低",   chip: "bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]", tone: "gray",   sort: 3 },
};
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部" },
  { value: "urgent", label: "緊急" },
  { value: "high", label: "高" },
  { value: "normal", label: "中" },
  { value: "low", label: "低" },
];

function formatDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

/** mini gauge bar — 用於 list view 的單格內預算進度顯示 */
function BudgetBar({ pct }: { pct: number | null }) {
  if (pct == null) {
    return <span className="text-[11px] text-[#9A9890]">—</span>;
  }
  const over = pct > 100;
  const clamped = Math.min(100, pct);
  const barColor = over ? "#CC0000" : pct >= 80 ? "#854F0B" : "#0F6E56";
  const bgColor = over ? "#FDECEA" : pct >= 80 ? "#FDF3E3" : "#EAF3DE";
  return (
    <div className="flex items-center gap-1.5 min-w-[110px]">
      <div className="relative flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: bgColor }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamped}%`, background: barColor }} />
      </div>
      <span
        className={`font-mono text-[11px] tabular-nums ${over ? "text-[#CC0000] font-semibold" : "text-[#5A5955]"}`}
      >
        {pct}%
      </span>
    </div>
  );
}

export function RequisitionsBoard({
  rows,
  canEdit,
  kpi,
  initialStatus,
  initialPriority,
}: {
  rows: RequisitionWithLines[];
  canEdit: boolean;
  kpi: RequisitionKpi;
  initialStatus: string;
  initialPriority: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriorityFilter] = useState(initialPriority);
  const [banner, setBanner] = useState<Banner>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    startTransition(() =>
      router.push(`/parts/purchase/requisitions${params.toString() ? "?" + params : ""}`),
    );
  }

  function resetFilter() {
    setStatus("");
    setPriorityFilter("");
    startTransition(() => router.push("/parts/purchase/requisitions"));
  }

  const changePriority = useCallback(
    (r: RequisitionWithLines, next: RequisitionPriority) => {
      if (r.priority === next) return;
      startTransition(async () => {
        const res = await setRequisitionPriority(r.id, next);
        if (res.ok) {
          flash({ ok: true, msg: "✓ 已變更優先度" });
          router.refresh();
        } else flash({ ok: false, msg: res.error });
      });
    },
    [router],
  );

  function doApprove(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認核准",
      message: (
        <>
          確認核准「<b>{r.req_no}</b>」？核准後即可轉為正式採購單。
        </>
      ),
      confirmLabel: "確認核准",
      confirmTone: "success",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await approveRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已核准" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  function doReject(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認拒絕",
      message: (
        <>
          確定拒絕「<b>{r.req_no}</b>」？此動作會將狀態切為「已拒絕」、後續不可再核准或轉採購單。
        </>
      ),
      confirmLabel: "確認拒絕",
      confirmTone: "danger",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await rejectRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已拒絕" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  function doConvert(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認轉採購單",
      message: (
        <>
          「<b>{r.req_no}</b>」轉採購單？
          <div className="text-[11px] text-[#9A9890] mt-1">
            demo 階段：僅切換狀態為「已轉採購單」，未實際建立 PO。
          </div>
        </>
      ),
      confirmLabel: "確認轉採購單",
      confirmTone: "primary",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await convertRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已轉採購單（demo）" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  const columns: DataGridColumn<RequisitionWithLines>[] = useMemo(
    () => [
      {
        id: "priority",
        header: "優先度",
        width: 130,
        hideable: false,
        cell: (r) => {
          const meta = PRIORITY_META[r.priority] ?? PRIORITY_META.normal;
          const stLocked =
            r.status === "converted" || r.status === "cancelled";
          if (!canEdit || stLocked) {
            return (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${meta.chip}`}>
                {meta.label}
              </span>
            );
          }
          // 可編輯：inline select（不阻擋 row click）
          return (
            <select
              value={r.priority}
              onChange={(e) =>
                changePriority(r, e.target.value as RequisitionPriority)
              }
              disabled={isPending}
              className={`h-[24px] text-[11px] font-medium rounded-md px-1.5 border-0 outline-none cursor-pointer disabled:opacity-60 ${meta.chip}`}
              title="點擊變更優先度"
            >
              <option value="urgent">🔥 緊急</option>
              <option value="high">⬆ 高</option>
              <option value="normal">─ 中</option>
              <option value="low">⬇ 低</option>
            </select>
          );
        },
        exportValue: (r) => (PRIORITY_META[r.priority] ?? PRIORITY_META.normal).label.replace(/[🔥⬆─⬇]\s*/g, ""),
        sortValue: (r) => (PRIORITY_META[r.priority] ?? PRIORITY_META.normal).sort,
      },
      {
        id: "req_no",
        header: "需求單號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[12px] text-[#1A3A5C]">
            {r.req_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.req_no ?? "",
        sortValue: (r) => r.req_no ?? "",
      },
      {
        id: "store_name",
        header: "提出門店",
        width: 160,
        cell: (r) => <span className="text-[12.5px]">{r.store_name ?? "—"}</span>,
        exportValue: (r) => r.store_name ?? "",
        sortValue: (r) => r.store_name ?? "",
      },
      {
        id: "item",
        header: "料號 / 品名",
        width: 240,
        sortable: false,
        cell: (r) =>
          r.first_item ? (
            <div>
              <div className="text-[12.5px]">{r.first_item.name}</div>
              <div className="font-mono text-[11px] text-[#9A9890]">{r.first_item.code}</div>
              {r.line_count > 1 ? (
                <span className="inline-block mt-0.5 text-[10px] text-[#9A9890]">
                  +{r.line_count - 1} 項
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-[12.5px] text-[#9A9890]">—</span>
          ),
        exportValue: (r) =>
          r.first_item ? `${r.first_item.code} ${r.first_item.name}` : "",
      },
      {
        id: "qty",
        header: "需求數量",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {r.first_item ? r.first_item.qty.toLocaleString("en-US") : "—"}
          </span>
        ),
        exportValue: (r) => r.first_item?.qty ?? 0,
        sortValue: (r) => r.first_item?.qty ?? 0,
      },
      {
        id: "required_date",
        header: "需求日期",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px]">{formatDate(r.required_date)}</span>
        ),
        exportValue: (r) => r.required_date ?? "",
        sortValue: (r) => r.required_date ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 110,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? "submitted"] ?? STATUS_LABEL.submitted;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? "submitted"] ?? STATUS_LABEL.submitted).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "budget",
        header: "預算使用",
        width: 180,
        cell: (r) => (
          <div className="flex flex-col gap-0.5">
            <BudgetBar pct={r.budget_used_pct} />
            <span className="text-[10px] text-[#9A9890] font-mono">
              {formatCurrency(r.estimated_cost)} / {formatCurrency(Number(r.budget_limit))}
            </span>
          </div>
        ),
        exportValue: (r) => (r.budget_used_pct == null ? "" : `${r.budget_used_pct}%`),
        sortValue: (r) => r.budget_used_pct ?? -1,
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.notes || "—"}</span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
        defaultHidden: true,
      },
    ],
    [canEdit, isPending, changePriority],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購需求處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.3
        </span>
        <span className="text-[12px] text-[#9A9890]">需求單建立 · 審核 · 轉採購單</span>
      </header>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-md px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📋 需求處理：門店服務人員提出備料/補貨需求，採購部門審核後轉為正式採購單。
      </div>

      {/* KPI Row — 5 cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="待審核"
          value={kpi.pendingApproval}
          tone="amber"
          icon={<span className="text-[18px]">⏳</span>}
        />
        <KpiCard
          label="已核准"
          value={kpi.approved}
          tone="teal"
          icon={<span className="text-[18px]">✅</span>}
        />
        <KpiCard
          label="逾期未處理"
          value={kpi.overdue}
          tone="red"
          icon={<span className="text-[18px]">⚠️</span>}
        />
        <KpiCard
          label="本月新增"
          value={kpi.newThisMonth}
          tone="blue"
          icon={<span className="text-[18px]">📝</span>}
        />
        <KpiCard
          label="超預算"
          value={kpi.overBudget}
          tone={kpi.overBudget > 0 ? "red" : "gray"}
          icon={<span className="text-[18px]">💰</span>}
        />
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">優先度</label>
            <select
              value={priority}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/purchase/requisitions/new"
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center disabled:opacity-50"
            >
              ＋ 新增需求
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/purchase/requisitions"
        exportFileName="requisitions"
        emptyMessage="沒有符合條件的需求單"
        disabled={isPending}
        rowActionsWidth={canEdit ? 320 : 90}
        rowActions={(r) => {
          const st = r.status ?? "submitted";
          const isPendingStatus = st === "submitted" || st === "pending";
          const isApproved = st === "approved";
          return (
            <>
              <Link
                href={`/parts/purchase/requisitions/${r.id}`}
                className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
              >
                詳細
              </Link>
              {canEdit && isPendingStatus ? (
                <>
                  <button
                    type="button"
                    onClick={() => doApprove(r)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    核准
                  </button>
                  <button
                    type="button"
                    onClick={() => doReject(r)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                  >
                    拒絕
                  </button>
                </>
              ) : null}
              {canEdit && isApproved ? (
                <button
                  type="button"
                  onClick={() => doConvert(r)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                >
                  轉採購單
                </button>
              ) : null}
            </>
          );
        }}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有審核權限（PR_APPROVE），僅能檢視
        </div>
      ) : null}

      {/* Confirm Modal */}
      {confirmModal ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3
                className={`text-[14px] font-semibold ${
                  confirmModal.confirmTone === "danger" ? "text-[#CC0000]" : "text-[#2C2C2A]"
                }`}
              >
                {confirmModal.title}
              </h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              {confirmModal.message}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                disabled={isPending}
                className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium disabled:opacity-60 ${
                  confirmModal.confirmTone === "danger"
                    ? "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    : confirmModal.confirmTone === "success"
                      ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                      : "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner fixed bottom-right */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
