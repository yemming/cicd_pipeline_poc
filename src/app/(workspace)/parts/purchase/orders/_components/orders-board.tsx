"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { PurchaseOrderListRow, PurchaseOrderKpis } from "@/domain/orders";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, FlowDiagram, type FlowNode, type FlowEdge } from "@/components/visualization";

import { PORowActions, type PoActionResult } from "./po-row-actions";

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
  draft:             { label: "草稿",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  pending:           { label: "待審核",   chip: "bg-[#FDF3E3] text-[#854F0B]" },
  submitted:         { label: "已送出",   chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:          { label: "已核准",   chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  partial:           { label: "部分到貨", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  partial_received:  { label: "部分到貨", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  closed:            { label: "已結案",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled:         { label: "已取消",   chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TYPE_LABEL: Record<string, string> = {
  planned:    "計畫採購",
  urgent:     "緊急採購",
  standard:   "標準採購",
  ad_hoc:     "臨時採購",
  oem_import: "原廠匯入",
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "approved", label: "已核准" },
  { value: "partial", label: "部分到貨" },
  { value: "closed", label: "已結案" },
  { value: "cancelled", label: "已取消" },
];

// FlowDiagram 用：把 filter status 映到 flow node
const STATUS_TO_FLOW_NODE: Record<string, string> = {
  draft: "draft",
  submitted: "draft",
  approved: "approved",
  partial: "partial",
  partial_received: "partial",
  closed: "closed",
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function isOverdue(row: PurchaseOrderListRow, todayISO: string): boolean {
  if (!row.eta_date) return false;
  if (row.status !== "approved" && row.status !== "partial") return false;
  return row.eta_date < todayISO;
}

function daysOverdue(eta: string | null, todayISO: string): number {
  if (!eta) return 0;
  const a = new Date(eta).getTime();
  const b = new Date(todayISO).getTime();
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

export function OrdersBoard({
  rows,
  canEdit,
  initialStatus,
  initialQ,
  kpis,
}: {
  rows: PurchaseOrderListRow[];
  canEdit: boolean;
  initialStatus: string;
  initialQ: string;
  kpis: PurchaseOrderKpis;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [banner, setBanner] = useState<Banner>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    startTransition(() =>
      router.push(`/parts/purchase/orders${params.toString() ? "?" + params : ""}`),
    );
  }

  function resetFilter() {
    setStatus("");
    setQ("");
    startTransition(() => router.push("/parts/purchase/orders"));
  }

  function handleRowResult(r: PoActionResult) {
    flash(r);
    if (r.ok) router.refresh();
  }

  function askApprove(po: PurchaseOrderListRow, run: () => void) {
    setConfirmModal({
      title: "確認審核",
      message: (
        <>
          確認審核「<b>{po.po_no ?? "—"}</b>」？核准後即可進入入庫流程。
        </>
      ),
      confirmLabel: "確認審核",
      confirmTone: "success",
      onConfirm: () => {
        setConfirmModal(null);
        run();
      },
    });
  }

  function askCancel(po: PurchaseOrderListRow, run: () => void) {
    setConfirmModal({
      title: "確認取消",
      message: (
        <>
          確定取消「<b>{po.po_no ?? "—"}</b>」？此動作無法還原；已部分入庫的單據不可取消。
        </>
      ),
      confirmLabel: "確認取消",
      confirmTone: "danger",
      onConfirm: () => {
        setConfirmModal(null);
        run();
      },
    });
  }

  // FlowDiagram nodes / edges：固定 5 步流程
  const flowNodes: FlowNode[] = useMemo(
    () => [
      { id: "draft",     label: "草稿",     tone: "amber" },
      { id: "approved",  label: "已核准",   tone: "green" },
      { id: "partial",   label: "部分到貨", tone: "blue" },
      { id: "closed",    label: "已結案",   tone: "gray" },
    ],
    [],
  );
  const flowEdges: FlowEdge[] = useMemo(
    () => [
      { from: "draft",    to: "approved" },
      { from: "approved", to: "partial" },
      { from: "partial",  to: "closed" },
      { from: "approved", to: "closed", label: "全收貨" },
    ],
    [],
  );
  const currentFlowNode = STATUS_TO_FLOW_NODE[status] ?? undefined;

  const columns: DataGridColumn<PurchaseOrderListRow>[] = useMemo(
    () => [
      {
        id: "po_no",
        header: "PO 編號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/purchase/orders/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.po_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.po_no ?? "",
        sortValue: (r) => r.po_no ?? "",
      },
      {
        id: "vendor_name",
        header: "供應商",
        width: 180,
        cell: (r) => <span className="text-[12.5px]">{r.vendor_name ?? "—"}</span>,
        exportValue: (r) => r.vendor_name ?? "",
        sortValue: (r) => r.vendor_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "入庫倉",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "purchase_type",
        header: "類型",
        width: 100,
        cell: (r) => (
          <span className="text-[12px]">
            {TYPE_LABEL[r.purchase_type ?? ""] ?? r.purchase_type ?? "—"}
          </span>
        ),
        exportValue: (r) =>
          TYPE_LABEL[r.purchase_type ?? ""] ?? r.purchase_type ?? "",
        sortValue: (r) => r.purchase_type ?? "",
      },
      {
        id: "po_date",
        header: "下單日",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.po_date)}</span>,
        exportValue: (r) => r.po_date ?? "",
        sortValue: (r) => r.po_date ?? "",
      },
      {
        id: "eta_date",
        header: "預計到貨",
        width: 130,
        cell: (r) => {
          const overdue = isOverdue(r, todayISO);
          if (!overdue) {
            return <span className="font-mono text-[12px]">{fmtDate(r.eta_date)}</span>;
          }
          const days = daysOverdue(r.eta_date, todayISO);
          return (
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-[12px] text-[#CC0000] font-semibold">
                {fmtDate(r.eta_date)}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] whitespace-nowrap">
                ⚠ 逾期 {days}d
              </span>
            </span>
          );
        },
        exportValue: (r) => r.eta_date ?? "",
        sortValue: (r) => r.eta_date ?? "",
      },
      {
        id: "amount_total",
        header: "含稅金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtMoney(r.amount_total)}</span>
        ),
        exportValue: (r) => r.amount_total ?? 0,
        sortValue: (r) => r.amount_total ?? 0,
      },
      {
        id: "receipt_progress_pct",
        header: "到貨進度",
        width: 130,
        align: "right",
        cell: (r) => {
          const pct = r.receipt_progress_pct ?? 0;
          if (r.status === "draft" || r.status === "cancelled") {
            return <span className="font-mono text-[12px] text-[#9A9890]">—</span>;
          }
          const color =
            pct >= 100
              ? "bg-[#0F6E56]"
              : pct >= 50
                ? "bg-[#185FA5]"
                : "bg-[#854F0B]";
          return (
            <div className="flex items-center gap-1.5 justify-end">
              <div className="w-[60px] h-[6px] bg-[#F2F2F2] rounded overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="font-mono text-[11px] text-[#5A5955] w-[34px] text-right">
                {pct}%
              </span>
            </div>
          );
        },
        exportValue: (r) => r.receipt_progress_pct ?? 0,
        sortValue: (r) => r.receipt_progress_pct ?? 0,
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.pending;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.pending).label,
        sortValue: (r) => r.status ?? "",
      },
    ],
    [todayISO],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品採購</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          建立採購單、供應商確認、追蹤到貨進度
        </span>
      </header>

      {/* KPI Row — 5 cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="本月新增"
          value={kpis.newThisMonth}
          tone="blue"
          icon={<span className="text-[18px]">📝</span>}
        />
        <KpiCard
          label="待審核"
          value={kpis.pendingApproval}
          tone="amber"
          icon={<span className="text-[18px]">⏳</span>}
        />
        <KpiCard
          label="在途中"
          value={kpis.inTransit}
          tone="teal"
          icon={<span className="text-[18px]">🚚</span>}
        />
        <KpiCard
          label="本月已收貨"
          value={kpis.receivedThisMonth}
          tone="green"
          icon={<span className="text-[18px]">✅</span>}
        />
        <KpiCard
          label="逾期"
          value={kpis.overdue}
          tone="red"
          icon={<span className="text-[18px]">⚠️</span>}
        />
      </section>

      {/* Flow Diagram — PO 狀態流 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-[#2C2C2A]">採購單狀態流</span>
          <span className="text-[11px] text-[#9A9890]">
            {currentFlowNode
              ? `目前篩選：${STATUS_LABEL[status]?.label ?? status}`
              : "點選下方狀態欄位篩選"}
          </span>
        </div>
        <FlowDiagram
          nodes={flowNodes}
          edges={flowEdges}
          currentNodeId={currentFlowNode}
          orientation="horizontal"
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
            <label className="text-[11px] text-[#9A9890] font-medium">PO 編號搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 PO 編號..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
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
              href="/parts/purchase/orders/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
            >
              ＋ 新增採購單
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆採購單
          {kpis.overdue > 0 ? (
            <>
              {" "}
              <span className="text-[#CC0000] font-medium">
                · 含 {kpis.overdue} 筆逾期
              </span>
            </>
          ) : null}
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/purchase/orders"
        exportFileName="purchase-orders"
        emptyMessage={
          initialStatus || initialQ
            ? "沒有符合條件的採購單。試試調整篩選或重置篩選。"
            : "尚無採購單。點右上「＋ 新增採購單」開始建立。"
        }
        disabled={isPending}
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <Link
              href={`/parts/purchase/orders/${r.id}`}
              className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
            >
              詳細
            </Link>
            {canEdit ? (
              <PORowActions
                poId={r.id}
                status={r.status ?? ""}
                onResult={handleRowResult}
                onApproveAsk={(run) => askApprove(r, run)}
                onCancelAsk={(run) => askCancel(r, run)}
              />
            ) : null}
          </>
        )}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有採購建立 / 審核權限（PO_CREATE），僅能檢視
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
