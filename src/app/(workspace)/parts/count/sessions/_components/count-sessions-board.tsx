"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CountSessionListRow } from "@/domain/count";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  in_progress: { label: "盤點中", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  pending_approval: { label: "待審核", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted: { label: "已過帳", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

export function CountSessionsBoard({
  rows,
  canEdit,
  initialStatus,
}: {
  rows: CountSessionListRow[];
  canEdit: boolean;
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    startTransition(() =>
      router.push(`/parts/count/sessions${params.toString() ? "?" + params : ""}`),
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">盤點處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          8.2
        </span>
        <span className="text-[12px] text-[#9A9890]">執行中或已完成的盤點作業（條碼掃描）</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="in_progress">盤點中</option>
              <option value="pending_approval">待審核</option>
              <option value="approved">已核准</option>
              <option value="posted">已過帳</option>
            </select>
          </div>
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
            disabled={!canEdit}
            title={canEdit ? "Phase 2 開放" : "沒有權限"}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-60 cursor-not-allowed ml-auto"
          >
            ＋ 啟動盤點
          </button>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 場盤點
        </span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">盤點單號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">盤點日期</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">總筆數 / 差異筆數</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">差異金額</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">狀態</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">凍結倉庫</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的盤點
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
                  return (
                    <tr key={r.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                      <td className="px-3 py-2 font-mono text-[12px] text-[#1A3A5C] font-semibold">
                        {r.ct_no ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12.5px]">{r.warehouse_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fmtDate(r.count_date)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {r.total_lines ?? 0} / <span className="text-[#854F0B]">{r.variance_lines ?? 0}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {fmtMoney(r.variance_amount)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
                          {def.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px]">
                        {r.freeze_warehouse ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">凍結中</span>
                        ) : (
                          <span className="text-[#9A9890]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
