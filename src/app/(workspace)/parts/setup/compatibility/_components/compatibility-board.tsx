"use client";

import Link from "next/link";

import type { CompatWithModel, SeriesOption } from "@/domain/compatibility";

function formatYearRange(s: number | null, e: number | null): string {
  if (!s && !e) return "—";
  if (s && e) return `${s}–${e}`;
  return s ? `${s}–` : `—${e}`;
}

export function CompatibilityBoard({
  seriesList,
  activeSeries,
  rows,
  canEdit,
}: {
  seriesList: SeriesOption[];
  activeSeries: string | null;
  rows: CompatWithModel[];
  canEdit: boolean;
}) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">適配設定（料-車/年份）</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定備件適用的車型與年份・是 Ducati 庫存系統的核心差異功能
        </span>
      </header>

      <div className="bg-[#E8F5F0] border border-[#9CCEBC] rounded-md px-4 py-2.5 text-[12px] text-[#0F6E56] flex items-center gap-2.5">
        🏍 <span>適配設定讓 SA 在開立工單時，可以<b>依車型 + 年份快速篩選</b>正確備件，避免領錯料。此功能是 Ducati 庫存管理的核心差異化設計。</span>
      </div>

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                {activeSeries ? `${activeSeries} 車系適配清單` : "請選擇車系"}
              </h2>
              <button
                type="button"
                disabled
                title="Phase 2 開放"
                className="h-[26px] px-3 rounded text-[11.5px] bg-[#0F6E56] text-white opacity-60 cursor-not-allowed"
              >
                ＋ 新增適配
              </button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#F8F7F4]">
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">車系</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">車型</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">適用年份</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">說明</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">驗證狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                        此車系尚無適配資料
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="border-t border-[#EEECE6]">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                            {r.series}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[12.5px] font-semibold">{r.model_name}</td>
                        <td className="px-3 py-2 font-mono text-[12px]">
                          {formatYearRange(r.year_start, r.year_end)}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[#5A5955]">
                          {r.notes ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.is_verified ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDF3E3] text-[#854F0B]"}`}
                          >
                            {r.is_verified ? "已驗證" : "待確認"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">反查：依車型查詢可用備件</h2>
            </header>
            <div className="px-4 py-3 text-[12px] text-[#9A9890]">
              💡 反查介面 Phase 2 接通；目前先看左欄選車系顯示已配對備件
            </div>
          </section>
        </div>

        <aside className="w-[200px] flex-shrink-0 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] font-semibold text-[#5A5955]">
            車系
          </div>
          {seriesList.length === 0 ? (
            <div className="px-3 py-6 text-[11px] text-[#9A9890] text-center">尚無車系</div>
          ) : (
            seriesList.map((s) => {
              const isActive = activeSeries === s.series;
              return (
                <Link
                  key={s.series}
                  href={`/parts/setup/compatibility?series=${encodeURIComponent(s.series)}`}
                  className={`block px-3 py-2 border-b border-[#EEECE6] last:border-b-0 hover:bg-[#F8F7F4] text-[12px] ${isActive ? "bg-[#EAF4FB] text-[#185FA5] font-medium" : "text-[#2C2C2A]"}`}
                >
                  🏍 {s.series}
                  <span className="ml-1 text-[10px] text-[#9A9890]">({s.count})</span>
                </Link>
              );
            })
          )}
        </aside>
      </div>
      {!canEdit && (
        <div className="text-[11px] text-[#9A9890]">💡 你目前沒有編輯權限，僅顯示</div>
      )}
    </main>
  );
}
