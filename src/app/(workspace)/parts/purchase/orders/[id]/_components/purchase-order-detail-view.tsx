"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  PurchaseOrderDetail,
  PurchaseOrderDetailLine,
  PurchaseOrderReceiptRef,
} from "@/domain/orders";
import {
  updatePurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
} from "@/domain/orders";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:            { label: "草稿",     chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted:        { label: "已送出",   chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:         { label: "已核准",   chip: "bg-[#EAF4FB] text-[#185FA5]" },
  partial:          { label: "部分入庫", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  closed:           { label: "已結案",   chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  partial_received: { label: "部分入庫", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received:         { label: "已入庫",   chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled:        { label: "已取消",   chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const PURCHASE_TYPE_LABEL: Record<string, string> = {
  planned:     "計畫採購",
  replenish:   "補貨採購",
  emergency:   "緊急採購",
  promotional: "促銷採購",
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";

export function PurchaseOrderDetailView({
  order,
  canEdit,
}: {
  order: PurchaseOrderDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "cancel" | null>(null);

  // edit form state
  const [editNotes, setEditNotes] = useState(order.notes ?? "");
  const [editEta, setEditEta] = useState(order.eta_date ?? "");
  const [editType, setEditType] = useState(order.purchase_type ?? "planned");
  const [editLineNotes, setEditLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(order.lines.map((l) => [l.id, l.notes ?? ""])),
  );

  const statusDef = STATUS_LABEL[order.status ?? ""] ?? STATUS_LABEL.draft;
  const isDraft = order.status === "draft";
  const isApproved = order.status === "approved";
  const canModify = isDraft || isApproved || order.status === "partial";
  const canApprove = isDraft;
  const canCancel = isDraft || isApproved;
  const progressPct = order.receipt_progress_pct ?? 0;

  function showBanner(b: Banner, autoCloseMs?: number) {
    setBanner(b);
    if (b?.ok && autoCloseMs) {
      window.setTimeout(() => setBanner(null), autoCloseMs);
    }
  }

  function enterEdit() {
    setEditNotes(order.notes ?? "");
    setEditEta(order.eta_date ?? "");
    setEditType(order.purchase_type ?? "planned");
    setEditLineNotes(
      Object.fromEntries(order.lines.map((l) => [l.id, l.notes ?? ""])),
    );
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setBanner(null);
  }

  function saveEdit() {
    const norm = (s: string) => s.trim() || null;
    const headerPatch = {
      notes: norm(editNotes),
      eta_date: editEta || null,
      purchase_type: editType,
    };
    const headerChanged =
      headerPatch.notes !== (order.notes ?? null)
      || headerPatch.eta_date !== (order.eta_date ?? null)
      || headerPatch.purchase_type !== (order.purchase_type ?? "planned");

    const changedLines = order.lines
      .map((l) => ({
        id: l.id,
        notes: (editLineNotes[l.id] ?? "").trim() || null,
        original: (l.notes ?? "").trim() || null,
      }))
      .filter((l) => l.notes !== l.original)
      .map((l) => ({ id: l.id, notes: l.notes }));

    if (!headerChanged && changedLines.length === 0) {
      showBanner({ ok: true, msg: "沒有變更" }, 1800);
      setMode("view");
      return;
    }

    startTransition(async () => {
      const res = await updatePurchaseOrder(order.id, {
        ...headerPatch,
        line_notes: changedLines,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" }, 2200);
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `儲存失敗：${res.error}` });
      }
    });
  }

  function runApprove() {
    startTransition(async () => {
      const res = await approvePurchaseOrder(order.id);
      if (res.ok) {
        setConfirmAction(null);
        showBanner({ ok: true, msg: "✓ 已核准" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `核准失敗：${res.error}` });
      }
    });
  }

  function runCancel() {
    startTransition(async () => {
      const res = await cancelPurchaseOrder(order.id);
      if (res.ok) {
        setConfirmAction(null);
        showBanner({ ok: true, msg: "✓ 已取消" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `取消失敗：${res.error}` });
      }
    });
  }

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/purchase/orders" className="hover:text-[#185FA5]">
            商品採購
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{order.po_no}</span>
          {mode === "edit" ? (
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <>
              <Link
                href="/parts/purchase/orders"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/parts/purchase/orders/new"
                className={`h-[30px] px-4 rounded-full text-[12px] font-medium inline-flex items-center shadow-sm ${
                  canEdit
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
                }`}
              >
                ＋ 新增採購單
              </Link>
              <button
                type="button"
                onClick={() => setConfirmAction("approve")}
                disabled={!canEdit || !canApprove}
                title={!canApprove ? "僅草稿狀態可核准" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                核准
              </button>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit || !canModify}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open(`/print/purchase-order/${order.id}`, "_blank")
                }
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
                title="列印 / 另存 PDF"
              >
                <span className="material-symbols-outlined text-[14px]">
                  print
                </span>
                列印
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction("cancel")}
                disabled={!canEdit || !canCancel}
                title={!canCancel ? "僅草稿/已核准且尚未入庫可取消" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">商品採購單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {order.po_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
                {order.vendor_name ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    {order.vendor_name}
                  </span>
                ) : null}
                {order.warehouse_name ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    收貨 {order.warehouse_name}
                  </span>
                ) : null}
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955] font-mono">下單 {fmtDate(order.po_date)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[280px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1 px-3">
            <div className="text-[11px] text-[#9A9890]">含稅金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              {fmtMoney(order.amount_total)}
            </div>
            <div className="w-full mt-1">
              <div className="flex justify-between text-[11px] text-[#9A9890] mb-0.5">
                <span>收貨進度</span>
                <span className="font-mono">{progressPct}%</span>
              </div>
              <div className="h-1.5 bg-[#EEECE6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0F6E56] rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. ▼ 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="PO 編號" value={order.po_no} mono />
          <Kv
            label="狀態"
            value={
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}
              >
                {statusDef.label}
              </span>
            }
          />
          <Kv
            label="採購類型"
            value={
              mode === "edit" ? (
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className={inputClass + " w-full"}
                >
                  {Object.entries(PURCHASE_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                PURCHASE_TYPE_LABEL[order.purchase_type ?? ""] ?? order.purchase_type
              )
            }
          />

          <Kv label="下單日" value={<span className="font-mono">{fmtDate(order.po_date)}</span>} />
          <Kv
            label="預計到貨"
            value={
              mode === "edit" ? (
                <input
                  type="date"
                  value={editEta}
                  onChange={(e) => setEditEta(e.target.value)}
                  className={inputClass + " w-full"}
                />
              ) : (
                <span className="font-mono">{fmtDate(order.eta_date)}</span>
              )
            }
          />
          <Kv
            label="收貨進度"
            value={<span className="font-mono">{progressPct}% （{order.qty_received_total} / {order.qty_ordered_total}）</span>}
          />

          <Kv label="供應商" value={order.vendor_name ?? "—"} />
          <Kv label="收貨倉" value={order.warehouse_name ?? "—"} />
          <Kv label="來源需求單" value={order.source_req_no ? <span className="font-mono">{order.source_req_no}</span> : "—"} />

          <Kv label="建立人員" value={order.created_by_name ?? "—"} />
          <Kv label="核准時間" value={fmtDateTime(order.approved_at)} mono />
          <Kv label="核准人員" value={order.approved_by_name ?? "—"} />

          <div className="col-span-1 md:col-span-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">備註</div>
            {mode === "edit" ? (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            ) : (
              <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[20px]">
                {order.notes ?? <span className="text-[#9A9890]">—</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. ▼ 金額 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 金額</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="未稅" value={<span className="font-mono">{fmtMoney(order.amount_pretax)}</span>} />
          <Kv label="稅" value={<span className="font-mono">{fmtMoney(order.amount_tax)}</span>} />
          <Kv
            label="含稅"
            value={<span className="font-mono font-semibold text-[#1A3A5C]">{fmtMoney(order.amount_total)}</span>}
          />
        </div>
      </section>

      {/* 5. Tabs */}
      <Tabs
        lines={order.lines}
        receipts={order.receipts}
        mode={mode}
        editLineNotes={editLineNotes}
        setEditLineNotes={setEditLineNotes}
      />

      {/* Banner */}
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

      {/* Confirm Modal */}
      {confirmAction ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setConfirmAction(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {confirmAction === "approve" ? "核准採購單" : "取消採購單"}
              </h3>
            </header>
            <div className="px-4 py-4">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                {confirmAction === "approve"
                  ? <>確定核准 <b className="font-mono">{order.po_no}</b>？核准後即可進入入庫流程。</>
                  : <>確定取消 <b className="font-mono">{order.po_no}</b>？此動作無法還原；已部分入庫的單據不可取消。</>}
              </p>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmAction === "approve" ? runApprove : runCancel}
                disabled={isPending}
                className={`h-[30px] px-3 rounded text-[12.5px] font-medium text-white disabled:opacity-50 ${
                  confirmAction === "approve"
                    ? "bg-[#1A3A5C] hover:bg-[#0F2A45]"
                    : "bg-[#CC0000] hover:bg-[#A30000]"
                }`}
              >
                {isPending ? "處理中⋯" : (confirmAction === "approve" ? "確認核准" : "確認取消")}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Tabs({
  lines,
  receipts,
  mode,
  editLineNotes,
  setEditLineNotes,
}: {
  lines: PurchaseOrderDetailLine[];
  receipts: PurchaseOrderReceiptRef[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
}) {
  const [tab, setTab] = useState<"lines" | "receipts" | "audit">("lines");

  return (
    <>
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <TabButton active={tab === "lines"} onClick={() => setTab("lines")} label={`採購明細（${lines.length}）`} />
          <TabButton active={tab === "receipts"} onClick={() => setTab("receipts")} label={`入庫紀錄（${receipts.length}）`} />
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")} label="異動紀錄" />
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "lines" ? (
          <LinesTable lines={lines} mode={mode} editLineNotes={editLineNotes} setEditLineNotes={setEditLineNotes} />
        ) : tab === "receipts" ? (
          <ReceiptsTable receipts={receipts} />
        ) : (
          <div className="text-[12px] text-[#9A9890] py-8 text-center">異動紀錄功能待開發</div>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
        active
          ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
          : "text-[#5A5955] hover:bg-[#F8F7F4]"
      }`}
    >
      {label}
    </button>
  );
}

function LinesTable({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
}: {
  lines: PurchaseOrderDetailLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
}) {
  if (lines.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-8 text-center">無明細</div>;
  }
  const totalOrdered = lines.reduce((s, l) => s + l.qty_ordered, 0);
  const totalReceived = lines.reduce((s, l) => s + l.qty_received, 0);
  const totalAmount = lines.reduce((s, l) => s + l.line_amount_total, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[50px]">行號</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">品項代碼</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">品項名稱</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">單位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[140px]">訂購 / 已收</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">單價</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">未稅金額</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">含稅金額</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">備註</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const pct = l.qty_ordered > 0 ? Math.round((l.qty_received / l.qty_ordered) * 100) : 0;
            return (
              <tr key={l.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]/60">
                <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
                <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{l.item_code ?? "—"}</td>
                <td className="px-2 py-2">{l.item_name ?? "—"}</td>
                <td className="px-2 py-2 text-[#5A5955]">{l.item_uom ?? "—"}</td>
                <td className="px-2 py-2 text-right">
                  <div className="font-mono">
                    {l.qty_received} / {l.qty_ordered}
                  </div>
                  <div className="mt-1 h-1 bg-[#EEECE6] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0F6E56]"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono">{l.unit_price.toLocaleString("en-US")}</td>
                <td className="px-2 py-2 text-right font-mono">{l.line_amount_pretax.toLocaleString("en-US")}</td>
                <td className="px-2 py-2 text-right font-mono">{l.line_amount_total.toLocaleString("en-US")}</td>
                <td className="px-2 py-2">
                  {mode === "edit" ? (
                    <input
                      type="text"
                      value={editLineNotes[l.id] ?? ""}
                      onChange={(e) =>
                        setEditLineNotes({ ...editLineNotes, [l.id]: e.target.value })
                      }
                      className="w-full h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] outline-none"
                      placeholder="—"
                    />
                  ) : (
                    <span className="text-[#5A5955]">{l.notes ?? "—"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
            <td colSpan={4} className="px-2 py-2 text-[11px] text-[#9A9890]">
              合計
            </td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
              {totalReceived} / {totalOrdered}
            </td>
            <td colSpan={2}></td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
              NT$ {totalAmount.toLocaleString("en-US")}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ReceiptsTable({ receipts }: { receipts: PurchaseOrderReceiptRef[] }) {
  if (receipts.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-8 text-center">尚無入庫紀錄</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[180px]">入庫單號</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">入庫日期</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">入庫總數</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[140px]">入庫金額</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">狀態</th>
          </tr>
        </thead>
        <tbody>
          {receipts.map((r) => (
            <tr key={r.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]/60">
              <td className="px-2 py-2">
                <Link
                  href={`/parts/receipt/po-grn/${r.id}`}
                  className="font-mono font-semibold text-[#1A3A5C] hover:underline"
                >
                  {r.gr_no}
                </Link>
              </td>
              <td className="px-2 py-2 font-mono">{fmtDate(r.receipt_date)}</td>
              <td className="px-2 py-2 text-right font-mono">{r.qty_received_total}</td>
              <td className="px-2 py-2 text-right font-mono">{fmtMoney(r.amount_total)}</td>
              <td className="px-2 py-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                  {r.status === "completed" || r.status === "posted" ? "已過帳" : r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[11px] text-[#9A9890] font-medium">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""} truncate`}>
        {value}
      </div>
    </div>
  );
}
