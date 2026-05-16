/**
 * Section — 集團看板 / 售後人效統計 (C13b)
 *
 * Spec：07_售後管理模組_v2.html → 今日人效統計（NADA 標準） + 人效公式說明
 * 入口：集團 dashboard /group/dashboard，只讀、不做 CRUD
 *
 * 三指標（NADA 業界標準）：
 *   - 效率 Efficiency   = sold ÷ actual × 100%   目標 ≥ 125%
 *   - 生產力 Productivity = sold ÷ available × 100%   目標 85-87.5%
 *   - 利用率 Utilization  = actual ÷ available × 100%  目標 ≥ 80%
 *
 * 不直連 supabase；資料由 server component 呼叫 getTechnicianEfficiencySummary()
 * 後 props in。
 */

import type {
  TechnicianEfficiencyKpis,
  TechnicianEfficiencyRankRow,
} from "@/domain/aftersales-technicians";
import {
  TECH_STATUS_LABEL,
  TECH_STATUS_CHIP,
  NADA_EFF_TARGET,
  NADA_PROD_TARGET,
  NADA_UTIL_TARGET,
  effColor,
  prodColor,
  utilColor,
} from "@/domain/aftersales-technicians.constants";

type Props = {
  kpis: TechnicianEfficiencyKpis;
  ranking: TechnicianEfficiencyRankRow[];
  dailyHours: number;
};

export function TechnicianEfficiencySection({ kpis, ranking, dailyHours }: Props) {
  return (
    <section className="px-6 py-5 space-y-3 bg-[#F8F7F4] border-t border-[#EEECE6]">
      {/* ── Section Header ────────────────────────── */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h2 className="text-[16px] font-semibold text-[#2C2C2A]">售後人效統計</h2>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後管理 · 13.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          今日 NADA 三指標 · 全店 {kpis.technician_count} 位技師（每日可用工時 {dailyHours} h）
        </span>
      </header>

      {/* ── KPI Cards：6 張（人 / 工單 / 三指標 / 達標數） ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard
          label="施工中"
          value={kpis.working}
          suffix={`/ ${kpis.technician_count} 人`}
          accent="#185FA5"
        />
        <KpiCard
          label="今日工單"
          value={kpis.jobs_total}
          suffix={`完成 ${kpis.jobs_done} · 進行 ${kpis.jobs_in_progress}`}
          accent="#0F6E56"
        />
        <KpiCard
          label="平均效率 Eff."
          value={`${kpis.avg_efficiency}%`}
          suffix={`目標 ≥ ${NADA_EFF_TARGET}%`}
          accent={effColor(kpis.avg_efficiency)}
        />
        <KpiCard
          label="平均生產力 Prod."
          value={`${kpis.avg_productivity}%`}
          suffix={`目標 ${NADA_PROD_TARGET}-87.5%`}
          accent={prodColor(kpis.avg_productivity)}
        />
        <KpiCard
          label="平均利用率 Util."
          value={`${kpis.avg_utilization}%`}
          suffix={`目標 ≥ ${NADA_UTIL_TARGET}%`}
          accent={utilColor(kpis.avg_utilization)}
        />
        <KpiCard
          label="達標技師"
          value={`${kpis.eff_on_target_count} / ${kpis.util_on_target_count}`}
          suffix={`Eff ≥ ${NADA_EFF_TARGET}% / Util ≥ ${NADA_UTIL_TARGET}%`}
          accent="#854F0B"
        />
      </div>

      {/* ── 排行表 ────────────────────────────────── */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#1A3A5C] text-white flex items-center gap-2">
          <span className="text-[13px] font-semibold">📊 今日人效排行（依效率 Eff. 排序）</span>
          <span className="ml-auto text-[11px] text-[#C8D7E6]">
            合計：銷售 {kpis.total_sold_hours.toFixed(1)} h ｜ 實際 {kpis.total_actual_hours.toFixed(1)} h ｜ 可用 {kpis.total_available_hours.toFixed(1)} h
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#1A1A1A] text-white">
              <tr>
                <Th>#</Th>
                <Th>技師</Th>
                <Th>職級</Th>
                <Th align="right">今日工單</Th>
                <Th align="right">可用工時</Th>
                <Th align="right">銷售工時</Th>
                <Th align="right">實際施工</Th>
                <Th align="right" title="銷售 ÷ 實際 × 100% 目標 ≥ 125%">效率 Eff.</Th>
                <Th align="right" title="銷售 ÷ 可用 × 100% 目標 85-87.5%">生產力 Prod.</Th>
                <Th align="right" title="實際 ÷ 可用 × 100% 目標 ≥ 80%">利用率 Util.</Th>
                <Th>狀態</Th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 ? (
                <tr>
                  <Td colSpan={11}>
                    <span className="text-[12px] text-[#9A9890]">
                      還沒有售後技師資料 — 至 /parts/aftersales/management/dispatch 建立。
                    </span>
                  </Td>
                </tr>
              ) : (
                ranking.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-b border-[#EEECE6] hover:bg-[#F8F7F4]"
                  >
                    <Td>
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                          i === 0
                            ? "bg-[#FAEEDA] text-[#854F0B]"
                            : i === 1
                              ? "bg-[#E8E7E4] text-[#5A5955]"
                              : i === 2
                                ? "bg-[#FCEBEB] text-[#CC0000]"
                                : "bg-[#F2F2F2] text-[#6B6A68]"
                        }`}
                      >
                        {i + 1}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                          style={{ background: t.avatar_color ?? "#185FA5" }}
                        >
                          {t.name.slice(0, 1)}
                        </span>
                        <div className="leading-tight">
                          <div className="font-semibold text-[#2C2C2A]">{t.name}</div>
                          <div className="text-[10px] text-[#9A9890] font-mono">
                            {t.code}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[11px] text-[#5A5955]">
                        {t.grade ?? "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="text-[12px] font-semibold text-[#2C2C2A]">
                        {t.jobs_total}
                      </div>
                      <div className="text-[10px] text-[#9A9890]">
                        完 {t.jobs_done} / 進 {Math.max(0, t.jobs_total - t.jobs_done)}
                      </div>
                    </Td>
                    <Td align="right">{t.available_hours.toFixed(1)} h</Td>
                    <Td align="right">{t.sold_hours.toFixed(1)} h</Td>
                    <Td align="right">{t.actual_hours.toFixed(1)} h</Td>
                    <Td align="right">
                      <strong style={{ color: effColor(t.efficiency) }}>
                        {t.efficiency}%
                      </strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: prodColor(t.productivity) }}>
                        {t.productivity}%
                      </strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: utilColor(t.utilization) }}>
                        {t.utilization}%
                      </strong>
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${TECH_STATUS_CHIP[t.status]}`}
                      >
                        {TECH_STATUS_LABEL[t.status]}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 公式說明 ──────────────────────────────── */}
      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        <strong>NADA 標準</strong>
        <strong>效率 Eff.</strong> = 銷售 ÷ 實際 × 100%　目標 ≥ {NADA_EFF_TARGET}% ｜
        <strong> 生產力 Prod.</strong> = 銷售 ÷ 可用 × 100%　目標 {NADA_PROD_TARGET}-87.5% ｜
        <strong> 利用率 Util.</strong> = 實際 ÷ 可用 × 100%　目標 ≥ {NADA_UTIL_TARGET}%
        　|　1 LU = 6 分鐘 → 銷售工時 = Σ LU ÷ 10
      </p>
    </section>
  );
}

/* ──────────────── Sub-components ──────────────── */

function KpiCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent: string;
}) {
  return (
    <div
      className="bg-white border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-0.5"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <span className="text-[11px] text-[#9A9890] font-medium">{label}</span>
      <span
        className="text-[20px] font-extrabold tabular-nums leading-tight"
        style={{ color: accent }}
      >
        {value}
      </span>
      {suffix ? (
        <span className="text-[10px] text-[#6B6A68]">{suffix}</span>
      ) : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      className="px-2.5 py-2 text-[11px] font-semibold whitespace-nowrap"
      style={{ textAlign: align }}
      title={title}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      className="px-2.5 py-2 text-[12px] text-[#2C2C2A] align-middle"
      style={{ textAlign: align }}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
