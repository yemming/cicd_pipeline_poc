"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  StockReceiptDetail,
  StockReceiptDetailLine,
} from "@/domain/receipts";
import { payReceipt, returnReceipt, updateReceipt, voidReceipt } from "@/domain/receipts";
import { KpiCard } from "@/components/visualization/KpiCard";
import { Timeline, type TimelineEvent } from "@/components/visualization/Timeline";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  completed: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted:    { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
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

export function ReceiptDetailView({
  receipt,
  canEdit,
}: {
  receipt: StockReceiptDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // edit form state
  const [editNotes, setEditNotes] = useState(receipt.notes ?? "");
  const [editDate, setEditDate] = useState(receipt.receipt_date ?? "");
  const [editLineNotes, setEditLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(receipt.lines.map((l) => [l.id, l.notes ?? ""])),
  );

  const statusDef = STATUS_LABEL[receipt.status ?? ""] ?? STATUS_LABEL.completed;
  const isCancelled = receipt.status === "cancelled";
  const payment = (receipt.metadata as { payment?: { status?: string } } | null)?.payment ?? null;
  const isPaid = payment?.status === "paid";
  const returnMeta = (receipt.metadata as { return?: { status?: string } } | null)?.return ?? null;
  const isReturned = returnMeta?.status === "returned";

  function showBanner(b: Banner, autoCloseMs?: number) {
    setBanner(b);
    if (b?.ok && autoCloseMs) {
      window.setTimeout(() => setBanner(null), autoCloseMs);
    }
  }

  function enterEdit() {
    setEditNotes(receipt.notes ?? "");
    setEditDate(receipt.receipt_date ?? "");
    setEditLineNotes(
      Object.fromEntries(receipt.lines.map((l) => [l.id, l.notes ?? ""])),
    );
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setBanner(null);
  }

  function saveEdit() {
    const changedLines = receipt.lines
      .map((l) => ({
        id: l.id,
        notes: (editLineNotes[l.id] ?? "").trim() || null,
        original: (l.notes ?? "").trim() || null,
      }))
      .filter((l) => l.notes !== l.original)
      .map((l) => ({ id: l.id, notes: l.notes }));

    const headerChanged =
      (editNotes.trim() || null) !== (receipt.notes ?? "").trim()
      || editDate !== (receipt.receipt_date ?? "");

    if (!headerChanged && changedLines.length === 0) {
      showBanner({ ok: true, msg: "沒有變更" }, 1800);
      setMode("view");
      return;
    }

    startTransition(async () => {
      const res = await updateReceipt(receipt.id, {
        notes: editNotes.trim() || null,
        receipt_date: editDate,
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

  function confirmPay() {
    if (!window.confirm("確認結款？將自動產生會計分錄並 posted。")) return;
    startTransition(async () => {
      const res = await payReceipt({ receipt_id: receipt.id });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已結款（自動產分錄）" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `結款失敗：${res.error}` });
      }
    });
  }

  function confirmReturn() {
    if (!window.confirm("確認退回供應商？將自動產生沖銷分錄（C 庫存 / C 進項稅 / D 應付）並 posted。")) return;
    startTransition(async () => {
      const res = await returnReceipt({ receipt_id: receipt.id });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已退回供應商（自動產分錄）" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `退回失敗：${res.error}` });
      }
    });
  }

  function confirmVoid() {
    const reason = voidReason.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫作廢原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidReceipt(receipt.id, reason);
      if (res.ok) {
        setVoidModalOpen(false);
        setVoidReason("");
        showBanner({ ok: true, msg: "✓ 已作廢" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `作廢失敗：${res.error}` });
      }
    });
  }

  const totalQty = receipt.lines.reduce((s, l) => s + l.qty_received, 0);
  const totalAmount = receipt.lines.reduce((s, l) => s + l.line_amount, 0);
  const lineCount = receipt.lines.length;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/receipt/po-grn" className="hover:text-[#185FA5]">
            採購入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{receipt.gr_no}</span>
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
                href="/parts/receipt/po-grn"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/parts/receipt/po-grn/new"
                className={`h-[30px] px-4 rounded-full text-[12px] font-medium inline-flex items-center shadow-sm ${
                  canEdit
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
                }`}
              >
                ＋ 新增入庫
              </Link>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit || isCancelled}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={() =>
                  window.open(`/print/stock-receipt/${receipt.id}`, "_blank")
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
                onClick={confirmPay}
                disabled={!canEdit || isCancelled || isPaid || isReturned || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "結款中⋯" : isPaid ? "已結款" : "結款"}
              </button>
              <button
                type="button"
                onClick={confirmReturn}
                disabled={!canEdit || isCancelled || isPaid || isReturned || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#FDF3E3] border border-[#F5C97A] text-[#854F0B] hover:bg-[#fbe9c5] shadow-sm disabled:opacity-50"
              >
                {isPending ? "退貨中⋯" : isReturned ? "已退回" : "↩ 退回供應商"}
              </button>
              <button
                type="button"
                onClick={() => setVoidModalOpen(true)}
                disabled={!canEdit || isCancelled}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                作廢
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
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[11px] tracking-wider text-[#9A9890]">採購入庫單</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
              {receipt.gr_no}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
              >
                {statusDef.label}
              </span>
              {isPaid ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                  已結款
                </span>
              ) : null}
              {isReturned ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  已退回
                </span>
              ) : null}
              {receipt.source_po_no ? (
                <Link
                  href={`/parts/purchase/orders/${receipt.source_doc_id}`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] hover:underline font-mono"
                >
                  來源 PO：{receipt.source_po_no}
                </Link>
              ) : null}
              <span className="text-[#9A9890]">·</span>
              <span className="text-[#5A5955] font-mono">{fmtDate(receipt.receipt_date)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <KpiCard
              label="入庫總金額"
              value={fmtMoney(totalAmount)}
              tone="blue"
              layout="vertical"
            />
            <KpiCard
              label="明細筆數"
              value={lineCount}
              tone="teal"
              layout="vertical"
            />
            <KpiCard
              label="入庫總件數"
              value={totalQty}
              tone="green"
              layout="vertical"
            />
            <KpiCard
              label="付款狀態"
              value={isPaid ? "已結款" : isReturned ? "已退回" : "未結款"}
              tone={isPaid ? "green" : isReturned ? "amber" : "gray"}
              layout="vertical"
            />
          </div>
        </div>
      </header>

      {/* 3. ▼ 基本資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="入庫單號" value={receipt.gr_no} mono />
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
            label="入庫日期"
            value={
              mode === "edit" ? (
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={inputClass + " w-full"}
                />
              ) : (
                <span className="font-mono">{fmtDate(receipt.receipt_date)}</span>
              )
            }
          />
          <Kv label="供應商" value={receipt.vendor_name ?? "—"} />
          <Kv label="入庫倉" value={receipt.warehouse_name ?? "—"} />
          <Kv
            label="來源 PO"
            value={
              receipt.source_po_no ? (
                <Link
                  href={`/parts/purchase/orders/${receipt.source_doc_id}`}
                  className="text-[#185FA5] hover:underline font-mono"
                >
                  {receipt.source_po_no}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <Kv label="過帳時間" value={fmtDateTime(receipt.posted_at)} mono />
          <Kv label="過帳人員" value={receipt.posted_by_name ?? "—"} />
          <Kv label="GL 過帳狀態" value={receipt.gl_posted ? "已過帳" : "未過帳"} />
          {isCancelled ? (
            <>
              <Kv label="作廢時間" value={fmtDateTime(receipt.voided_at)} mono />
              <Kv label="作廢人員" value={receipt.voided_by_name ?? "—"} />
              <Kv label="作廢原因" value={receipt.void_reason ?? "—"} />
            </>
          ) : null}
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
                {receipt.notes ?? <span className="text-[#9A9890]">—</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Tabs */}
      <Tabs
        receipt={receipt}
        mode={mode}
        editLineNotes={editLineNotes}
        setEditLineNotes={setEditLineNotes}
        totalQty={totalQty}
        totalAmount={totalAmount}
      />

      {/* 6. Banner */}
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

      {/* Void Modal */}
      {voidModalOpen ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setVoidModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">作廢入庫單</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                作廢後將自動沖回 <b>{lineCount} 筆庫存</b>、還原來源 PO 的收貨進度。
                若任一庫存已被消耗，無法作廢。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  作廢原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：供應商送錯品項、品項損壞退回⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Tabs({
  receipt,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalQty,
  totalAmount,
}: {
  receipt: StockReceiptDetail;
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalQty: number;
  totalAmount: number;
}) {
  const [tab, setTab] = useState<"lines" | "timeline" | "payment">("lines");
  const lines = receipt.lines;

  const meta = (receipt.metadata ?? {}) as {
    payment?: {
      status?: string;
      paid_at?: string;
      bank_id?: string;
      amount?: number;
    };
    return?: {
      status?: string;
      returned_at?: string;
      reason?: string | null;
      net_amount?: number;
      tax_amount?: number;
    };
  };
  const payment = meta.payment ?? null;
  const ret = meta.return ?? null;

  // 採購流程 timeline 事件
  const events: TimelineEvent[] = [];
  if (receipt.source_po_no) {
    events.push({
      id: "po",
      time: "PO 核准",
      title: `採購單 ${receipt.source_po_no}`,
      description: "供應商已確認、待收貨",
      tone: "blue",
    });
  }
  events.push({
    id: "grn",
    time: fmtDate(receipt.receipt_date),
    title: `${receipt.gr_no} 入庫`,
    description: `${lines.length} 筆明細 / ${totalQty} 件 / ${fmtMoney(totalAmount)}（庫存已寫入）`,
    tone: "teal",
  });
  if (receipt.posted_at) {
    events.push({
      id: "posted",
      time: fmtDateTime(receipt.posted_at),
      title: "已過帳",
      description: receipt.posted_by_name
        ? `過帳人：${receipt.posted_by_name}（自動產 PARTS_PURCHASE 分錄）`
        : "自動產 PARTS_PURCHASE 分錄",
      tone: "green",
    });
  }
  if (payment?.status === "paid") {
    events.push({
      id: "paid",
      time: payment.paid_at ? fmtDateTime(payment.paid_at) : "—",
      title: "已結款",
      description: `銀行：${payment.bank_id ?? "—"} / 金額 ${fmtMoney(payment.amount ?? 0)}（VENDOR_PAYMENT_BANK 已產分錄）`,
      tone: "green",
    });
  }
  if (ret?.status === "returned") {
    events.push({
      id: "returned",
      time: ret.returned_at ? fmtDateTime(ret.returned_at) : "—",
      title: "已退回供應商",
      description: ret.reason
        ? `原因：${ret.reason}（PARTS_RETURN_TO_SUPPLIER 已產分錄）`
        : "PARTS_RETURN_TO_SUPPLIER 已產分錄",
      tone: "amber",
    });
  }
  if (receipt.status === "cancelled") {
    events.push({
      id: "cancelled",
      time: fmtDateTime(receipt.voided_at),
      title: "已作廢",
      description: receipt.void_reason
        ? `原因：${receipt.void_reason}（庫存已沖回、PO 進度還原）`
        : "庫存已沖回、PO 進度還原",
      tone: "red",
    });
  }

  return (
    <>
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <button
            type="button"
            onClick={() => setTab("lines")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] ${
              tab === "lines"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            入庫明細（{lines.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab("timeline")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] ${
              tab === "timeline"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            採購流程
          </button>
          <button
            type="button"
            onClick={() => setTab("payment")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
              tab === "payment"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            付款與退貨
          </button>
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "lines" ? (
          <LinesTable
            lines={lines}
            mode={mode}
            editLineNotes={editLineNotes}
            setEditLineNotes={setEditLineNotes}
            totalQty={totalQty}
            totalAmount={totalAmount}
          />
        ) : tab === "timeline" ? (
          events.length > 0 ? (
            <Timeline events={events} variant="vertical" />
          ) : (
            <div className="text-[12px] text-[#9A9890] py-8 text-center">
              尚無流程紀錄
            </div>
          )
        ) : (
          <PaymentPanel
            payment={payment}
            returnInfo={ret}
            totalAmount={totalAmount}
          />
        )}
      </div>
    </>
  );
}

function PaymentPanel({
  payment,
  returnInfo,
  totalAmount,
}: {
  payment: {
    status?: string;
    paid_at?: string;
    bank_id?: string;
    amount?: number;
  } | null;
  returnInfo: {
    status?: string;
    returned_at?: string;
    reason?: string | null;
    net_amount?: number;
    tax_amount?: number;
  } | null;
  totalAmount: number;
}) {
  const isPaid = payment?.status === "paid";
  const isReturned = returnInfo?.status === "returned";
  const taxAmount = Math.round(totalAmount * 0.05 * 100) / 100;
  const grossAmount = Math.round((totalAmount + taxAmount) * 100) / 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* 付款卡 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">付款資訊</h2>
        </header>
        <div className="px-4 py-3 space-y-2 text-[12.5px]">
          <Kv
            label="付款狀態"
            value={
              isPaid ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                  已結款
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                  未結款
                </span>
              )
            }
          />
          <Kv label="未稅金額" value={fmtMoney(totalAmount)} mono />
          <Kv label="稅額（5%）" value={fmtMoney(taxAmount)} mono />
          <Kv label="含稅總額" value={fmtMoney(grossAmount)} mono />
          {isPaid ? (
            <>
              <Kv label="付款銀行" value={payment?.bank_id ?? "—"} />
              <Kv
                label="付款金額"
                value={fmtMoney(payment?.amount ?? 0)}
                mono
              />
              <Kv label="付款時間" value={fmtDateTime(payment?.paid_at)} mono />
            </>
          ) : null}
        </div>
      </section>

      {/* 退貨卡 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">退貨資訊</h2>
        </header>
        <div className="px-4 py-3 space-y-2 text-[12.5px]">
          <Kv
            label="退貨狀態"
            value={
              isReturned ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  已退回供應商
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                  未退回
                </span>
              )
            }
          />
          {isReturned ? (
            <>
              <Kv
                label="退回未稅"
                value={fmtMoney(returnInfo?.net_amount ?? 0)}
                mono
              />
              <Kv
                label="退回稅額"
                value={fmtMoney(returnInfo?.tax_amount ?? 0)}
                mono
              />
              <Kv
                label="退回時間"
                value={fmtDateTime(returnInfo?.returned_at)}
                mono
              />
              <Kv label="退回原因" value={returnInfo?.reason ?? "—"} />
            </>
          ) : (
            <div className="text-[11.5px] text-[#9A9890] py-2">
              此入庫單尚未退回供應商。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function LinesTable({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalQty,
  totalAmount,
}: {
  lines: StockReceiptDetailLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalQty: number;
  totalAmount: number;
}) {
  if (lines.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-8 text-center">無明細</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[50px]">行號</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">品項代碼</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">品項名稱</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">入庫倉位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">入庫數</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">單位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">單價</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">金額</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">備註</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]/60">
              <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
              <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{l.item_code ?? "—"}</td>
              <td className="px-2 py-2">{l.item_name ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-[#5A5955]">{l.bin_label ?? "—"}</td>
              <td className="px-2 py-2 text-right font-mono">{l.qty_received}</td>
              <td className="px-2 py-2 text-[#5A5955]">{l.uom}</td>
              <td className="px-2 py-2 text-right font-mono">{l.unit_cost.toLocaleString("en-US")}</td>
              <td className="px-2 py-2 text-right font-mono">{l.line_amount.toLocaleString("en-US")}</td>
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
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
            <td colSpan={4} className="px-2 py-2 text-[11px] text-[#9A9890]">
              合計
            </td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
              {totalQty}
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
