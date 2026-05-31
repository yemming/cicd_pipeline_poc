"use client";

/**
 * GRP15 技師效率診斷 — client board（4 張 D3 散佈圖 + 門店切換 + 返修率告警 + 排名表）
 *
 * 診斷理念（同 GRP08）：平均值說謊、散佈圖才說真話。技師從工時效率、完工品質、
 * 返修風險、資歷成長四個維度看，「高台次高返修」是最危險型態（品質換速度）。
 *
 * 四張散佈圖（每點＝一位技師，售後綠主題、菱形）：
 *   T1 工時效率  x=月接單台數  y=工時效率
 *   T2 品質風險  x=月接單台數  y=返修率      （右下＝高台次高返修，危險）
 *   T3 完工準時  x=工時效率    y=完工準時率
 *   T4 資歷成長  x=技師年資    y=工時效率
 *
 * 返修率告警：任一技師 rework_rate > 8% → 頂端紅色告警橫幅。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3ScatterChart, type ScatterTag } from "@/components/charts/d3-scatter";
import type { TechEffStaff } from "@/domain/group-analytics";

const THEME = "#0F6E56"; // 售後綠
const ALL_STORES = "__all__";
const REWORK_THRESHOLD = 0.08; // 返修率 > 8% 觸發告警（技師標準較 SA 嚴）
const EFF_TARGET = 0.85; // 工時效率達標線

const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtCount = (v: number) => String(Math.round(v));
const fmtYear = (v: number) => `${Math.round(v * 10) / 10} 年`;

const TAG_LABEL: Record<ScatterTag, string> = {
  star: "明星",
  watch: "待輔導",
  danger: "危險",
  neutral: "資料不足",
};
const TAG_DOT: Record<ScatterTag, string> = {
  star: "#0F6E56",
  watch: "#F59E0B",
  danger: "#CC0000",
  neutral: "#9A9890",
};

function ChartCard({
  title,
  diagnosis,
  children,
}: {
  title: string;
  diagnosis: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        <p className="text-[11px] text-[#9A9890] mt-0.5">{diagnosis}</p>
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function makeTooltip(
  xLabel: string,
  yLabel: string,
  xv: (s: TechEffStaff) => number | null,
  yv: (s: TechEffStaff) => number | null,
  xf: (v: number) => string,
  yf: (v: number) => string,
) {
  return function Tooltip(s: TechEffStaff) {
    const x = xv(s);
    const y = yv(s);
    return (
      <div className="leading-tight">
        <div className="text-[12px] font-semibold text-[#2C2C2A]">{s.name}</div>
        <div className="text-[10px] text-[#9A9890]">{s.store ?? "未分配門店"}</div>
        <div className="mt-1 text-[11px] text-[#5A5955]">
          <span className="text-[#9A9890]">{xLabel}：</span>
          {x == null ? "—" : xf(x)}
        </div>
        <div className="text-[11px] text-[#5A5955]">
          <span className="text-[#9A9890]">{yLabel}：</span>
          {y == null ? "—" : yf(y)}
        </div>
      </div>
    );
  };
}

/** 一張 KPI 卡。 */
function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-semibold text-[#2C2C2A] leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-[#9A9890] mt-0.5">{hint}</div>}
    </div>
  );
}

export function TechEfficiencyBoard({ staff }: { staff: TechEffStaff[] }) {
  useSetPageHeader({
    title: "技師效率診斷",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "技師效率診斷" },
    ],
    hideSearch: true,
  });

  const stores = useMemo(() => {
    const set = new Set<string>();
    for (const s of staff) if (s.store) set.add(s.store);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [staff]);

  const [store, setStore] = useState<string>(ALL_STORES);

  const filtered = useMemo(
    () => (store === ALL_STORES ? staff : staff.filter((s) => s.store === store)),
    [staff, store],
  );

  const reworkAlerts = useMemo(
    () =>
      filtered
        .filter((s) => s.rework_rate != null && s.rework_rate > REWORK_THRESHOLD)
        .sort((a, b) => (b.rework_rate ?? 0) - (a.rework_rate ?? 0)),
    [filtered],
  );

  // KPI：技師人數 / 效率達標 / 需關注 / 均值工時效率
  const kpis = useMemo(() => {
    const withEff = filtered.filter((s) => s.labor_efficiency != null);
    const onTarget = withEff.filter((s) => (s.labor_efficiency as number) >= EFF_TARGET).length;
    const watch = filtered.filter(
      (s) =>
        (s.rework_rate != null && s.rework_rate > REWORK_THRESHOLD) ||
        (s.labor_efficiency != null && s.labor_efficiency < 0.7),
    ).length;
    const avgEff = withEff.length
      ? withEff.reduce((a, s) => a + (s.labor_efficiency as number), 0) / withEff.length
      : null;
    return { count: filtered.length, onTarget, watch, avgEff };
  }, [filtered]);

  // 排名表：依工時效率 desc
  const ranked = useMemo(
    () =>
      [...filtered].sort((a, b) => (b.labor_efficiency ?? -1) - (a.labor_efficiency ?? -1)),
    [filtered],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">技師效率診斷</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP15
        </span>
        <span className="text-[12px] text-[#9A9890]">
          工時效率／完工品質／返修風險／資歷成長四象限 — 高台次高返修是技師層最危險型態
        </span>
      </header>

      {/* KPI 卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="技師人數" value={fmtCount(kpis.count)} hint="當前門店在職技師" />
        <KpiCard
          label="效率達標"
          value={fmtCount(kpis.onTarget)}
          hint={`工時效率 ≥ ${Math.round(EFF_TARGET * 100)}%`}
        />
        <KpiCard label="需關注" value={fmtCount(kpis.watch)} hint="高返修或低效率" />
        <KpiCard
          label="均值工時效率"
          value={kpis.avgEff == null ? "—" : fmtPct(kpis.avgEff)}
          hint="全體技師平均"
        />
      </div>

      {/* 返修率告警橫幅 */}
      {reworkAlerts.length > 0 && (
        <section className="rounded-lg border border-[#F5AEAD] bg-[#FDECEA] px-4 py-3 text-[#CC0000]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <span className="text-[13px] font-semibold">
              技師返修率告警 — {reworkAlerts.length} 位技師返修率超過 {Math.round(REWORK_THRESHOLD * 100)}%，需即刻安排技術訓練或師徒輔導
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            {reworkAlerts.map((s) => (
              <li key={s.staff_id} className="inline-flex items-center gap-1.5">
                <b>{s.name}</b>
                <span className="text-[#9A4040]">{s.store ?? "未分配門店"}</span>
                <span className="font-semibold">返修率 {fmtPct(s.rework_rate as number)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filter Bar：門店切換 + 圖例 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">門店</label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none bg-white min-w-[160px]"
            >
              <option value={ALL_STORES}>全部門店</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[12px] text-[#9A9890] ml-1 mb-1.5">
            共 <b className="text-[#2C2C2A]">{filtered.length}</b> 位技師
          </span>

          <div className="ml-auto mb-1 flex items-center gap-3 flex-wrap">
            {(["star", "watch", "danger", "neutral"] as ScatterTag[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
                <span
                  className="inline-block w-2.5 h-2.5 rotate-45"
                  style={{ background: TAG_DOT[t] }}
                />
                {TAG_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 4 張散佈圖 2×2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="T1 · 工時效率" diagnosis="右下＝接很多但工時超標（量大品質風險高）">
          <D3ScatterChart<TechEffStaff>
            data={filtered}
            x={(s) => s.intake_count}
            y={(s) => s.labor_efficiency}
            xLabel="月接單台數"
            yLabel="工時效率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip("月接單台數", "工時效率", (s) => s.intake_count, (s) => s.labor_efficiency, fmtCount, fmtPct)}
            emptyMessage="尚無工時效率資料（待 demo seed）"
          />
        </ChartCard>

        <ChartCard title="T2 · 品質風險" diagnosis="右上＝高台次高返修（以速度換品質，最高風險）">
          <D3ScatterChart<TechEffStaff>
            data={filtered}
            x={(s) => s.intake_count}
            y={(s) => s.rework_rate}
            xLabel="月接單台數"
            yLabel="返修率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip("月接單台數", "返修率", (s) => s.intake_count, (s) => s.rework_rate, fmtCount, fmtPct)}
            emptyMessage="尚無返修率資料（待 demo seed）"
          />
        </ChartCard>

        <ChartCard title="T3 · 完工準時" diagnosis="右下＝高效率低準時（排程管理問題）">
          <D3ScatterChart<TechEffStaff>
            data={filtered}
            x={(s) => s.labor_efficiency}
            y={(s) => s.on_time_rate}
            xLabel="工時效率"
            yLabel="完工準時率"
            xFormat={fmtPct}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip("工時效率", "完工準時率", (s) => s.labor_efficiency, (s) => s.on_time_rate, fmtPct, fmtPct)}
            emptyMessage="尚無準時率資料（待 demo seed）"
          />
        </ChartCard>

        <ChartCard title="T4 · 資歷成長" diagnosis="右下＝深資歷低效率（老技師懈怠或技能退步，需輔導）">
          <D3ScatterChart<TechEffStaff>
            data={filtered}
            x={(s) => s.tenure_years}
            y={(s) => s.labor_efficiency}
            xLabel="技師年資"
            yLabel="工時效率"
            xFormat={fmtYear}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip("技師年資", "工時效率", (s) => s.tenure_years, (s) => s.labor_efficiency, fmtYear, fmtPct)}
            emptyMessage="尚無年資資料（待 demo seed）"
          />
        </ChartCard>
      </div>

      {/* 綜合排名表 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            🔩 全體技師效率綜合排名
          </h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">
            依工時效率排序 ｜ 返修率超過 {Math.round(REWORK_THRESHOLD * 100)}% 標紅警示
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6] bg-[#FBFAF8]">
                <th className="text-left font-medium px-3 py-2 w-10">#</th>
                <th className="text-left font-medium px-3 py-2">技師</th>
                <th className="text-left font-medium px-3 py-2">門店</th>
                <th className="text-right font-medium px-3 py-2">月接單</th>
                <th className="text-right font-medium px-3 py-2">工時效率</th>
                <th className="text-right font-medium px-3 py-2">完工準時</th>
                <th className="text-right font-medium px-3 py-2">返修率</th>
                <th className="text-right font-medium px-3 py-2">年資</th>
                <th className="text-center font-medium px-3 py-2">評級</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const flagged = s.rework_rate != null && s.rework_rate > REWORK_THRESHOLD;
                return (
                  <tr
                    key={s.staff_id}
                    className={`border-b border-[#F2F1ED] ${flagged ? "bg-[#FDECEA]" : ""}`}
                  >
                    <td className="px-3 py-2 text-[#9A9890]">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-[#2C2C2A]">{s.name}</td>
                    <td className="px-3 py-2 text-[#5A5955]">{s.store ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtCount(s.intake_count)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.labor_efficiency == null ? "—" : fmtPct(s.labor_efficiency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.on_time_rate == null ? "—" : fmtPct(s.on_time_rate)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${flagged ? "text-[#CC0000] font-semibold" : ""}`}
                    >
                      {s.rework_rate == null ? "—" : fmtPct(s.rework_rate)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.tenure_years == null ? "—" : fmtYear(s.tenure_years)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                        style={{
                          background: `${TAG_DOT[s.tag]}1A`,
                          color: TAG_DOT[s.tag],
                        }}
                      >
                        {s.grade}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#9A9890]">
                    尚無技師資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料窗：近 3 個月滾動。即時計算（月接單台數，repair_orders 依 lead_technician_id 聚合）；
        工時效率／返修率／完工準時率／年資等指標現行交易表尚無，由 KPI 快照（demo seed）補上 —
        缺值的點會略過不畫。
      </p>
    </main>
  );
}
