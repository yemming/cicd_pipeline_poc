"use client";

/**
 * /admin/approvals/discount — 折扣審核佇列（RS_M5）
 *
 * 主管視角：查看所有待審核的折扣申請，依照
 *   1. in_store_waiting=true（客戶在場）優先
 *   2. requested_at ASC（先進先出）
 * 排序。in_store_waiting 案件顯示醒目 badge。
 *
 * 功能：
 *   - 核准 / 駁回（含填寫原因）
 *   - 點擊報價單號 → 跳到 /sales/quote/[id]
 *   - 逾時倒數顯示（client-side interval）
 *   - deadline_at = requested_at + 10min（in_store_waiting）/ 30min
 */

import Link from "next/link";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  decideDiscountApprovalAction,
} from "@/lib/sales/discount-approval-actions";
import {
  DISCOUNT_APPROVAL_STATUS_LABELS,
  DISCOUNT_APPROVAL_STATUS_CHIP,
  type DiscountApprovalRow,
  type DiscountApprovalStatus,
} from "@/domain/discount-approvals.constants";

type Banner = { ok: boolean; msg: string } | null;

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StatusChip({ status }: { status: DiscountApprovalStatus }) {
  const chip =
    DISCOUNT_APPROVAL_STATUS_CHIP[status] ?? {
      bg: "bg-[#F2F2F2]",
      text: "text-[#6B6A68]",
    };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${chip.bg} ${chip.text}`}
    >
      {DISCOUNT_APPROVAL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** 每一列的倒數計時 — 只對 pending/escalated 有意義 */
function CountdownCell({ deadlineAt }: { deadlineAt: string | null }) {
  const [ms, setMs] = useState<number | null>(null);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deadlineAt) return;
    const tick = () => {
      const rem = new Date(deadlineAt).getTime() - Date.now();
      setMs(rem > 0 ? rem : 0);
    };
    tick();
    ref.current = setInterval(tick, 1000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [deadlineAt]);

  if (!deadlineAt || ms === null) return <span className="text-[11px] text-[#9A9890]">—</span>;

  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const label = ms <= 0 ? "已逾時" : `${min}:${String(sec).padStart(2, "0")}`;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[11.5px] ${
        ms <= 0
          ? "text-[#CC0000] font-semibold"
          : ms < 120000
            ? "text-[#CC0000]"
            : "text-[#2C2C2A]"
      }`}
    >
      <span className="material-symbols-outlined text-[13px]">timer</span>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export type DiscountApprovalsBoardProps = {
  rows: DiscountApprovalRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: { total_pending: number; in_store_waiting: number; overdue: number };
  filterStatus: string;
  filterInStoreOnly: boolean;
  canApprove: boolean;
};

// ─────────────────────────────────────────────────────────────
// Board
// ─────────────────────────────────────────────────────────────

export function DiscountApprovalsBoard({
  rows,
  totalCount,
  page,
  pageSize,
  kpis,
  filterStatus,
  filterInStoreOnly,
  canApprove,
}: DiscountApprovalsBoardProps) {
  useSetPageHeader({
    breadcrumb: [
      { label: "簽核管理", href: "/admin/approvals" },
      { label: "折扣簽核" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 本機篩選 state
  const [localStatus, setLocalStatus] = useState(filterStatus);
  const [localInStore, setLocalInStore] = useState(filterInStoreOnly);

  // 核准 / 駁回 / 反價 Modal
  const [approveModal, setApproveModal] = useState<DiscountApprovalRow | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    row: DiscountApprovalRow;
    reason: string;
  } | null>(null);
  const [counterModal, setCounterModal] = useState<{
    row: DiscountApprovalRow;
    amount: string;
    reason: string;
  } | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  function buildUrl(overrides: Partial<{ status: string; inStore: boolean; page: number }>) {
    const params = new URLSearchParams();
    const s = overrides.status ?? localStatus;
    const ins = overrides.inStore ?? localInStore;
    const p = overrides.page ?? 1;
    if (s) params.set("status", s);
    if (ins) params.set("in_store_only", "1");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/approvals/discount?${qs}` : "/admin/approvals/discount";
  }

  function handleQuery() {
    router.push(buildUrl({ page: 1 }));
  }

  function handleReset() {
    setLocalStatus("");
    setLocalInStore(false);
    router.push("/admin/approvals/discount");
  }

  function goToPage(p: number) {
    router.push(buildUrl({ page: p }));
  }

  // 核准
  const doApprove = (row: DiscountApprovalRow) => {
    setApproveModal(null);
    startTransition(async () => {
      const res = await decideDiscountApprovalAction(row.id, { decision: "approved" });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已核准 ${row.quote_no ?? row.id.slice(0, 8)}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // 駁回
  const doReject = () => {
    if (!rejectModal) return;
    const { row, reason } = rejectModal;
    setRejectModal(null);
    startTransition(async () => {
      const res = await decideDiscountApprovalAction(row.id, {
        decision: "rejected",
        reason: reason.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `已駁回 ${row.quote_no ?? row.id.slice(0, 8)}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // 反價金額 → 原始成交金額（用來換算反價%）
  function resolveOriginalAmount(row: DiscountApprovalRow): number | null {
    if (row.vehicle_amount != null) return row.vehicle_amount;
    if (row.discount_amount != null && row.discount_pct) {
      return row.discount_amount / (row.discount_pct / 100);
    }
    return null;
  }

  // 反價
  const doCounterOffer = () => {
    if (!counterModal) return;
    const { row, amount, reason } = counterModal;
    const amt = parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) {
      showBanner({ ok: false, msg: "請輸入有效的反價金額" });
      return;
    }
    const original = resolveOriginalAmount(row);
    if (!original) {
      showBanner({ ok: false, msg: "缺少原始成交金額，無法換算反價折扣%" });
      return;
    }
    const pct = Math.round(((original - amt) / original) * 10000) / 100;
    setCounterModal(null);
    startTransition(async () => {
      const res = await decideDiscountApprovalAction(row.id, {
        decision: "counter_offer",
        counter_offer_amount: amt,
        counter_offer_pct: pct,
        reason: reason.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `已送出反價 ${row.quote_no ?? row.id.slice(0, 8)}，待業務員回覆` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputCls =
    "h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white";

  // ── Columns ──────────────────────────────────────────────────

  const columns: DataGridColumn<DiscountApprovalRow>[] = [
    {
      id: "in_store_waiting",
      header: "優先",
      width: 64,
      hideable: false,
      sortable: false,
      cell: (r) =>
        r.in_store_waiting ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#CC0000] text-white whitespace-nowrap">
            客戶在場
          </span>
        ) : null,
      exportValue: (r) => (r.in_store_waiting ? "客戶在場" : ""),
    },
    {
      id: "quote_no",
      header: "報價單號",
      width: 160,
      hideable: false,
      cell: (r) =>
        r.quote_id ? (
          <Link
            href={`/sales/quote/${r.quote_id}`}
            target="_blank"
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline text-[12px]"
          >
            {r.quote_no ?? r.quote_id.slice(0, 8)}
          </Link>
        ) : (
          <span className="font-mono text-[11.5px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.quote_no ?? "",
      sortValue: (r) => r.quote_no ?? "",
    },
    {
      id: "vehicle_model_name",
      header: "車款",
      width: 160,
      cell: (r) => (
        <span className="text-[12px] text-[#2C2C2A]">
          {r.vehicle_model_name ?? "—"}
        </span>
      ),
      exportValue: (r) => r.vehicle_model_name ?? "",
      sortValue: (r) => r.vehicle_model_name ?? "",
    },
    {
      id: "discount_pct",
      header: "折扣%",
      width: 80,
      align: "right",
      cell: (r) => (
        <span
          className={`font-mono text-[12px] font-semibold ${
            r.discount_pct && r.discount_pct > 5 ? "text-[#CC0000]" : "text-[#2C2C2A]"
          }`}
        >
          {r.discount_pct != null ? `${r.discount_pct}%` : "—"}
        </span>
      ),
      exportValue: (r) => (r.discount_pct != null ? String(r.discount_pct) : ""),
      sortValue: (r) => r.discount_pct ?? 0,
    },
    {
      id: "discount_amount",
      header: "折扣金額",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#CC0000]">
          {r.discount_amount != null ? `- ${fmtNT(r.discount_amount)}` : "—"}
        </span>
      ),
      exportValue: (r) => (r.discount_amount != null ? String(r.discount_amount) : ""),
      sortValue: (r) => r.discount_amount ?? 0,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => <StatusChip status={r.status as DiscountApprovalStatus} />,
      exportValue: (r) =>
        DISCOUNT_APPROVAL_STATUS_LABELS[r.status as DiscountApprovalStatus] ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "deadline_at",
      header: "剩餘時間",
      width: 110,
      sortable: false,
      cell: (r) =>
        r.status === "pending" || r.status === "escalated" ? (
          <CountdownCell deadlineAt={r.deadline_at} />
        ) : (
          <span className="text-[11px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.deadline_at ?? "",
    },
    {
      id: "requester_name",
      header: "申請人",
      width: 100,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">{r.requester_name ?? "—"}</span>
      ),
      exportValue: (r) => r.requester_name ?? "",
      sortValue: (r) => r.requester_name ?? "",
    },
    {
      id: "requested_at",
      header: "申請時間",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {fmtDateTime(r.requested_at)}
        </span>
      ),
      exportValue: (r) => fmtDateTime(r.requested_at),
      sortValue: (r) => r.requested_at,
    },
    {
      id: "approver_name",
      header: "審核人",
      width: 100,
      defaultHidden: true,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">{r.approver_name ?? "—"}</span>
      ),
      exportValue: (r) => r.approver_name ?? "",
      sortValue: (r) => r.approver_name ?? "",
    },
  ];

  return (
    <div className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">折扣簽核</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_M5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          報價折扣超授權審核佇列 — 客戶在場案件優先
        </span>
      </header>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* KPI 橫列 */}
      <section className="grid grid-cols-3 gap-2.5">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890] font-medium">待審核</div>
          <div className="text-[22px] font-semibold text-[#2C2C2A] mt-0.5">
            {kpis.total_pending}
          </div>
        </div>
        <div
          className={`rounded-lg px-4 py-3 border ${
            kpis.in_store_waiting > 0
              ? "bg-[#FDECEA] border-[#F5AEAD]"
              : "bg-white border-[#EEECE6]"
          }`}
        >
          <div
            className={`text-[11px] font-medium ${
              kpis.in_store_waiting > 0 ? "text-[#CC0000]" : "text-[#9A9890]"
            }`}
          >
            客戶在場（緊急）
          </div>
          <div
            className={`text-[22px] font-semibold mt-0.5 ${
              kpis.in_store_waiting > 0 ? "text-[#CC0000]" : "text-[#2C2C2A]"
            }`}
          >
            {kpis.in_store_waiting}
          </div>
        </div>
        <div
          className={`rounded-lg px-4 py-3 border ${
            kpis.overdue > 0
              ? "bg-[#FDF3E3] border-[#E6C97A]"
              : "bg-white border-[#EEECE6]"
          }`}
        >
          <div
            className={`text-[11px] font-medium ${
              kpis.overdue > 0 ? "text-[#854F0B]" : "text-[#9A9890]"
            }`}
          >
            已逾時
          </div>
          <div
            className={`text-[22px] font-semibold mt-0.5 ${
              kpis.overdue > 0 ? "text-[#854F0B]" : "text-[#2C2C2A]"
            }`}
          >
            {kpis.overdue}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              className={inputCls}
              value={localStatus}
              onChange={(e) => setLocalStatus(e.target.value)}
            >
              <option value="">全部</option>
              <option value="pending">待審核</option>
              <option value="approved">已核准</option>
              <option value="rejected">已駁回</option>
              <option value="escalated">已升級</option>
              <option value="expired">已逾時</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">篩選</label>
            <label className="flex items-center gap-1.5 h-[30px] cursor-pointer text-[12.5px]">
              <input
                type="checkbox"
                checked={localInStore}
                onChange={(e) => setLocalInStore(e.target.checked)}
              />
              <span>僅顯示客戶在場</span>
            </label>
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
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/approvals/discount"
        exportFileName="discount-approvals"
        emptyMessage="目前沒有待審核的折扣申請"
        disabled={isPending}
        rowActionsWidth={230}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={(r) =>
          canApprove &&
          (r.status === "pending" || r.status === "escalated") ? (
            <>
              <button
                onClick={() => setApproveModal(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d9f0c8] disabled:opacity-50"
              >
                核准
              </button>
              <button
                onClick={() =>
                  setCounterModal({
                    row: r,
                    amount:
                      resolveOriginalAmount(r) != null
                        ? String(Math.round((resolveOriginalAmount(r) as number) - (r.discount_amount ?? 0) / 2))
                        : "",
                    reason: "",
                  })
                }
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#E6C97A] text-[#854F0B] hover:bg-[#f9ecd0] disabled:opacity-50"
              >
                反價
              </button>
              <button
                onClick={() => setRejectModal({ row: r, reason: "" })}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                駁回
              </button>
            </>
          ) : null
        }
      />

      {/* 核准 Confirm Modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">確認核准</h3>
            </header>
            <div className="px-4 py-4 text-[13px] text-[#5A5955] space-y-1">
              <div>
                報價單：
                <span className="font-mono font-semibold text-[#2C2C2A]">
                  {approveModal.quote_no ?? "—"}
                </span>
              </div>
              <div>
                申請折扣：
                <span className="font-mono text-[#CC0000]">
                  {approveModal.discount_pct != null
                    ? `${approveModal.discount_pct}%`
                    : "—"}
                  {approveModal.discount_amount != null
                    ? `（- ${fmtNT(approveModal.discount_amount)}）`
                    : ""}
                </span>
              </div>
              {approveModal.in_store_waiting && (
                <div className="text-[#CC0000] font-medium text-[12px]">
                  ⚠ 客戶目前在場等候
                </div>
              )}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setApproveModal(null)}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={() => doApprove(approveModal)}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "處理中⋯" : "確認核准"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 駁回 Modal（含原因輸入） */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h3 className="text-[14px] font-semibold text-[#CC0000]">駁回折扣申請</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="text-[12.5px] text-[#5A5955]">
                報價單：
                <span className="font-mono font-semibold text-[#2C2C2A] ml-1">
                  {rejectModal.row.quote_no ?? "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">駁回原因（選填）</label>
                <textarea
                  rows={3}
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                  placeholder="說明駁回原因，將回傳給業務員…"
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setRejectModal(null)}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={doReject}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                {isPending ? "處理中⋯" : "確認駁回"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 反價 Modal（店長填可接受成交金額，送回業務員） */}
      {counterModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h3 className="text-[14px] font-semibold text-[#854F0B]">反價 — 提出可接受成交金額</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="text-[12.5px] text-[#5A5955]">
                報價單：
                <span className="font-mono font-semibold text-[#2C2C2A] ml-1">
                  {counterModal.row.quote_no ?? "—"}
                </span>
              </div>
              <div className="text-[12px] text-[#9A9890]">
                業務員原申請：
                <span className="font-mono text-[#CC0000] ml-1">
                  {counterModal.row.discount_pct != null ? `${counterModal.row.discount_pct}%` : "—"}
                  {counterModal.row.discount_amount != null
                    ? `（- ${fmtNT(counterModal.row.discount_amount)}）`
                    : ""}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">可接受成交金額（NT$）</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={counterModal.amount}
                  onChange={(e) => setCounterModal({ ...counterModal, amount: e.target.value })}
                  placeholder="輸入反價金額"
                  className="h-[32px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">說明（選填）</label>
                <textarea
                  rows={2}
                  value={counterModal.reason}
                  onChange={(e) => setCounterModal({ ...counterModal, reason: e.target.value })}
                  placeholder="將回傳給業務員…"
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                />
              </div>
              <div className="text-[11px] text-[#9A9890]">
                ⚠ 業務員需於 24 小時內回報客戶是否接受，逾時系統將自動取消訂單並釋放車輛。
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setCounterModal(null)}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                onClick={doCounterOffer}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6d4009] disabled:opacity-60"
              >
                {isPending ? "處理中⋯" : "送出反價"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
