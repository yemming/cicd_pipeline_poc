"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { StockIssueDetail, StockIssueDetailLine } from "@/domain/issues";
import { updateIssue, voidIssue } from "@/domain/issues";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
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

export function InternalSaleDetailView({
  issue,
  canEdit,
}: {
  issue: StockIssueDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const [editNotes, setEditNotes] = useState(issue.notes ?? "");
  const [editLineNotes, setEditLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(issue.lines.map((l) => [l.id, l.notes ?? ""])),
  );

  const statusDef = STATUS_LABEL[issue.status ?? ""] ?? STATUS_LABEL.posted;
  const isCancelled = issue.status === "cancelled";

  function showBanner(b: Banner, autoCloseMs?: number) {
    setBanner(b);
    if (b?.ok && autoCloseMs) window.setTimeout(() => setBanner(null), autoCloseMs);
  }
  function enterEdit() {
    setEditNotes(issue.notes ?? "");
    setEditLineNotes(
      Object.fromEntries(issue.lines.map((l) => [l.id, l.notes ?? ""])),
    );
    setMode("edit");
  }
  function cancelEdit() {
    setMode("view");
    setBanner(null);
  }
  function saveEdit() {
    const changedLines = issue.lines
      .map((l) => ({
        id: l.id,
        notes: (editLineNotes[l.id] ?? "").trim() || null,
        original: (l.notes ?? "").trim() || null,
      }))
      .filter((l) => l.notes !== l.original)
      .map((l) => ({ id: l.id, notes: l.notes }));

    const headerChanged = (editNotes.trim() || null) !== ((issue.notes ?? "").trim() || null);
    if (!headerChanged && changedLines.length === 0) {
      showBanner({ ok: true, msg: "沒有變更" }, 1800);
      setMode("view");
      return;
    }
    startTransition(async () => {
      const patch: { notes?: string | null; line_notes?: typeof changedLines } = {};
      if (headerChanged) patch.notes = editNotes.trim() || null;
      if (changedLines.length > 0) patch.line_notes = changedLines;
      const res = await updateIssue(issue.id, patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" }, 2200);
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: `儲存失敗：${res.error}` });
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
      const res = await voidIssue(issue.id, reason);
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

  const totalQty = issue.lines.reduce((s, l) => s + Number(l.qty_issued ?? 0), 0);
  const totalAmount = issue.lines.reduce((s, l) => s + Number(l.line_amount ?? 0), 0);
  const lineCount = issue.lines.length;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/internal-sale" className="hover:text-[#185FA5]">
            內售出貨
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{issue.gi_no}</span>
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
                href="/parts/issue/internal-sale"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/parts/issue/internal-sale/new"
                className={`h-[30px] px-4 rounded-full text-[12px] font-medium inline-flex items-center shadow-sm ${
                  canEdit
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#0F6E56] text-white opacity-50 pointer-events-none"
                }`}
              >
                ＋ 新增內售出貨
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

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">內售出貨單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {issue.gi_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
                {issue.customer_name ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    買方：{issue.customer_name}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                    未指定買方
                  </span>
                )}
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955]">{issue.warehouse_name ?? "—"}</span>
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955] font-mono">{fmtDate(issue.issue_date)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">結算總金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              {fmtMoney(totalAmount)}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {lineCount} 筆明細 / {totalQty} 件
            </div>
          </div>
        </div>
      </header>

      {/* 基本資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="出貨單號" value={issue.gi_no} mono />
          <Kv
            label="狀態"
            value={
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}>
                {statusDef.label}
              </span>
            }
          />
          <Kv label="出庫日" value={fmtDate(issue.issue_date)} mono />
          <Kv label="買方" value={issue.customer_name ?? <span className="text-[#9A9890]">未指定</span>} />
          <Kv label="出庫倉" value={issue.warehouse_name ?? "—"} />
          <div />
          <Kv label="過帳時間" value={fmtDateTime(issue.posted_at)} mono />
          <Kv label="過帳人員" value={issue.posted_by_name ?? "—"} />
          <Kv label="GL 過帳狀態" value={issue.gl_posted ? "已過帳" : "未過帳"} />
          {isCancelled ? (
            <>
              <Kv label="作廢時間" value={fmtDateTime(issue.voided_at)} mono />
              <Kv label="作廢人員" value={issue.voided_by_name ?? "—"} />
              <Kv label="作廢原因" value={issue.void_reason ?? "—"} />
            </>
          ) : null}
          <div className="col-span-1 md:col-span-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">用途備註</div>
            {mode === "edit" ? (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            ) : (
              <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[20px]">
                {issue.notes ?? <span className="text-[#9A9890]">—</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <Tabs
        lines={issue.lines}
        mode={mode}
        editLineNotes={editLineNotes}
        setEditLineNotes={setEditLineNotes}
        totalQty={totalQty}
        totalAmount={totalAmount}
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
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">作廢內售出貨單</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                作廢後將自動把 <b>{lineCount} 筆明細</b> 的出庫量以 available 狀態建回出庫倉。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  作廢原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：員工退回、誤出貨⋯"
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
  lines,
  mode,
  editLineNotes,
  setEditLineNotes,
  totalQty,
  totalAmount,
}: {
  lines: StockIssueDetailLine[];
  mode: Mode;
  editLineNotes: Record<string, string>;
  setEditLineNotes: (next: Record<string, string>) => void;
  totalQty: number;
  totalAmount: number;
}) {
  const [tab, setTab] = useState<"lines" | "audit">("lines");
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
            出貨明細（{lines.length}）
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
              tab === "audit"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            異動紀錄
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
        ) : (
          <div className="text-[12px] text-[#9A9890] py-8 text-center">
            異動紀錄功能待開發
          </div>
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
  totalQty,
  totalAmount,
}: {
  lines: StockIssueDetailLine[];
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
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">倉位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">出貨數</th>
            <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">單位</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">原價（成本）</th>
            <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">結算單價</th>
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
              <td className="px-2 py-2 text-right font-mono">{l.qty_issued}</td>
              <td className="px-2 py-2 text-[#5A5955]">{l.uom}</td>
              <td className="px-2 py-2 text-right font-mono text-[#9A9890]">
                {l.unit_cost === null ? "—" : Number(l.unit_cost).toLocaleString("en-US")}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {l.unit_price === null ? "—" : Number(l.unit_price).toLocaleString("en-US")}
              </td>
              <td className="px-2 py-2 text-right font-mono">
                {l.line_amount === null ? "—" : Number(l.line_amount).toLocaleString("en-US")}
              </td>
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
            <td colSpan={4} className="px-2 py-2 text-[11px] text-[#9A9890]">合計</td>
            <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">{totalQty}</td>
            <td colSpan={3}></td>
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
