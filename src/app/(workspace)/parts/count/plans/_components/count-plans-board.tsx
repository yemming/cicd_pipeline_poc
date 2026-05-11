"use client";

import type { CountPlanListRow } from "@/domain/count";

const PLAN_TYPE_LABEL: Record<string, string> = {
  full: "全盤",
  cycle: "循環盤",
  abc: "ABC 抽盤",
  random: "隨機抽盤",
};

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleString("zh-TW", { hour12: false }).slice(0, 16) : "—";
}

export function CountPlansBoard({
  rows,
  canEdit,
}: {
  rows: CountPlanListRow[];
  canEdit: boolean;
}) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">盤點計畫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          8.1
        </span>
        <span className="text-[12px] text-[#9A9890]">設定週期性盤點計畫、自動排程</span>
      </header>

      <div className="flex items-center gap-2 justify-between">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個計畫
        </span>
        <button
          type="button"
          disabled={!canEdit}
          title={canEdit ? "Phase 2 開放" : "沒有權限"}
          className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-60 cursor-not-allowed"
        >
          ＋ 新增計畫
        </button>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">計畫名稱</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">計畫類型</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">ABC 範圍</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">排程 (cron)</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">下次執行</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">啟用</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    尚無盤點計畫
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2 text-[12.5px] font-semibold">{r.plan_name ?? "—"}</td>
                    <td className="px-3 py-2 text-[12.5px]">{r.warehouse_name ?? "全部"}</td>
                    <td className="px-3 py-2 text-[12px]">{PLAN_TYPE_LABEL[r.plan_type ?? ""] ?? r.plan_type ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px]">{r.abc_filter ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#5A5955]">{r.schedule_cron ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{fmtDate(r.next_run_at)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}
                      >
                        {r.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
