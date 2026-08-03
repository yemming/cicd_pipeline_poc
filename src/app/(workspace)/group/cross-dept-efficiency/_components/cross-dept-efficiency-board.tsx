"use client";

/**
 * GRP11 跨部門能效 — client board
 *
 * 命題（建議書）：「客戶流失不是部門問題，是個人問題」。銷售與售後攤在同一張
 * 散佈圖上，用系統 NPS 替代拿不到的原廠 CSI，讓「衝量犧牲客戶」的人現形。
 *
 * 兩張跨部門散佈圖（●=銷售 / ◆=售後，同圖混形狀）：
 *   X1 客戶流失歸因  x=名下客戶總數  y=本月流失數    右上=客戶多又流失多（危險）
 *   X2 個人 NPS 排名  x=量(台次)      y=個人 NPS      右下=高量低 NPS（危險）
 *
 * 兩張排名表（手刻 table，design token）：客戶流失歸因排名（可切排序鍵）+ 個人 NPS 排名。
 *
 * 門店切換 + 期間切換 chip 皆純前端（POC 資料同一份，期間只切視覺 label）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  D3ScatterChart,
  type ScatterTag,
  type ScatterMarkerShape,
} from "@/components/charts/d3-scatter";
import type { CrossDeptStaff, TrendDir } from "@/domain/group-analytics";

const ALL_STORES = "__all__";
const DANGER_CHURN = 0.15; // 流失率 > 15% 視為高風險（與 helper crossDeptRisk 一致）

/* ── 格式化 helper ──（en-US locale 千分位跨環境固定，非時區依賴；沿用 round-16） */
const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtScore = (v: number) => String(Math.round(v * 10) / 10);
const fmtCount = (v: number) => String(Math.round(v));

/** 逐點形狀：銷售=圓、售後=菱（同一張圖混形狀，靠本輪 markerShape function 增強） */
const shapeByDept = (d: CrossDeptStaff): ScatterMarkerShape =>
  d.dept === "sales" ? "circle" : "diamond";

/** tag → 中文標籤 / 色票（圖例 + 列風險標籤用） */
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
/** tag → 風險 chip 樣式（沿用 design token 色票表） */
const TAG_CHIP: Record<ScatterTag, string> = {
  star: "bg-[#EAF3DE] text-[#3B6D11]",
  watch: "bg-[#FDF3E3] text-[#854F0B]",
  danger: "bg-[#FDECEA] text-[#CC0000]",
  neutral: "bg-[#F2F2F2] text-[#6B6A68]",
};
/** 部門 chip */
const DEPT_LABEL: Record<CrossDeptStaff["dept"], string> = {
  sales: "銷售",
  service: "售後",
};

/** 期間切換選項（POC：純切視覺 label，資料同一份） */
const PERIODS = [
  { key: "rolling3", label: "近 3 月均值" },
  { key: "month", label: "本月" },
  { key: "quarter", label: "本季" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

/** 趨勢箭頭（▲ 升 / ▼ 降 / － 平 / 無資料空白） */
function TrendArrow({ trend }: { trend: TrendDir | null }) {
  if (trend === "up") return <span className="text-[#3B6D11]">▲</span>;
  if (trend === "down") return <span className="text-[#CC0000]">▼</span>;
  if (trend === "flat") return <span className="text-[#9A9890]">－</span>;
  return <span className="text-[#D5D3CB]">·</span>;
}

/** 進度條（0..1 → 寬度）；color 決定填色，超標可傳危險紅 */
function Bar({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <span className="text-[#9A9890]">—</span>;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 rounded-full bg-[#EEECE6] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <span className="tabular-nums text-[11.5px] text-[#5A5955]">{fmtPct(value)}</span>
    </div>
  );
}

/** NPS 進度條（NPS 可為 -100..100；正規化到 0..1 顯示，標籤顯示原值） */
function NpsBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[#9A9890]">—</span>;
  const norm = Math.max(0, Math.min(1, (value + 100) / 200));
  const color = value >= 70 ? "#0F6E56" : value < 40 ? "#CC0000" : "#F59E0B";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 rounded-full bg-[#EEECE6] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${norm * 100}%`, background: color }}
        />
      </div>
      <span className="tabular-nums text-[11.5px] text-[#5A5955]">{fmtScore(value)}</span>
    </div>
  );
}

/** 圖卡 wrapper（module-level，避免 render 內建元件 reset state） */
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

/** 表卡 wrapper */
function TableCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {right ? <div className="ml-auto">{right}</div> : null}
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

/** Hero 統計卡 */
function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        danger ? "border-[#F5AEAD] bg-[#FDECEA]" : "border-[#EEECE6] bg-white"
      }`}
    >
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`mt-1 text-[22px] font-semibold tabular-nums leading-none ${
          danger ? "text-[#CC0000]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-[#9A9890]">{sub}</div> : null}
    </div>
  );
}

type ChurnSortKey = "churn_count" | "churn_rate";

export function CrossDeptEfficiencyBoard({ staff }: { staff: CrossDeptStaff[] }) {
  useSetPageHeader({
    title: "跨部門能效",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "跨部門能效" },
    ],
    hideSearch: true,
  });

  // 門店下拉選項：依資料出現的 store 去重
  const stores = useMemo(() => {
    const set = new Set<string>();
    for (const s of staff) if (s.store) set.add(s.store);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [staff]);

  const [store, setStore] = useState<string>(ALL_STORES);
  const [period, setPeriod] = useState<PeriodKey>("rolling3");
  const [churnSort, setChurnSort] = useState<ChurnSortKey>("churn_count");

  const filtered = useMemo(
    () => (store === ALL_STORES ? staff : staff.filter((s) => s.store === store)),
    [staff, store],
  );

  /* ── Hero 統計 ── */
  const hero = useMemo(() => {
    const headcount = filtered.length;
    const highRisk = filtered.filter(
      (s) => s.risk === "danger" || (s.churn_rate != null && s.churn_rate > DANGER_CHURN),
    ).length;
    const npsVals = filtered.map((s) => s.nps).filter((v): v is number => v != null);
    const avgNps =
      npsVals.length > 0 ? npsVals.reduce((a, b) => a + b, 0) / npsVals.length : null;
    const totalChurn = filtered.reduce((sum, s) => sum + (s.churn_count ?? 0), 0);
    return { headcount, highRisk, avgNps, totalChurn };
  }, [filtered]);

  /* ── 排名表資料 ── */
  // 客戶流失歸因排名：依選定排序鍵 desc（null 排末尾）
  const churnRanked = useMemo(() => {
    const key = churnSort;
    return [...filtered].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  }, [filtered, churnSort]);

  // 個人 NPS 排名：依 NPS desc（null 末尾）
  const npsRanked = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.nps == null && b.nps == null) return 0;
        if (a.nps == null) return 1;
        if (b.nps == null) return -1;
        return b.nps - a.nps;
      }),
    [filtered],
  );

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">跨部門能效</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP11
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶流失不是部門問題，是個人問題 — 用系統 NPS 替代拿不到的原廠 CSI，把銷售與售後攤在同一張圖
        </span>
      </header>

      {/* Hero 統計列 */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="納入人員數" value={fmtCount(hero.headcount)} sub="銷售 + 售後" />
        <StatCard
          label="高風險人員數"
          value={fmtCount(hero.highRisk)}
          sub={`流失率 > ${Math.round(DANGER_CHURN * 100)}% 或風險「危險」`}
          danger={hero.highRisk > 0}
        />
        <StatCard
          label="全員均值 NPS"
          value={hero.avgNps == null ? "—" : fmtScore(hero.avgNps)}
          sub="系統 NPS（替代原廠 CSI）"
        />
        <StatCard
          label="本月總流失客戶數"
          value={fmtCount(hero.totalChurn)}
          sub="名下客戶流失合計"
          danger={hero.totalChurn > 0}
        />
      </section>

      {/* Filter Bar：門店 + 期間 chip + 圖例 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-3 items-end flex-wrap">
          {/* 門店切換 */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">門店</label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none bg-white min-w-[160px]"
            >
              <option value={ALL_STORES}>全集團</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 期間切換 chip */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">期間</label>
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`h-[30px] px-3 rounded-full text-[11.5px] font-medium border transition-colors ${
                    period === p.key
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <span className="text-[12px] text-[#9A9890] ml-1 mb-1.5">
            共 <b className="text-[#2C2C2A]">{filtered.length}</b> 位人員 · {periodLabel}
          </span>

          {/* 圖例：形狀（部門）+ tag 色 */}
          <div className="ml-auto mb-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#5A5955]" />銷售
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
              <span className="inline-block w-2.5 h-2.5 rotate-45 bg-[#5A5955]" />售後
            </span>
            <span className="text-[#D5D3CB]">|</span>
            {(["star", "watch", "danger", "neutral"] as ScatterTag[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: TAG_DOT[t] }}
                />
                {TAG_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 兩張散佈圖並排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* X1 客戶流失歸因：x=名下客戶總數、y=本月流失數 */}
        <ChartCard
          title="X1 · 客戶流失歸因"
          diagnosis="右上＝名下客戶多、流失也多（守不住客戶的高風險人物）"
        >
          <D3ScatterChart<CrossDeptStaff>
            data={filtered}
            x={(s) => s.cust_total}
            y={(s) => s.churn_count}
            xLabel="名下客戶總數"
            yLabel="本月流失數"
            xFormat={fmtCount}
            yFormat={fmtCount}
            colorTheme="#1A3A5C"
            markerShape={shapeByDept}
            showLabel={(s) => s.name}
            tagOf={(s) => s.risk}
            tooltip={(s) => (
              <div className="leading-tight">
                <div className="text-[12px] font-semibold text-[#2C2C2A]">{s.name}</div>
                <div className="text-[10px] text-[#9A9890]">
                  {(s.store ?? "未分配門店")} · {DEPT_LABEL[s.dept]}
                </div>
                <div className="mt-1 text-[11px] text-[#5A5955]">
                  <span className="text-[#9A9890]">名下客戶：</span>
                  {s.cust_total == null ? "—" : fmtCount(s.cust_total)}
                </div>
                <div className="text-[11px] text-[#5A5955]">
                  <span className="text-[#9A9890]">流失數：</span>
                  {s.churn_count == null ? "—" : fmtCount(s.churn_count)}
                </div>
                <div className="text-[11px] text-[#5A5955]">
                  <span className="text-[#9A9890]">流失率：</span>
                  {s.churn_rate == null ? "—" : fmtPct(s.churn_rate)}
                </div>
              </div>
            )}
            emptyMessage="客戶流失/名下客戶數現行系統尚未支援計算（無客戶生命週期歸屬），非資料不足"
          />
        </ChartCard>

        {/* X2 個人 NPS 排名：x=量(台次)、y=個人 NPS */}
        <ChartCard
          title="X2 · 個人 NPS 排名"
          diagnosis="右下＝高台次但 NPS 低（衝量犧牲客戶滿意度的危險型態）"
        >
          <D3ScatterChart<CrossDeptStaff>
            data={filtered}
            x={(s) => s.volume}
            y={(s) => s.nps}
            xLabel="量（台次）"
            yLabel="個人 NPS"
            xFormat={fmtCount}
            yFormat={fmtScore}
            colorTheme="#0F6E56"
            markerShape={shapeByDept}
            showLabel={(s) => s.name}
            tagOf={(s) => s.risk}
            tooltip={(s) => (
              <div className="leading-tight">
                <div className="text-[12px] font-semibold text-[#2C2C2A]">{s.name}</div>
                <div className="text-[10px] text-[#9A9890]">
                  {(s.store ?? "未分配門店")} · {DEPT_LABEL[s.dept]}
                </div>
                <div className="mt-1 text-[11px] text-[#5A5955]">
                  <span className="text-[#9A9890]">量（台次）：</span>
                  {fmtCount(s.volume)}
                </div>
                <div className="text-[11px] text-[#5A5955]">
                  <span className="text-[#9A9890]">NPS：</span>
                  {s.nps == null ? "—" : fmtScore(s.nps)}
                </div>
              </div>
            )}
            emptyMessage="個人 NPS 現行系統尚未串接問卷回填，非資料不足"
          />
        </ChartCard>
      </div>

      {/* 兩張排名表 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* 客戶流失歸因排名 */}
        <TableCard
          title="客戶流失歸因排名"
          right={
            <div className="flex gap-1">
              {(
                [
                  { key: "churn_count", label: "依流失數" },
                  { key: "churn_rate", label: "依流失率" },
                ] as Array<{ key: ChurnSortKey; label: string }>
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setChurnSort(o.key)}
                  className={`h-[26px] px-2.5 rounded text-[11.5px] border transition-colors ${
                    churnSort === o.key
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          }
        >
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white border-b border-[#EEECE6]">
                {["人員", "門店", "部門", "名下客戶", "流失數", "流失率", "NPS", "趨勢", "風險"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[11px] text-[#9A9890] font-medium whitespace-nowrap ${
                        i >= 3 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {churnRanked.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的資料
                  </td>
                </tr>
              ) : (
                churnRanked.map((s) => {
                  const hot = s.churn_rate != null && s.churn_rate > DANGER_CHURN;
                  return (
                    <tr
                      key={`churn-${s.staff_id}`}
                      className={`border-b border-[#F2F1ED] ${hot ? "bg-[#FDECEA]" : "hover:bg-[#F8F7F4]"}`}
                    >
                      <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A] whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[#5A5955] whitespace-nowrap">
                        {s.store ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                          {DEPT_LABEL[s.dept]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#5A5955]">
                        {s.cust_total == null ? "—" : fmtCount(s.cust_total)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right text-[12.5px] tabular-nums font-semibold ${
                          hot ? "text-[#CC0000]" : "text-[#2C2C2A]"
                        }`}
                      >
                        {s.churn_count == null ? "—" : fmtCount(s.churn_count)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <Bar value={s.churn_rate} color={hot ? "#CC0000" : "#F59E0B"} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#5A5955]">
                        {s.nps == null ? "—" : fmtScore(s.nps)}
                      </td>
                      <td className="px-3 py-2 text-right text-[12.5px]">
                        <TrendArrow trend={s.trend} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${TAG_CHIP[s.risk]}`}
                        >
                          {TAG_LABEL[s.risk]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableCard>

        {/* 個人 NPS 跨部門排名 */}
        <TableCard title="個人 NPS 跨部門排名">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white border-b border-[#EEECE6]">
                {["人員", "門店", "部門", "台次", "NPS", "趨勢", "評級"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-[11px] text-[#9A9890] font-medium whitespace-nowrap ${
                      i >= 3 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {npsRanked.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的資料
                  </td>
                </tr>
              ) : (
                npsRanked.map((s) => (
                  <tr
                    key={`nps-${s.staff_id}`}
                    className="border-b border-[#F2F1ED] hover:bg-[#F8F7F4]"
                  >
                    <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A] whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955] whitespace-nowrap">
                      {s.store ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {DEPT_LABEL[s.dept]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#5A5955]">
                      {fmtCount(s.volume)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end">
                        <NpsBar value={s.nps} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-[12.5px]">
                      <TrendArrow trend={s.trend} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${TAG_CHIP[s.risk]}`}
                      >
                        {TAG_LABEL[s.risk]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableCard>
      </div>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料窗：{periodLabel}（POC 期間切換僅切視覺標籤，資料同一份；正式版可改傳 period 給 server 重撈）。
        量／台次為即時計算（沿用 GRP07/GRP08 即時聚合）；個人 NPS／名下客戶／流失數等指標現行系統
        尚未支援計算，一律留空、不用假數字填充（缺值的點會略過不畫）。●＝銷售、◆＝售後。
        數據來源：sales_dormant_leads / sales_orders / repair_orders｜更新頻率：即時。
      </p>
    </main>
  );
}
