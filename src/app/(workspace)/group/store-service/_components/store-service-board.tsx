"use client";

/**
 * GRP10 門店售後診斷 — client board（本輪最重、metric 最雜）
 *
 * 選一間門店 → 看該店售後（維修廠）部門單月體檢。診斷主軸有二，都用顏色把異常「逼出來」：
 *   (1) 返修率異常 → 置頂三色告警橫幅（>5% 紅 / 3~5% amber / <3% 不顯示）
 *   (2) 客戶淨流失 → 近 5 月客戶流動表，淨流失（net<0）月份紅底
 *
 * 內容區塊（區塊多，用 2 欄 grid 排子卡避免單欄過長）：
 *   返修率告警橫幅 · 5 KPI 卡（台次達成率/單車產值/主營毛利率/售後吸收率/返修率）·
 *   集團均值對標 3 欄 · 車間三率（橫 bar + 目標線）· 台次月趨勢（<D3LineTrend> 本年 vs 去年同期）·
 *   業務結構（CSS 圓環 donut + legend）· 零件庫存健康（3 小 KPI + bar）· 精品加裝 ·
 *   客戶流動表（近 5 月）· 部門診斷摘要。
 *
 * 門店切換是「會打 server 重撈」的互動（per-store 資料） → 走 URL ?store=<orgId> + router.push，
 * 用 useTransition 的 isPending 做 pending 視覺（切換中該區半透明 + 鎖 pointer-events），照
 * CLAUDE.md §UX 互動規範。資料全程 null/空安全（缺值顯示「—」、空區塊顯示提示）。
 *
 * 設計沿用剛建好的 GRP09 門店銷售診斷（KpiCard / SectionCard / BenchmarkCell / 門店切換器
 * 同款 design token），告警橫幅照 round-16 GRP08 的危險紅 token。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3LineTrend } from "@/components/charts/d3-line-trend";
import type {
  StoreLite,
  StoreServiceDiagnostics,
  TrendDir,
  ServiceTypeBucket,
  CustomerFlowPoint,
} from "@/domain/group-analytics";

const THEME = "#0F6E56"; // 售後綠（GRP09 是銷售藍 #1A3A5C）

// 返修率三色門檻
const REWORK_DANGER = 0.05; // > 5% → 紅色告警
const REWORK_WARN = 0.03; // 3% ~ 5% → amber 提醒

// 業務結構圓環配色（保養/維修/鈑噴/其他）
const MIX_COLORS = ["#0F6E56", "#185FA5", "#854F0B", "#9A9890"];

/* ── 格式化 helper（en-US locale 千分位跨環境固定，非時區依賴；沿用 GRP09） ── */
const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const fmtCount = (v: number) => String(Math.round(v));
const fmtNum1 = (v: number) => String(Math.round(v * 10) / 10); // 週轉率等小數

/** 月份標籤 YYYY-MM-01 → MM 月（客戶流動表簡潔顯示） */
function monthLabel(ym: string): string {
  const parts = ym.split("-");
  if (parts.length >= 2) return `${parseInt(parts[1], 10)} 月`;
  return ym;
}

/* ── 趨勢箭頭（▲ 升 / ▼ 降 / － 平 / · 無資料） ── */
function TrendArrow({ trend }: { trend: TrendDir | null | undefined }) {
  if (trend === "up") return <span className="text-[#3B6D11]">▲</span>;
  if (trend === "down") return <span className="text-[#CC0000]">▼</span>;
  if (trend === "flat") return <span className="text-[#9A9890]">－</span>;
  return <span className="text-[#D5D3CB]">·</span>;
}

/**
 * KPI 卡。左色條：good=達標綠、alert=不足紅、預設中性。value 為 null → 顯示「—」。
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
  tone?: "good" | "alert";
}) {
  const bar = tone === "good" ? "#0F6E56" : tone === "alert" ? "#CC0000" : "#D5D3CB";
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

/** 本店值 vs 集團均值 → KPI 色調（>= 均值綠、否則紅；缺值中性） */
function vsBenchTone(
  mine: number | null | undefined,
  national: number | null | undefined,
): "good" | "alert" | undefined {
  if (mine == null || national == null) return undefined;
  return mine >= national ? "good" : "alert";
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

/**
 * 車間三率一列：本店 bar + 目標線（橫向）。低於目標標紅，否則售後綠。
 * 三率都是 0..1。target 預設 0.85（產業常見達標線；POC 固定值）。
 */
function WorkshopRateRow({
  label,
  value,
  target,
}: {
  label: string;
  value: number | null;
  target: number;
}) {
  const below = value != null && value < target;
  const barColor = below ? "#CC0000" : THEME;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 text-[12px] text-[#5A5955]">{label}</span>
      <div className="relative h-3 flex-1 rounded-full bg-[#EEECE6] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct * 100}%`, background: barColor }}
        />
        {/* 目標刻度線（縱向 amber） */}
        <div
          className="absolute inset-y-0 w-0.5 bg-[#854F0B]"
          style={{ left: `${target * 100}%` }}
          title={`目標 ${fmtPct(target)}`}
        />
      </div>
      <span className="w-24 shrink-0 text-right text-[11.5px] tabular-nums text-[#5A5955]">
        {value == null ? "—" : fmtPct(value)}
        <span className="text-[#9A9890]">
          {" / "}
          {fmtPct(target)}
        </span>
      </span>
    </div>
  );
}

/**
 * 業務結構圓環（CSS conic-gradient donut + legend）。各類佔比由 count 算。
 * 全空（總和 0）→ 顯示提示。
 */
function ServiceMixDonut({ mix }: { mix: ServiceTypeBucket[] }) {
  const total = mix.reduce((s, b) => s + b.count, 0);
  if (total <= 0) {
    return (
      <p className="py-6 text-center text-[12px] text-[#9A9890]">尚無業務結構資料（待 demo seed）</p>
    );
  }
  // 累積角度切 conic-gradient stop
  const stops: string[] = [];
  let acc = 0;
  mix.forEach((b, i) => {
    const start = (acc / total) * 360;
    acc += b.count;
    const end = (acc / total) * 360;
    stops.push(`${MIX_COLORS[i % MIX_COLORS.length]} ${start}deg ${end}deg`);
  });
  const gradient = `conic-gradient(${stops.join(", ")})`;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <div className="h-full w-full rounded-full" style={{ background: gradient }} />
        {/* 中心挖空成 donut */}
        <div className="absolute inset-0 m-auto flex flex-col items-center justify-center rounded-full bg-white" style={{ width: 70, height: 70 }}>
          <span className="text-[16px] font-semibold tabular-nums text-[#2C2C2A]">{fmtCount(total)}</span>
          <span className="text-[10px] text-[#9A9890]">總台次</span>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5">
        {mix.map((b, i) => {
          const share = total > 0 ? b.count / total : 0;
          return (
            <li key={b.type} className="flex items-center gap-2 text-[12px]">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: MIX_COLORS[i % MIX_COLORS.length] }}
              />
              <span className="w-20 shrink-0 text-[#5A5955]">{b.type}</span>
              <span className="tabular-nums text-[#2C2C2A]">{fmtCount(b.count)} 台</span>
              <span className="ml-auto tabular-nums text-[#9A9890]">{fmtPct(share)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 小 KPI（零件庫存健康用）：label + 數值 + 可選色調 */
function MiniStat({
  label,
  value,
  fmt,
  tone,
}: {
  label: string;
  value: number | null;
  fmt: (v: number) => string;
  tone?: "good" | "alert";
}) {
  const color = tone === "good" ? "text-[#0F6E56]" : tone === "alert" ? "text-[#CC0000]" : "text-[#2C2C2A]";
  return (
    <div className="rounded-lg border border-[#EEECE6] bg-white px-3 py-2.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`mt-1 text-[16px] font-semibold tabular-nums leading-none ${color}`}>
        {value == null ? "—" : fmt(value)}
      </div>
    </div>
  );
}

/** 客戶流動表一列。淨流失（net<0）整列紅底。 */
function CustomerFlowRow({ point }: { point: CustomerFlowPoint }) {
  const netLoss = point.net < 0;
  return (
    <tr className={netLoss ? "bg-[#FDECEA]" : ""}>
      <td className="px-3 py-2 text-[12px] text-[#2C2C2A]">{monthLabel(point.month)}</td>
      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#3B6D11]">+{fmtCount(point.new)}</td>
      <td className="px-3 py-2 text-right text-[12px] tabular-nums text-[#CC0000]">-{fmtCount(point.lost)}</td>
      <td
        className={`px-3 py-2 text-right text-[12px] font-semibold tabular-nums ${
          netLoss ? "text-[#CC0000]" : point.net > 0 ? "text-[#3B6D11]" : "text-[#5A5955]"
        }`}
      >
        {point.net > 0 ? "+" : ""}
        {fmtCount(point.net)}
      </td>
    </tr>
  );
}

export function StoreServiceBoard({
  stores,
  selectedStore,
  data,
  trend,
}: {
  stores: StoreLite[];
  selectedStore: string | null;
  data: StoreServiceDiagnostics | null;
  trend: { months: string[]; current: number[]; prevYear: number[] };
}) {
  useSetPageHeader({
    title: "門店售後診斷",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "門店售後診斷" },
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
  const workshop = data?.workshop;
  const parts = data?.parts;
  const accessory = data?.accessory;
  const customerFlow = data?.customerFlow ?? [];
  const storeName = data?.store.short_name ?? data?.store.name ?? "";

  // 返修率三色告警判定（視覺主角）
  const rework = kpis?.rework_rate.value ?? null;
  const reworkDanger = rework != null && rework > REWORK_DANGER;
  const reworkWarn = rework != null && rework > REWORK_WARN && rework <= REWORK_DANGER;

  // 各 KPI 對標色調
  const revVsBench = vsBenchTone(kpis?.revenue_per_vehicle.value, bench?.revenue_per_vehicle);
  const marginVsBench = vsBenchTone(kpis?.gross_margin_rate.value, bench?.gross_margin_rate);
  const absorpVsBench = vsBenchTone(kpis?.absorption_rate.value, bench?.absorption_rate);
  // 返修率 KPI 色調：低於警戒線=綠、超標=紅
  const reworkTone: "good" | "alert" | undefined =
    rework == null ? undefined : rework > REWORK_DANGER ? "alert" : "good";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">門店售後診斷</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP10
        </span>
        <span className="text-[12px] text-[#9A9890]">
          選一間門店看售後部門體檢，診斷主軸：返修率異常 + 客戶淨流失
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
                      ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                  }`}
                >
                  {s.short_name ?? s.name}
                </button>
              );
            })
          )}
          {isPending ? <span className="ml-1 text-[12px] text-[#9A9890]">切換中⋯</span> : null}
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
            {/* 返修率告警橫幅（視覺主角，置頂、條件式三色） */}
            {reworkDanger ? (
              <section className="rounded-lg border border-[#F5AEAD] bg-[#FDECEA] px-4 py-3 text-[#CC0000]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  <span className="text-[13px] font-semibold">
                    返修率異常 {fmtPct(rework as number)}，已超過 5% 警戒線 — {storeName}店需立即介入售後品質稽核
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-[#9A4040]">
                  返修代表「修了沒修好、客戶再回廠」，直接侵蝕客戶信任與工時產能；建議稽核維修流程、技師訓練與品檢環節。
                </p>
              </section>
            ) : reworkWarn ? (
              <section className="rounded-lg border border-[#F5D9A0] bg-[#FDF3E3] px-4 py-2.5 text-[#854F0B]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">info</span>
                  <span className="text-[12.5px] font-medium">
                    返修率 {fmtPct(rework as number)} 偏高（介於 3%~5%），建議留意維修品質，避免惡化至警戒線。
                  </span>
                </div>
              </section>
            ) : null}

            {/* 5 KPI 卡 */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="維修台次"
                value={kpis?.service_count.value ?? null}
                fmt={(v) => `${fmtCount(v)} 台`}
                sub={
                  kpis?.service_count.target != null
                    ? `目標 ${fmtCount(kpis.service_count.target)} 台 · 達成率 ${
                        kpis.service_count.rate == null ? "—" : fmtPct(kpis.service_count.rate)
                      }`
                    : "尚無目標"
                }
                trend={kpis?.service_count.trend}
                tone={rateTone(kpis?.service_count.rate)}
              />
              <KpiCard
                label="單車平均產值"
                value={kpis?.revenue_per_vehicle.value ?? null}
                fmt={fmtMoney}
                sub={
                  bench?.revenue_per_vehicle != null
                    ? `集團均值 ${fmtMoney(bench.revenue_per_vehicle)}`
                    : "每進廠車產值"
                }
                trend={kpis?.revenue_per_vehicle.trend}
                tone={revVsBench}
              />
              <KpiCard
                label="主營毛利率"
                value={kpis?.gross_margin_rate.value ?? null}
                fmt={fmtPct}
                sub={
                  bench?.gross_margin_rate != null
                    ? `集團均值 ${fmtPct(bench.gross_margin_rate)}`
                    : "工料合計毛利率"
                }
                tone={marginVsBench}
              />
              <KpiCard
                label="售後吸收率"
                value={kpis?.absorption_rate.value ?? null}
                fmt={fmtPct}
                sub={
                  bench?.absorption_rate != null
                    ? `集團均值 ${fmtPct(bench.absorption_rate)}`
                    : "後勤獲利覆蓋固定成本"
                }
                tone={absorpVsBench}
              />
              <KpiCard
                label="返修率"
                value={rework}
                fmt={fmtPct}
                sub={`警戒線 ${fmtPct(REWORK_DANGER)}`}
                tone={reworkTone}
              />
            </section>

            {/* Benchmark 對標（3 欄） */}
            <SectionCard title="集團均值對標" caption="本店低於均值標紅、高於標綠">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <BenchmarkCell
                  label="單車平均產值"
                  mine={kpis?.revenue_per_vehicle.value ?? null}
                  national={bench?.revenue_per_vehicle ?? null}
                  fmt={fmtMoney}
                />
                <BenchmarkCell
                  label="主營毛利率"
                  mine={kpis?.gross_margin_rate.value ?? null}
                  national={bench?.gross_margin_rate ?? null}
                  fmt={fmtPct}
                />
                <BenchmarkCell
                  label="售後吸收率"
                  mine={kpis?.absorption_rate.value ?? null}
                  national={bench?.absorption_rate ?? null}
                  fmt={fmtPct}
                />
              </div>
            </SectionCard>

            {/* 車間三率 + 台次月趨勢（並排 2 欄） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard
                title="車間三率"
                caption="效率 / 稼動 / 生產力（橫 bar；黃線=目標 85%，低於目標標紅）"
              >
                {workshop ? (
                  <div className="space-y-0.5">
                    <WorkshopRateRow label="工時效率" value={workshop.efficiency} target={0.85} />
                    <WorkshopRateRow label="工位稼動" value={workshop.utilization} target={0.85} />
                    <WorkshopRateRow label="技師生產力" value={workshop.productivity} target={0.85} />
                  </div>
                ) : (
                  <p className="py-6 text-center text-[12px] text-[#9A9890]">
                    尚無車間三率資料（待 demo seed）
                  </p>
                )}
              </SectionCard>

              <SectionCard title="維修台次月趨勢" caption="近 6 月本年 vs 去年同期">
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

            {/* 業務結構 + 客戶流動（並排 2 欄） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard
                title="業務結構"
                caption="保養 / 維修 / 鈑噴 / 其他 台次組成佔比"
              >
                <ServiceMixDonut mix={data.serviceMix} />
              </SectionCard>

              <SectionCard
                title="客戶流動（近 5 月）"
                caption="每月新增 / 流失 / 淨值；淨流失（負值）月份紅底告警"
              >
                {customerFlow.length > 0 ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#EEECE6]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-medium text-[#9A9890]">月份</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-medium text-[#9A9890]">新增客戶</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-medium text-[#9A9890]">流失客戶</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-medium text-[#9A9890]">淨值</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F0EB]">
                      {customerFlow.map((p) => (
                        <CustomerFlowRow key={p.month} point={p} />
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-6 text-center text-[12px] text-[#9A9890]">
                    尚無客戶流動資料（待 demo seed）
                  </p>
                )}
              </SectionCard>
            </div>

            {/* 零件庫存健康 + 精品加裝（並排 2 欄） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <SectionCard
                title="零件庫存健康"
                caption="供料滿足率 / 週轉率 / 呆滯料佔比 + 直銷業績"
              >
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat
                    label="供料滿足率"
                    value={parts?.fulfill_rate ?? null}
                    fmt={fmtPct}
                    tone={
                      parts?.fulfill_rate == null
                        ? undefined
                        : parts.fulfill_rate >= 0.9
                          ? "good"
                          : "alert"
                    }
                  />
                  <MiniStat label="庫存週轉率" value={parts?.turnover ?? null} fmt={(v) => `${fmtNum1(v)}x`} />
                  <MiniStat
                    label="呆滯料佔比"
                    value={parts?.deadstock_pct ?? null}
                    fmt={fmtPct}
                    tone={
                      parts?.deadstock_pct == null
                        ? undefined
                        : parts.deadstock_pct > 0.15
                          ? "alert"
                          : "good"
                    }
                  />
                </div>
                {/* 呆滯料佔比 bar（越高越差，超過 15% 標紅） */}
                {parts?.deadstock_pct != null ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-[#9A9890]">
                      <span>呆滯料佔比</span>
                      <span className="tabular-nums">{fmtPct(parts.deadstock_pct)}（警戒 15%）</span>
                    </div>
                    <div className="mt-1 relative h-3 rounded-full bg-[#EEECE6] overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(1, parts.deadstock_pct)) * 100}%`,
                          background: parts.deadstock_pct > 0.15 ? "#CC0000" : THEME,
                        }}
                      />
                      <div className="absolute inset-y-0 w-0.5 bg-[#854F0B]" style={{ left: "15%" }} />
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniStat label="零件直銷業績" value={parts?.direct_sale_amt ?? null} fmt={fmtMoney} />
                  <MiniStat label="直銷毛利率" value={parts?.direct_sale_margin ?? null} fmt={fmtPct} />
                </div>
              </SectionCard>

              <SectionCard
                title="精品加裝"
                caption="進廠車加裝精品比例與毛利率"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[#EEECE6] bg-white px-3 py-4 text-center">
                    <div className="text-[11px] text-[#9A9890]">加裝率</div>
                    <div className="mt-1.5 text-[28px] font-semibold tabular-nums leading-none text-[#0F6E56]">
                      {accessory?.install_rate == null ? "—" : fmtPct(accessory.install_rate)}
                    </div>
                    <div className="mt-1 text-[11px] text-[#9A9890]">進廠車加裝佔比</div>
                  </div>
                  <div className="rounded-lg border border-[#EEECE6] bg-white px-3 py-4 text-center">
                    <div className="text-[11px] text-[#9A9890]">精品毛利率</div>
                    <div className="mt-1.5 text-[28px] font-semibold tabular-nums leading-none text-[#185FA5]">
                      {accessory?.margin == null ? "—" : fmtPct(accessory.margin)}
                    </div>
                    <div className="mt-1 text-[11px] text-[#9A9890]">精品銷售毛利</div>
                  </div>
                </div>
                {accessory?.install_rate == null && accessory?.margin == null ? (
                  <p className="mt-2 text-center text-[11px] text-[#9A9890]">
                    尚無精品加裝資料（待 demo seed）
                  </p>
                ) : null}
              </SectionCard>
            </div>

            {/* 部門診斷摘要 */}
            <SectionCard title="部門診斷摘要" caption="依門店指標 vs 集團均值 / 警戒線自動產生">
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
        資料策略沿用 round-16：能即時算就算、算不出的細粒度門店指標（吸收率／車間三率／業務結構／
        零件庫存／精品加裝／客戶流動等）由 KPI 快照（demo seed）補上。門店切換會打 server 重撈該店單期診斷與月趨勢。
      </p>
    </main>
  );
}
