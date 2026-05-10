"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteDraftEntryAction } from "@/lib/accounting/journal-entry-actions";
import type { JournalEntryRow } from "@/lib/accounting/queries";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  posted: "已過帳",
  reversed: "已沖銷",
};
const STATUS_CHIP: Record<string, string> = {
  draft: "bg-[#FDF3E3] text-[#854F0B]",
  posted: "bg-[#EAF3DE] text-[#3B6D11]",
  reversed: "bg-[#F2F2F2] text-[#6B6A68]",
};

export type JournalEntryFilterState = {
  q?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
};

const fmtAmount = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

export function JournalEntryBoard({
  rows,
  totalCount,
  filters,
}: {
  rows: JournalEntryRow[];
  totalCount: number;
  filters: JournalEntryFilterState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");
  const [fFrom, setFFrom] = useState(filters.date_from ?? "");
  const [fTo, setFTo] = useState(filters.date_to ?? "");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const p = new URLSearchParams();
    if (fQ.trim()) p.set("q", fQ.trim());
    if (fStatus !== "all") p.set("status", fStatus);
    if (fFrom) p.set("date_from", fFrom);
    if (fTo) p.set("date_to", fTo);
    const qs = p.toString();
    startTransition(() => {
      router.push(qs ? `/admin/accounting/journal-entries?${qs}` : "/admin/accounting/journal-entries");
    });
  };

  const resetFilters = () => {
    setFQ("");
    setFStatus("all");
    setFFrom("");
    setFTo("");
    startTransition(() => router.push("/admin/accounting/journal-entries"));
  };

  const onDelete = (r: JournalEntryRow) => {
    if (r.status !== "draft") {
      showBanner({ ok: false, msg: "只有草稿可刪除" });
      return;
    }
    if (!confirm(`確定刪除草稿「${r.entry_no}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteDraftEntryAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const summary = useMemo(() => {
    const counts = { draft: 0, posted: 0, reversed: 0 };
    for (const r of rows) counts[r.status as keyof typeof counts]++;
    return { total: totalCount, shown: rows.length, ...counts };
  }, [rows, totalCount]);

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">會計分錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Journal Entries v1.0
        </span>
        <span className="text-[12px] text-[#9A9890]">
          draft / posted / reversed 三狀態 · DB trigger 過帳前驗 4 條（借貸平衡 / 至少 1 行 / L5 入帳 / 必填維度齊備）
        </span>
      </header>

      {/* 2. Banner */}
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

      {/* 3. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="傳票編號 / 摘要"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="draft">草稿</option>
              <option value="posted">已過帳</option>
              <option value="reversed">已沖銷</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>起日</label>
            <input
              type="date"
              className={inputClass}
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>迄日</label>
            <input
              type="date"
              className={inputClass}
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={() => router.push("/admin/accounting/journal-entries/new")}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增分錄
            </button>
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{summary.total}</b> 筆分錄（顯示{" "}
          <b>{summary.shown}</b> 筆 · 草稿 <b>{summary.draft}</b> · 已過帳{" "}
          <b>{summary.posted}</b> · 已沖銷 <b>{summary.reversed}</b>）
        </span>
      </div>

      {/* 5. Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4] sticky top-0">
              <tr>
                <th className="text-left font-medium py-2 px-3 w-[180px]">傳票編號</th>
                <th className="text-left font-medium py-2 px-3 w-[110px]">日期</th>
                <th className="text-left font-medium py-2 px-3">摘要</th>
                <th className="text-right font-medium py-2 px-3 w-[60px]">行數</th>
                <th className="text-right font-medium py-2 px-3 w-[120px]">總金額</th>
                <th className="text-left font-medium py-2 px-3 w-[80px]">狀態</th>
                <th className="text-right font-medium py-2 px-3 w-[140px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-mono text-[12px]">{r.entry_no}</td>
                  <td className="py-2 px-3 text-[#5A5955]">{r.entry_date}</td>
                  <td className="py-2 px-3">
                    <span className="text-[#2C2C2A]">{r.description ?? "—"}</span>
                  </td>
                  <td className="py-2 px-3 text-right text-[11.5px] text-[#5A5955]">
                    {r.line_count ?? 0}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[11.5px] text-[#2C2C2A]">
                    {fmtAmount(r.total_amount ?? 0)}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                        STATUS_CHIP[r.status] ?? "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => router.push(`/admin/accounting/journal-entries/${r.id}`)}
                        disabled={isPending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        檢視
                      </button>
                      {r.status === "draft" && (
                        <button
                          onClick={() => onDelete(r)}
                          disabled={isPending}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的分錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
