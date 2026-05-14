"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  approveCountAdjustmentAction,
  cancelCountSessionAction,
  submitCountSessionAction,
  type CountOpsRow,
  type CountSessionLine,
} from "@/domain/count";
import {
  COUNT_STATUS_CHIP,
  COUNT_TYPE_CHIP,
  fmtDate,
  fmtMoney,
  isCountActive,
} from "@/domain/count.constants";

type Banner = { ok: boolean; msg: string } | null;

function fmtDateTime(d: string | null): string {
  return d ? new Date(d).toLocaleString("zh-TW") : "—";
}

export function CountSessionDetailView({
  detail,
  canExecute,
  canApprove,
}: {
  detail: { ct: CountOpsRow; lines: CountSessionLine[] };
  canExecute: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const { ct, lines: initialLines } = detail;
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitDraft, setSubmitDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialLines.map((l) => [
        l.id,
        l.qty_final != null
          ? String(l.qty_final)
          : l.qty_first_count != null
            ? String(l.qty_first_count)
            : String(l.qty_system),
      ]),
    ),
  );
  const [submitNotes, setSubmitNotes] = useState("");

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const statusDef =
    COUNT_STATUS_CHIP[ct.status] ?? COUNT_STATUS_CHIP.counting;
  const typeDef = COUNT_TYPE_CHIP[ct.count_type] ?? COUNT_TYPE_CHIP.manual;

  const isActive = isCountActive(ct.status);
  const isPendingApproval = ct.status === "pending_approval";
  const isCompleted = ct.status === "completed";

  const totalSubmitted = useMemo(() => {
    let diffLines = 0;
    let amount = 0;
    for (const l of initialLines) {
      const v = Number(submitDraft[l.id] ?? l.qty_system);
      const diff = v - l.qty_system;
      if (diff !== 0) {
        diffLines++;
        amount += diff * Number(l.unit_cost ?? 0);
      }
    }
    return { diffLines, amount: Math.round(amount * 100) / 100 };
  }, [submitDraft, initialLines]);

  const handleSubmit = () => {
    if (!canExecute) return;
    const payloadLines = initialLines.map((l) => ({
      line_id: l.id,
      qty_final: Number(submitDraft[l.id] ?? l.qty_system),
    }));
    startTransition(async () => {
      const res = await submitCountSessionAction({
        ct_id: ct.id,
        lines: payloadLines,
        notes: submitNotes || undefined,
      });
      if (res.ok) {
        flash({
          ok: true,
          msg: `✓ ${ct.ct_no} 首盤已提交，待覆核（差異 ${res.data.variance_lines} 筆）`,
        });
        setSubmitOpen(false);
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  const handleApprove = () => {
    if (!canApprove) return;
    if (
      !confirm(
        `確認核可 ${ct.ct_no}？\n差異 ${ct.variance_lines} 筆將自動產生 STOCK_ADJUSTMENT_GAIN/LOSS 分錄。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await approveCountAdjustmentAction(ct.id);
      if (res.ok) {
        flash({
          ok: true,
          msg: `✓ ${ct.ct_no} 已核可，調整單 ${res.data.adj_no ?? "—"}`,
        });
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  const handleCancel = () => {
    if (!canExecute) return;
    if (!confirm(`確認取消盤點 ${ct.ct_no}？\n明細將被清空、不可復原。`)) return;
    startTransition(async () => {
      const res = await cancelCountSessionAction(ct.id);
      if (res.ok) {
        flash({ ok: true, msg: `✓ ${ct.ct_no} 已取消` });
        router.push("/parts/operations/count-ops");
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <main
      className={`px-6 py-5 space-y-3 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/operations/count-ops"
            className="hover:text-[#185FA5]"
          >
            庫存盤點作業
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{ct.ct_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/count-ops"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {canExecute ? (
            <Link
              href="/parts/operations/count-ops/new"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              ＋ 新建 session
            </Link>
          ) : null}
          {canExecute && isActive ? (
            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              提交首盤
            </button>
          ) : null}
          {canApprove && isPendingApproval ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              核可盤點
            </button>
          ) : null}
          {canExecute && (isActive || isPendingApproval) ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              取消盤點
            </button>
          ) : null}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                盤點 SESSION
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {ct.ct_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${typeDef.chip}`}
                >
                  {typeDef.label}
                </span>
                <span className="text-[#5A5955]">·</span>
                <span className="text-[#5A5955]">
                  {ct.warehouse_name ?? "—"}
                </span>
                <span className="text-[#5A5955]">·</span>
                <span className="text-[#5A5955] font-mono">
                  盤點日 {fmtDate(ct.count_date)}
                </span>
              </div>
            </div>
          </div>
          {/* 差異彙總 */}
          <div className="shrink-0 grid grid-cols-3 gap-3">
            <SmallStat
              label="應盤點"
              value={String(ct.total_lines ?? 0)}
              color="text-[#1A3A5C]"
            />
            <SmallStat
              label="已盤點"
              value={`${ct.counted_lines} (${ct.progress_pct.toFixed(0)}%)`}
              color="text-[#0F6E56]"
            />
            <SmallStat
              label="差異"
              value={`${ct.variance_lines ?? 0} 筆 / ${fmtMoney(ct.variance_amount ?? 0)}`}
              color={
                Number(ct.variance_amount ?? 0) < 0
                  ? "text-[#CC0000]"
                  : Number(ct.variance_amount ?? 0) > 0
                    ? "text-[#0F6E56]"
                    : "text-[#5A5955]"
              }
            />
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="盤點任務號" value={ct.ct_no} mono />
          <Kv label="盤點類型" value={typeDef.label} />
          <Kv label="盤點倉" value={ct.warehouse_name ?? "—"} />
          <Kv label="盤點日期" value={fmtDate(ct.count_date)} mono />
          <Kv
            label="凍結倉庫"
            value={ct.freeze_warehouse ? "是（盤點期間鎖出入庫）" : "否"}
          />
          <Kv label="計畫關聯" value={ct.plan_id ? "（plan）" : "—"} />
          <Kv
            label="建立時間"
            value={fmtDateTime(ct.created_at)}
            small
          />
          <Kv label="覆核時間" value={fmtDateTime(ct.approved_at)} small />
          <Kv label="備註" value={ct.notes ?? "—"} small />
        </div>
      </section>

      {/* 明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 盤點明細 ({initialLines.length})
          </span>
          {isCompleted ? (
            <span className="text-[11px] text-[#9A9890]">
              已核可，明細已轉為 inventory_adjustments
            </span>
          ) : null}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F7F4] text-[#5A5955]">
              <tr>
                <th className="px-3 py-2 text-left w-12">#</th>
                <th className="px-3 py-2 text-left">備件代碼</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-left w-24">庫位</th>
                <th className="px-3 py-2 text-right w-20">系統量</th>
                <th className="px-3 py-2 text-right w-20">首盤</th>
                <th className="px-3 py-2 text-right w-20">差異</th>
                <th className="px-3 py-2 text-right w-24">差異金額</th>
              </tr>
            </thead>
            <tbody>
              {initialLines.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-[#9A9890]"
                  >
                    本盤點 session 沒有明細
                  </td>
                </tr>
              ) : null}
              {initialLines.map((l) => (
                <tr key={l.id} className="border-b border-[#EEECE6]">
                  <td className="px-3 py-2 font-mono text-[11.5px] text-[#9A9890]">
                    {l.line_no}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px]">
                    {l.item_code ?? "—"}
                  </td>
                  <td className="px-3 py-2">{l.item_name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">
                    {l.bin_label ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.qty_system}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {l.qty_first_count ?? "—"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      l.variance == null
                        ? "text-[#9A9890]"
                        : l.variance < 0
                          ? "text-[#CC0000]"
                          : l.variance > 0
                            ? "text-[#0F6E56]"
                            : "text-[#5A5955]"
                    }`}
                  >
                    {l.variance == null
                      ? "—"
                      : l.variance > 0
                        ? `+${l.variance}`
                        : l.variance}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      l.variance_amount == null
                        ? "text-[#9A9890]"
                        : Number(l.variance_amount) < 0
                          ? "text-[#CC0000]"
                          : Number(l.variance_amount) > 0
                            ? "text-[#0F6E56]"
                            : "text-[#5A5955]"
                    }`}
                  >
                    {l.variance_amount == null
                      ? "—"
                      : fmtMoney(l.variance_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Submit modal */}
      {submitOpen ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">
                提交首盤 — {ct.ct_no}
              </h2>
              <button
                type="button"
                onClick={() => setSubmitOpen(false)}
                className="text-[#9A9890] hover:text-[#2C2C2A]"
              >
                ✕
              </button>
            </header>
            <div className="px-5 py-3 overflow-y-auto flex-1">
              <p className="text-[12px] text-[#5A5955] mb-3">
                填入每行的實盤數量（預設帶系統量）。提交後狀態變為「待覆核」、計算差異。
              </p>
              <table className="w-full text-[12px]">
                <thead className="text-[#5A5955]">
                  <tr className="border-b border-[#EEECE6]">
                    <th className="px-2 py-1 text-left w-10">#</th>
                    <th className="px-2 py-1 text-left">備件</th>
                    <th className="px-2 py-1 text-right w-20">系統量</th>
                    <th className="px-2 py-1 text-right w-28">實盤量</th>
                    <th className="px-2 py-1 text-right w-20">差異</th>
                  </tr>
                </thead>
                <tbody>
                  {initialLines.map((l) => {
                    const v = Number(submitDraft[l.id] ?? l.qty_system);
                    const diff = v - l.qty_system;
                    return (
                      <tr key={l.id} className="border-b border-[#F2F2F2]">
                        <td className="px-2 py-1 font-mono text-[#9A9890]">
                          {l.line_no}
                        </td>
                        <td className="px-2 py-1">
                          <div className="font-mono text-[11px] text-[#5A5955]">
                            {l.item_code ?? "—"}
                          </div>
                          <div className="text-[11.5px]">
                            {l.item_name ?? "—"}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {l.qty_system}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input
                            type="number"
                            min={0}
                            value={submitDraft[l.id] ?? ""}
                            onChange={(e) =>
                              setSubmitDraft((s) => ({
                                ...s,
                                [l.id]: e.target.value,
                              }))
                            }
                            className="w-20 h-7 border border-[#D5D3CB] rounded px-2 text-right text-[12.5px] font-mono"
                          />
                        </td>
                        <td
                          className={`px-2 py-1 text-right font-mono ${
                            diff < 0
                              ? "text-[#CC0000]"
                              : diff > 0
                                ? "text-[#0F6E56]"
                                : "text-[#9A9890]"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3">
                <label className="text-[11px] text-[#9A9890]">備註</label>
                <textarea
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] mt-1"
                  rows={2}
                />
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-between">
              <span className="text-[11.5px] text-[#5A5955]">
                差異 <b>{totalSubmitted.diffLines}</b> 筆 / 金額{" "}
                <b
                  className={
                    totalSubmitted.amount < 0
                      ? "text-[#CC0000]"
                      : totalSubmitted.amount > 0
                        ? "text-[#0F6E56]"
                        : "text-[#5A5955]"
                  }
                >
                  {fmtMoney(totalSubmitted.amount)}
                </b>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubmitOpen(false)}
                  disabled={isPending}
                  className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                >
                  {isPending ? "提交中⋯" : "提交首盤"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}

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
    </main>
  );
}

function SmallStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="text-center px-3 py-2 rounded border border-[#EEECE6] bg-[#F8F7F4]">
      <div className="text-[10px] text-[#9A9890]">{label}</div>
      <div className={`text-[14px] font-semibold font-mono ${color} mt-0.5`}>
        {value}
      </div>
    </div>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
