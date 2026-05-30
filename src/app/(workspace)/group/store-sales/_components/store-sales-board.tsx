"use client";

/**
 * GRP09 門店銷售診斷 — client board
 *
 * 選一間門店 → 看該店新車銷售部門單月體檢：4 KPI 卡（達成率/成交率/GP3/衍生毛利）+
 * 集團均值對標 + 銷售漏斗（CSS，5 階段遞減）+ 月度銷量趨勢（<D3LineTrend> 本年 vs 去年同期）
 * + 衍生滲透率對比（橫 bar，本店 vs 集團均值）+ 自動診斷摘要 + 批售佔比過高告警。
 *
 * 門店切換是「會打 server 重撈」的互動（per-store 資料） → 走 URL ?store=<orgId> + router.push，
 * 用 useTransition 的 isPending 做 pending 視覺（切換中該區半透明 + 鎖 pointer-events），照
 * CLAUDE.md §UX 互動規範。資料全程 null/空安全（缺值顯示「—」、漏斗/趨勢空顯示提示）。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3LineTrend } from "@/components/charts/d3-line-trend";
import type {
  StoreLite,
  StoreSalesDiagnostics,
  DiagKpi,
  FunnelStage,
  TrendDir,
} from "@/domain/group-analytics";

const THEME = "#1A3A5C"; // 銷售藍
const WHOLESALE_ALERT = 0.3; // 批售佔比 > 30% 觸發告警橫幅

/* ── 格式化 helper（en-US locale 千分位跨環境固定，非時區依賴；沿用 round-16/17） ── */
const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const fmtCount = (v: number) => String(Math.round(v));

/* ── 趨勢箭頭（▲ 升 / ▼ 降 / － 平 / · 無資料） ── */
function TrendArrow({ trend }: { trend: TrendDir | null | undefined }) {
  if (trend === "up") return <span className="text-[#3B6D11]">▲</span>;
  if (trend === "down") return <span className="text-[#CC0000]">▼</span>;
  if (trend === "flat") return <span className="text-[#9A9890]">－</span>;
  return <span className="text-[#D5D3CB]">·</span>;
}

/**
 * KPI 卡。左色條：good=達標綠、alert=不足紅、預設中性。主數值大、副標小。
 * value 為 null → 顯示「—」。
 */
function KpiCard({
  label,
  value,
  fmt,
  sub,
  trend,
  tone,
}: {
  label: string;
  value: number | null;
  fmt: (v: number) => string;
  sub?: string;
  trend?: TrendDir | null;
  /** 'good' 綠左條 / 'alert' 紅左條 / undefined 中性灰 */
  tone?: "good" | "alert";
}) {
  const bar =
    tone === "good" ? "#0F6E56" : tone === "alert" ? "#CC0000" : "#D5D3CB";
  return (
    <div className="relative bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: bar }} />
      <div className="pl-4 pr-3 py-3">
        <div className="text-[11px] text-[#9A9890]">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[22px] font-semibold tabular-nums leading-none text-[#2C2C2A]">
            {value == null ? "—" : fmt(value)}
          </span>
          {trend !== undefined ? (
            <span className="text-[12px] leading-none">
              <TrendArrow trend={trend} />
            </span>
          ) : null}
        </div>
        {sub ? <div className="mt-1 text-[11px] text-[#9A9890]">{sub}</div> : null}
      </div>
    </div>
  );
}

/** 達成率 KPI 的色調：達標(>=1)綠、不足(<0.8)紅、其餘中性 */
function rateTone(rate: number | null | undefined): "good" | "alert" | undefined {
  if (rate == null) return undefined;
  if (rate >= 1) return "good";
  if (rate < 0.8) return "alert";
  return undefined;
}

/** section 卡 wrapper（灰底 header） */
function SectionCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        {caption ? <p className="text-[11px] text-[#9A9890] mt-0.5">{caption}</p> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * Benchmark 對比格：本店值 vs 集團均值。本店低於均值標紅、高於標綠。
 */
function BenchmarkCell({
  label,
  mine,
  national,
  fmt,
}: {
  label: string;
  mine: number | null;
  national: number | null;
  fmt: (v: number) => string;
}) {
  const known = mine != null && national != null;
  const behind = known && mine < national;
  const ahead = known && mine > national;
  const valueColor = behind ? "text-[#CC0000]" : ahead ? "text-[#0F6E56]" : "text-[#2C2C2A]";
  return (
    <div className="rounded-lg border border-[#EEECE6] bg-white px-3 py-2.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`mt-1 text-[18px] font-semibold tabular-nums leading-none ${valueColor}`}>
        {mine == null ? "—" : fmt(mine)}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-[#9A9890]">
        <span>集團均值 {national == null ? "—" : fmt(national)}</span>
        {behind ? (
          <span className="text-[#CC0000]">▼ 落後</span>
        ) : ahead ? (
          <span className="text-[#3B6D11]">▲ 領先</span>
        ) : null}
      </div>
    </div>
  );
}

/** 滲透率對比一列：本店 bar + 集團均值刻度線 */
function PenetrationRow({
  label,
  mine,
  national,
}: {
  label: string;
  mine: number | null;
  national: number | null;
}) {
  const behind = mine != null && national != null && mine < national;
  const barColor = behind ? "#CC0000" : "#1A3A5C";
  const minePct = mine == null ? 0 : Math.max(0, Math.min(1, mine));
  const natPct = national == null ? null : Math.max(0, Math.min(1, national));
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 text-[12px] text-[#5A5955]">{label}</span>
      <div className="relative h-3 flex-1 rounded-full bg-[#EEECE6] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${minePct * 100}%`, background: barColor }}
        />
        {natPct != null ? (
          // 集團均值刻度線（縱向）
          <div
            className="absolute inset-y-0 w-0.5 bg-[#854F0B]"
            style={{ left: `${natPct * 100}%` }}
            title={`集團均值 ${fmtPct(national as number)}`}
          />
        ) : null}
      </div>
      <span className="w-28 shrink-0 text-right text-[11.5px] tabular-nums text-[#5A5955]">
        {mine == null ? "—" : fmtPct(mine)}
        <span className="text-[#9A9890]">
          {" / "}
          {national == null ? "—" : fmtPct(national)}
        </span>
      </span>
    </div>
  );
}

/** 銷售漏斗一階段（CSS 長條，寬度依相對首階段比例遞減；rate=對前階轉化率） */
function FunnelRow({
  stage,
  maxCount,
}: {
  stage: FunnelStage;
  maxCount: number;
}) {
  const widthPct = maxCount > 0 ? Math.max(4, (stage.count / maxCount) * 100) : 4;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-20 shrink-0 text-[12px] text-[#5A5955]">{stage.stage}</span>
      <div className="relative flex-1">
        <div
          className="flex h-7 items-center rounded bg-[#1A3A5C] px-2 text-[12px] font-medium text-white tabular-nums"
          style={{ width: `${widthPct}%`, minWidth: 44 }}
        >
          {fmtCount(stage.count)}
        </div>
      </div>
      <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-[#5A5955]">
        {stage.rate == null ? (
          <span className="text-[#9A9890]">起始</span>
        ) : (
          <>
            <span className="text-[#9A9890]">轉化 </span>
            {fmtPct(stage.rate)}
          </>
        )}
      </span>
    </div>
  );
}

export function StoreSalesBoard({
  stores,
  selectedStore,
  data,
  trend,
}: {
  stores: StoreLite[];
  selectedStore: string | null;
  data: StoreSalesDiagnostics | null;
  trend: { months: string[]; current: number[]; prevYear: number[] };
}) {
  useSetPageHeader({
    title: "門店銷售診斷",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "門店銷售診斷" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** 切門店 → 推 URL ?store=，server 重撈、useTransition 提供 pending 視覺 */
  const selectStore = (id: string) => {
    if (id === selectedStore) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("store", id);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  };

  const kpis = data?.kpis;
  const bench = data?.benchmark;
  const deriv = data?.derivative;
  const wholesale = data?.wholesale_ratio ?? null;
  const wholesaleAlert = wholesale != null && wholesale > WHOLESALE_ALERT;

  // 漏斗首階段量（CSS 長條的 100% 基準）
  const funnelMax = data?.funnel.reduce((m, s) => Math.max(m, s.count), 0) ?? 0;

  // GP3 KPI 是否落後集團均值（不足紅左條）
  const gp3 = kpis?.gp3_per_vehicle ?? ({} as DiagKpi);
  const gp3Tone: "good" | "alert" | undefined =
    gp3.value != null && bench?.gp3_per_vehicle != null
      ? gp3.value >= bench.gp3_per_vehicle
        ? "good"
        : "alert"
      : undefined;
  // 成交率 KPI 是否落後集團均值
  const conv = kpis?.conversion_rate ?? ({} as DiagKpi);
  const convTone: "good" | "alert" | undefined =
    conv.value != null && bench?.conversion_rate != null
      ? conv.value >= bench.conversion_rate
        ? "good"
        : "alert"
      : undefined;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">門店銷售診斷</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP09
        </span>
        <span className="text-[12px] text-[#9A9890]">
          選一間門店看新車銷售部門單月體檢，對標集團均值
        </span>
      </header>

      {/* 門店切換器（tab pills；切換打 server 重撈，pending 鎖 UI） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[#9A9890] font-medium mr-1">門店</span>
          {stores.length === 0 ? (
            <span className="text-[12px] text-[#9A9890]">尚無門店資料</span>
          ) : (
            stores.map((s) => {
              const active = s.id === selectedStore;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectStore(s.id)}
                  disabled={isPending}
                  className={`h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-60 ${
                    active
                      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                  }`}
                >
                  {s.short_name ?? s.name}
                </button>
              );
            })
          )}
          {isPending ? (
            <span className="ml-1 text-[12px] text-[#9A9890]">切換中⋯</span>
          ) : null}
        </div>
      </section>

      {/* 內容區：pending 時整體半透明 + 鎖（切換中視覺回饋） */}
      <div className={isPending ? "pointer-events-none opacity-60 space-y-3" : "space-y-3"}>
        {data == null ? (
          <section className="bg-white border border-[#EEECE6] rounded-lg px-6 py-10 text-center">
            <p className="text-[13px] text-[#5A5955]">找不到門店資料</p>
            <p className="mt-1 text-[12px] text-[#9A9890]">
              {stores.length === 0
                ? "此品牌尚未建立門店；請先於組織架構新增 level=2 直營門店。"
                : "選定門店無對應診斷快照（待 demo seed），請改選其他門店。"}
            </p>
          </section>
        ) : (
          <>
            {/* 批售佔比過高告警橫幅 */}
            {wholesaleAlert ? (
              <div className="rounded-lg border border-[#F5D9A0] bg-[#FDF3E3] px-4 py-2.5 text-[12.5px] text-[#854F0B]">
                ⚠ 批售佔比 {fmtPct(wholesale as number)} 偏高（超過{" "}
                {Math.round(WHOLESALE_ALERT * 100)}% 警戒線），留意零售結構與門市自然客流是否萎縮。
              </div>
            ) : null}

            {/* 4 KPI 卡 */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="本月銷量"
                value={kpis?.sales_volume.value ?? null}
                fmt={(v) => `${fmtCount(v)} 台`}
                sub={
                  kpis?.sales_volume.target != null
                    ? `目標 ${fmtCount(kpis.sales_volume.target)} 台 · 達成率 ${
                        kpis.sales_volume.rate == null ? "—" : fmtPct(kpis.sales_volume.rate)
                      }`
                    : "尚無目標"
                }
                trend={kpis?.sales_volume.trend}
                tone={rateTone(kpis?.sales_volume.rate)}
              />
              <KpiCard
                label="成交率"
                value={conv.value ?? null}
                fmt={fmtPct}
                sub={
                  bench?.conversion_rate != null
                    ? `集團均值 ${fmtPct(bench.conversion_rate)}`
                    : "vs 集團均值"
                }
                tone={convTone}
              />
              <KpiCard
                label="單車 GP3"
                value={gp3.value ?? null}
                fmt={fmtMoney}
                sub={
                  bench?.gp3_per_vehicle != null
                    ? `集團均值 ${fmtMoney(bench.gp3_per_vehicle)}`
                    : "精算分層毛利"
                }
                trend={gp3.trend}
                tone={gp3Tone}
              />
              <KpiCard
                label="單車衍生毛利"
                value={kpis?.derivative_gp_per_vehicle.value ?? null}
                fmt={fmtMoney}
                sub="金融 / 保險 / 精品"
              />
            </section>

            {/* Benchmark 對比 */}
            <SectionCard title="集團均值對標" caption="本店低於均值標紅、高於標綠">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <BenchmarkCell
                  label="成交率"
                  mine={conv.value ?? null}
                  national={bench?.conversion_rate ?? null}
                  fmt={fmtPct}
                />
                <BenchmarkCell
                  label="單車 GP3"
                  mine={gp3.value ?? null}
                  national={bench?.gp3_per_vehicle ?? null}
                  fmt={fmtMoney}
                />
                <BenchmarkCell
                  label="本月達成率"
                  mine={kpis?.sales_volume.rate ?? null}
                  national={1}
                  fmt={fmtPct}
                />
                <BenchmarkCell
                  label="批售佔比"
                  mine={wholesale}
                  national={WHOLESALE_ALERT}
                  fmt={fmtPct}
                />
              </div>
            </SectionCard>

            {/* 銷售漏斗 + 月度趨勢（並排） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard
                title="銷售漏斗"
                caption="來店 → 試乘 → 報價 → 成交 → 交車（含對前階轉化率）"
              >
                {funnelMax > 0 ? (
                  <div className="space-y-0.5">
                    {data.funnel.map((stage) => (
                      <FunnelRow key={stage.stage} stage={stage} maxCount={funnelMax} />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-[12px] text-[#9A9890]">
                    尚無漏斗資料（待 demo seed）
                  </p>
                )}
              </SectionCard>

              <SectionCard
                title="月度銷量趨勢"
                caption="近 6 月本年 vs 去年同期"
              >
                <D3LineTrend
                  months={trend.months}
                  current={trend.current}
                  prevYear={trend.prevYear}
                  currentLabel="本年"
                  prevYearLabel="去年同期"
                  valueFormat={(v) => fmtCount(v)}
                  colorTheme={THEME}
                  height={220}
                  emptyMessage="尚無月趨勢資料（待 demo seed）"
                />
              </SectionCard>
            </div>

            {/* 衍生業務滲透率對比 */}
            <SectionCard
              title="衍生業務滲透率對比"
              caption="本店滲透率（藍 bar）vs 集團均值（黃刻度線）；落後均值標紅"
            >
              {deriv ? (
                <div className="space-y-1">
                  <PenetrationRow label="金融" mine={deriv.finance} national={deriv.national.finance} />
                  <PenetrationRow
                    label="保險"
                    mine={deriv.insurance}
                    national={deriv.national.insurance}
                  />
                  <PenetrationRow
                    label="延長保固"
                    mine={deriv.extwarranty}
                    national={deriv.national.extwarranty}
                  />
                  <PenetrationRow
                    label="精品"
                    mine={deriv.accessory}
                    national={deriv.national.accessory}
                  />
                </div>
              ) : (
                <p className="py-6 text-center text-[12px] text-[#9A9890]">
                  尚無滲透率資料（待 demo seed）
                </p>
              )}
            </SectionCard>

            {/* 部門診斷摘要 */}
            <SectionCard title="部門診斷摘要" caption="依門店指標 vs 集團均值 / 目標自動產生">
              {data.diagnostics.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.diagnostics.map((d, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-[#5A5955] leading-relaxed">
                      <span className="mt-0.5 shrink-0 text-[#185FA5]">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-[#3B6D11]">
                  ✓ 各項指標均在合理區間，無重大異常。
                </p>
              )}
            </SectionCard>
          </>
        )}
      </div>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料策略沿用 round-16：能即時算就算、算不出的細粒度門店指標（GP3／衍生毛利／滲透率／漏斗
        等）由 KPI 快照（demo seed）補上。門店切換會打 server 重撈該店單期診斷與月趨勢。
      </p>
    </main>
  );
}
