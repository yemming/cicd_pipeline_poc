"use client";

/**
 * GRP02 BSC 計分卡 — client board（2026-06-01 新建頁）
 *
 * 平衡計分卡：六大面向（銷售 / 售後 / 零件 / 人才 / 客戶滿意 / 財務）的集團均值卡
 * + 逐店計分表（門店 × 六面向，分數色票 ≥80 綠 / 60-79 橙 / <60 紅）+ 達成率與簡短說明。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useSetPageHeader } from "@/components/page-header-context";
import { HEALTH_DIM_LABEL, type HealthDim } from "@/domain/group-analytics-labels";
import type { BscScorecard } from "@/domain/group-analytics";

const DIMS: HealthDim[] = ["dim_sales", "dim_after", "dim_parts", "dim_people", "dim_csat", "dim_finance"];

function num(v: number | null, digits = 0): string {
  return v == null ? "—" : v.toFixed(digits);
}
function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
/** 分數 → 文字色票（≥80 綠 / 60-79 橙 / <60 紅）。 */
function scoreTone(v: number | null): string {
  if (v == null) return "text-[#9A9890]";
  if (v >= 80) return "text-[#3B6D11]";
  if (v >= 60) return "text-[#854F0B]";
  return "text-[#CC0000]";
}
/** 分數 → chip 底色（逐店表格用）。 */
function scoreChip(v: number | null): string {
  if (v == null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (v >= 80) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (v >= 60) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#CC0000]";
}
function rateChip(rate: number | null): string {
  if (rate == null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (rate >= 1) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (rate >= 0.9) return "bg-[#EAF4FB] text-[#185FA5]";
  if (rate >= 0.8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#CC0000]";
}

function DimCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[26px] font-bold leading-tight mt-1 ${scoreTone(value)}`}>{num(value, 0)}</div>
    </div>
  );
}

export function BscBoard({
  data,
  title = "BSC 計分卡",
  sprint = "GRP02",
  caption = "六大面向平衡計分卡 · 集團均值與逐店體質一覽",
}: {
  data: BscScorecard;
  title?: string;
  sprint?: string;
  caption?: string;
}) {
  useSetPageHeader({
    title,
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: title }],
    hideSearch: true,
  });

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{title}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">{sprint}</span>
        <span className="text-[12px] text-[#9A9890]">{caption}</span>
      </header>

      {/* 集團綜合 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">集團綜合健康分</div>
          <div className={`text-[26px] font-bold leading-tight mt-1 ${scoreTone(data.healthAvg)}`}>{num(data.healthAvg, 0)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">集團 NPS</div>
          <div className="text-[26px] font-bold leading-tight mt-1 text-[#2C2C2A]">{num(data.groupNps, 0)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">納入門店數</div>
          <div className="text-[26px] font-bold leading-tight mt-1 text-[#2C2C2A]">{String(data.storeCount)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">最高面向均值</div>
          <div className="text-[26px] font-bold leading-tight mt-1 text-[#2C2C2A]">
            {(() => {
              const best = DIMS.map((d) => ({ d, v: data.dimAvg[d] }))
                .filter((x): x is { d: HealthDim; v: number } => x.v != null)
                .sort((a, b) => b.v - a.v)[0];
              return best ? `${HEALTH_DIM_LABEL[best.d]} ${best.v.toFixed(0)}` : "—";
            })()}
          </div>
        </div>
      </div>

      {/* 六大面向集團均值卡 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 六大面向（集團均值）</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {DIMS.map((d) => (
            <DimCard key={d} label={HEALTH_DIM_LABEL[d]} value={data.dimAvg[d]} />
          ))}
        </div>
      </section>

      {/* 逐店計分表 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 逐店計分（門店 × 六面向）</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                <th className="text-left font-medium px-4 py-2">門店</th>
                {DIMS.map((d) => (
                  <th key={d} className="text-center font-medium px-3 py-2 whitespace-nowrap">{HEALTH_DIM_LABEL[d]}</th>
                ))}
                <th className="text-right font-medium px-4 py-2">綜合分</th>
                <th className="text-right font-medium px-4 py-2">達成率</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.length === 0 && (
                <tr>
                  <td colSpan={DIMS.length + 3} className="px-4 py-6 text-center text-[12px] text-[#9A9890]">尚無門店計分資料</td>
                </tr>
              )}
              {data.stores.map((s) => {
                const missingLabels = s.missingDims.map((d) => HEALTH_DIM_LABEL[d]);
                return (
                  <tr key={s.orgId} className="border-t border-[#EEECE6] text-[12.5px] text-[#2C2C2A]">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{s.name}</td>
                    {DIMS.map((d) => (
                      <td
                        key={d}
                        className="px-3 py-2 text-center"
                        title={s.dims[d] == null ? `${HEALTH_DIM_LABEL[d]}維度本期無資料` : undefined}
                      >
                        <span className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded-md text-[11px] ${scoreChip(s.dims[d])}`}>
                          {num(s.dims[d], 0)}
                        </span>
                      </td>
                    ))}
                    <td className={`px-4 py-2 text-right font-semibold ${scoreTone(s.total)}`}>
                      <span className="inline-flex items-center gap-1">
                        {num(s.total, 0)}
                        {missingLabels.length > 0 ? (
                          <span
                            className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#FDF3E3] text-[9.5px] font-semibold text-[#854F0B] cursor-help"
                            title={`此分數基於 ${s.validDims} 個維度計算（${missingLabels.join("、")} 資料不足）`}
                          >
                            ⓘ
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${rateChip(s.achievement)}`}>{pct(s.achievement)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-[#EEECE6] bg-[#F8F7F4] text-[11px] text-[#9A9890]">
          分數色票：≥80 綠（健康）· 60–79 橙（觀察）· &lt;60 紅（待強化）。綜合分永遠由六面向現算 —
          缺失面向不計入計算、其他面向等權重新平均（ⓘ 標示實際採計面向數）。六面向本身本期讀 KPI
          快照（demo seed，尚未串接即時彙總）。數據來源：kpi_snapshots｜更新頻率：demo seed（非即時）。
        </div>
      </section>
    </main>
  );
}
