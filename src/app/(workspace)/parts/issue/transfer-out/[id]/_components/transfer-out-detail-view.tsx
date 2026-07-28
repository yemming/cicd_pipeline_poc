"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  StockTransferDetail,
  StockTransferDetailLine,
  TransferSubsidiaryInfo,
  TransferTimelineEvent,
} from "@/domain/transfers";
import { updateTransfer, cancelTransfer } from "@/domain/transfers";
import { Timeline } from "@/components/visualization/Timeline";
import type { ToneKey } from "@/components/visualization/tone";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:      { label: "待核准",   chip: "bg-[#FDF3E3] text-[#854F0B]" },
  in_transit: { label: "在途",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial:    { label: "部分收貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received:   { label: "已收貨",   chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed:     { label: "已結案",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled:  { label: "已取消",   chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TYPE_LABEL: Record<string, string> = {
  inter_store: "店間調撥",
  intra_store: "店內調撥",
  warranty_to_temp: "保固轉暫存",
  consignment_to_main: "寄銷轉自有",
};

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

export function TransferOutDetailView({
  transfer,
  canEdit,
  subsidiaryInfo,
  timeline,
}: {
  transfer: StockTransferDetail;
  canEdit: boolean;
  subsidiaryInfo: TransferSubsidiaryInfo;
  timeline: TransferTimelineEvent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [editNotes, setEditNotes] = useState(transfer.notes ?? "");
  const [editReason, setEditReason] = useState(transfer.reason ?? "");
  const [editEta, setEditEta] = useState(transfer.expected_arrival_date ?? "");
  const [editProvider, setEditProvider] = useState(transfer.logistics_provider ?? "");
  const [editTrackingNo, setEditTrackingNo] = useState(transfer.logistics_tracking_no ?? "");
  const [editLineNotes, setEditLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(transfer.lines.map((l) => [l.id, l.notes ?? ""])),
  );

  const statusDef = STATUS_LABEL[transfer.status ?? ""] ?? STATUS_LABEL.in_transit;
  const isCancelled = transfer.status === "cancelled";
  const canCancel =
    transfer.status === "draft" ||
    transfer.status === "in_transit" ||
    transfer.status === "partial";

  function showBanner(b: Banner, autoCloseMs?: number) {
    setBanner(b);
    if (b?.ok && autoCloseMs) window.setTimeout(() => setBanner(null), autoCloseMs);
  }

  function enterEdit() {
    setEditNotes(transfer.notes ?? "");
    setEditReason(transfer.reason ?? "");
    setEditEta(transfer.expected_arrival_date ?? "");
    setEditProvider(transfer.logistics_provider ?? "");
    setEditTrackingNo(transfer.logistics_tracking_no ?? "");
    setEditLineNotes(
      Object.fromEntries(transfer.lines.map((l) => [l.id, l.notes ?? ""])),
    );
    setMode("edit");
  }
  function cancelEdit() {
    setMode("view");
    setBanner(null);
  }

  function saveEdit() {
    const changedLines = transfer.lines
      .map((l) => ({
        id: l.id,
        notes: (editLineNotes[l.id] ?? "").trim() || null,
        original: (l.notes ?? "").trim() || null,
      }))
      .filter((l) => l.notes !== l.original)
      .map((l) => ({ id: l.id, notes: l.notes }));

    const patch: Parameters<typeof updateTransfer>[1] = {};
    const cur = (val: string, orig: string | null) =>
      (val.trim() || null) !== ((orig ?? "").trim() || null);
    if (cur(editNotes, transfer.notes)) patch.notes = editNotes.trim() || null;
    if (cur(editReason, transfer.reason)) patch.reason = editReason.trim() || null;
    if ((editEta || null) !== (transfer.expected_arrival_date ?? null))
      patch.expected_arrival_date = editEta || null;
    if (cur(editProvider, transfer.logistics_provider))
      patch.logistics_provider = editProvider.trim() || null;
    if (cur(editTrackingNo, transfer.logistics_tracking_no))
      patch.logistics_tracking_no = editTrackingNo.trim() || null;
    if (changedLines.length > 0) patch.line_notes = changedLines;

    if (Object.keys(patch).length === 0) {
      showBanner({ ok: true, msg: "沒有變更" }, 1800);
      setMode("view");
      return;
    }

    startTransition(async () => {
      const res = await updateTransfer(transfer.id, patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" }, 2200);
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `儲存失敗：${res.error}` });
      }
    });
  }

  function confirmCancel() {
    const reason = cancelReason.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫取消原因" });
      return;
    }
    startTransition(async () => {
      const res = await cancelTransfer(transfer.id, reason);
      if (res.ok) {
        setCancelModalOpen(false);
        setCancelReason("");
        showBanner({ ok: true, msg: "✓ 已取消" }, 2200);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `取消失敗：${res.error}` });
      }
    });
  }

  const totalReq = transfer.lines.reduce((s, l) => s + l.qty_requested, 0);
  const totalShipped = transfer.lines.reduce((s, l) => s + l.qty_shipped, 0);
  const totalRecv = transfer.lines.reduce((s, l) => s + l.qty_received, 0);
  const lineCount = transfer.lines.length;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/transfer-out" className="hover:text-[#185FA5]">
            調撥出庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{transfer.tr_no}</span>
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
                href="/parts/issue/transfer-out"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/parts/issue/transfer-out/new"
                className={`h-[30px] px-4 rounded-full text-[12px] font-medium inline-flex items-center shadow-sm ${
                  canEdit
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
                }`}
              >
                ＋ 新增調撥
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
                  window.open(`/print/stock-transfer/${transfer.id}`, "_blank")
                }
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
                title="列印 / 另存 PDF"
              >
                <span className="material-symbols-outlined text-[14px]">
                  print
                </span>
                列印
              </button>
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => setCancelModalOpen(true)}
                  disabled={!canEdit}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  取消調撥
                </button>
              ) : null}
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

      {/* 1.5 跨主體警示 */}
      {subsidiaryInfo.is_cross_subsidiary ? (
        <div className="bg-[#FDF3E3] border border-[#F5C97A] rounded-md px-4 py-2.5 text-[12.5px] text-[#854F0B] flex items-start gap-2">
          <span className="text-[14px]">⚠️</span>
          <div className="flex-1">
            <b>跨主體調撥</b>
            <span className="ml-1.5">
              {subsidiaryInfo.src_subsidiary_name ?? "—"} →{" "}
              {subsidiaryInfo.tgt_subsidiary_name ?? "—"}
            </span>
            <span className="ml-1 text-[11.5px] text-[#9A6F11]">
              需走 INTER_COMPANY_TRANSFER 分錄（未實作）。出貨側不會自動 GL 結轉、會計需手動補。
            </span>
          </div>
        </div>
      ) : null}

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">調撥單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {transfer.tr_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                  {TYPE_LABEL[transfer.transfer_type] ?? transfer.transfer_type}
                </span>
                <span className="text-[#5A5955]">
                  {transfer.source_warehouse_name ?? "—"}
                </span>
                <span className="text-[#9A9890]">→</span>
                <span className="text-[#5A5955]">
                  {transfer.target_warehouse_name ?? "—"}
                </span>
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955] font-mono">{fmtDate(transfer.ship_date)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[280px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">申請 / 出貨 / 收貨</div>
            <div className="text-[16px] font-semibold text-[#1A3A5C] font-mono">
              {totalReq} / {totalShipped} / {totalRecv}
            </div>
            <div className="text-[11px] text-[#9A9890]">共 {lineCount} 筆明細</div>
          </div>
        </div>
      </header>

      {/* 基本資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="調撥單號" value={transfer.tr_no} mono />
          <Kv
            label="狀態"
            value={
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}>
                {statusDef.label}
              </span>
            }
          />
          <Kv
            label="調撥類型"
            value={TYPE_LABEL[transfer.transfer_type] ?? transfer.transfer_type ?? "—"}
          />
          <Kv label="來源倉" value={transfer.source_warehouse_name ?? "—"} />
          <Kv label="目標倉" value={transfer.target_warehouse_name ?? "—"} />
          <Kv
            label="調撥原因"
            value={
              mode === "edit" ? (
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className={inputClass + " w-full"}
                />
              ) : (
                transfer.reason ?? "—"
              )
            }
          />
          <Kv label="出貨日" value={fmtDate(transfer.ship_date)} mono />
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
                <span className="font-mono">{fmtDate(transfer.expected_arrival_date)}</span>
              )
            }
          />
          <Kv label="實際到貨" value={fmtDate(transfer.actual_arrival_date)} mono />
          <Kv
            label="物流商"
            value={
              mode === "edit" ? (
                <input
                  type="text"
                  value={editProvider}
                  onChange={(e) => setEditProvider(e.target.value)}
                  className={inputClass + " w-full"}
                />
              ) : (
                transfer.logistics_provider ?? "—"
              )
            }
          />
          <Kv
            label="物流單號"
            value={
              mode === "edit" ? (
                <input
                  type="text"
                  value={editTrackingNo}
                  onChange={(e) => setEditTrackingNo(e.target.value)}
                  className={inputClass + " w-full"}
                />
              ) : (
                <span className="font-mono">{transfer.logistics_tracking_no ?? "—"}</span>
              )
            }
          />
          <div />
          <Kv label="出貨時間" value={fmtDateTime(transfer.shipped_at)} mono />
          <Kv label="出貨人員" value={transfer.shipped_by_name ?? "—"} />
          <div />
          <Kv label="收貨時間" value={fmtDateTime(transfer.received_at)} mono />
          <Kv label="收貨人員" value={transfer.received_by_name ?? "—"} />
          <div />
          {isCancelled ? (
            <>
              <Kv label="取消時間" value={fmtDateTime(transfer.voided_at)} mono />
              <Kv label="取消人員" value={transfer.voided_by_name ?? "—"} />
              <Kv label="取消原因" value={transfer.void_reason ?? "—"} />
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
                {transfer.notes ?? <span className="text-[#9A9890]">—</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <Tabs
        lines={transfer.lines}
        mode={mode}
        editLineNotes={editLineNotes}
        setEditLineNotes={setEditLineNotes}
        totalReq={totalReq}
        totalShipped={totalShipped}
        totalRecv={totalRecv}
        timeline={timeline}
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

      {/* Cancel Modal */}
      {cancelModalOpen ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setCancelModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">取消調撥單</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                取消後將自動把在途庫存（in_transit）搬回 <b>{transfer.source_warehouse_name ?? "來源倉"}</b>、翻 available。
                已收貨單請至 transfer-in 走作廢、不可在此取消。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  取消原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="例如：來源倉誤判庫存、目標倉拒收⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={isPending || !cancelReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "取消中⋯" : "確認取消"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const TIMELINE_TONE: Record<TransferTimelineEvent["kind"], ToneKey> = {
  created: "gray",
  shipped: "blue",
  in_transit: "amber",
  partial: "amber",
  received: "green",
  cancelled: "red",
};

function Tabs({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalReq,
  totalShipped,
  totalRecv,
  timeline,
}: {
  lines: StockTransferDetailLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalReq: number;
  totalShipped: number;
  totalRecv: number;
  timeline: TransferTimelineEvent[];
}) {
  const [tab, setTab] = useState<"lines" | "timeline">("lines");

  const timelineEvents = timeline.map((e) => ({
    id: e.id,
    time: new Date(e.at),
    title: e.title,
    description: e.description,
    tone: TIMELINE_TONE[e.kind],
  }));

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
            調撥明細（{lines.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab("timeline")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
              tab === "timeline"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            生命週期（{timeline.length}）
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
            totalReq={totalReq}
            totalShipped={totalShipped}
            totalRecv={totalRecv}
          />
        ) : timelineEvents.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-8 text-center">
            尚無事件紀錄
          </div>
        ) : (
          <Timeline events={timelineEvents} variant="vertical" />
        )}
      </div>
    </>
  );
}

function LinesTable({
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalReq,
  totalShipped,
  totalRecv,
}: {
  lines: StockTransferDetailLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalReq: number;
  totalShipped: number;
  totalRecv: number;
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
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">源倉位</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">目標倉位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[70px]">申請</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[70px]">出貨</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[70px]">收貨</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">單位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">單價</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">備註</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]/60">
              <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
              <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{l.item_code ?? "—"}</td>
              <td className="px-2 py-2">{l.item_name ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-[#5A5955]">{l.source_bin_label ?? "—"}</td>
              <td className="px-2 py-2 font-mono text-[#5A5955]">{l.target_bin_label ?? "—"}</td>
              <td className="px-2 py-2 text-right font-mono">{l.qty_requested}</td>
              <td className="px-2 py-2 text-right font-mono">{l.qty_shipped}</td>
              <td className="px-2 py-2 text-right font-mono">{l.qty_received}</td>
              <td className="px-2 py-2 text-[#5A5955]">{l.uom}</td>
              <td className="px-2 py-2 text-right font-mono">{l.unit_cost.toLocaleString("en-US")}</td>
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
            <td colSpan={5} className="px-2 py-2 text-[11px] text-[#9A9890]">合計</td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">{totalReq}</td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">{totalShipped}</td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">{totalRecv}</td>
            <td colSpan={3}></td>
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
