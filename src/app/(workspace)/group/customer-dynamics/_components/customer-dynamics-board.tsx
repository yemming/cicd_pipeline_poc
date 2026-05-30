"use client";

/**
 * GRP18 集團客戶動態 — client board
 *
 * 單頁雙視圖（switchStore 純前端切、無 server 重撈）：
 *   ▸ 集團總覽：3 條 alert + 5 KPI 卡 + 旅程漏斗<D3FunnelChart> + 來源<D3DonutChart>
 *     + 門店流動<D3GroupedBar vertical> + 流失原因<D3GroupedBar horizontal>
 *     + NPS 月度<D3LineTrend> + 高風險彙總表（門店名可下鑽）
 *   ▸ 單店深鑽：mode-bar + 5 KPI + alert + 單店漏斗 + mini-stats + 單店 NPS 小折線
 *     + 匿名客戶名單（篩選）+ 高風險清單（days≥90）
 *
 * 資料全程 null/空安全（缺值「—」、空資料提示，不 crash）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3FunnelChart } from "@/components/charts/d3-funnel";
import { D3DonutChart } from "@/components/charts/d3-donut";
import { D3GroupedBar } from "@/components/charts/d3-grouped-bar";
import { D3LineTrend } from "@/components/charts/d3-line-trend";
import { FLOW_SERIES, CHURN_RISK_DAYS } from "@/domain/group-analytics-labels";
import type {
  GroupCustomerDynamics,
  StoreCustomerJourney,
  CustomerMetricDatum,
  CustomerKpis,
  CustomerRow,
  NpsPoint,
} from "@/domain/group-analytics";

type Props = {
  group: GroupCustomerDynamics | null;
  journeys: StoreCustomerJourney[];
};

/* ────────────── 格式化 helper（確定性，無 locale 漂移，SSR 安全） ────────────── */

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n)
    ? "—"
    : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const fmtPct = (rate: number | null | undefined, digits = 1): string =>
  rate == null || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(digits)}%`;

const fmtNps = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : `+${Math.round(n)}`;

/** "2026-01-01" → "1月" */
const monthShort = (ymd: string): string => `${parseInt(ymd.slice(5, 7), 10)}月`;

/** funnel/donut/bar 用：CustomerMetricDatum → 數值（缺回 0） */
const valOf = (d: CustomerMetricDatum): number => d.value ?? 0;

/* ────────────── 共用小元件 ────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <h2 className="text-[13px] font-bold text-[#1A3A5C] tracking-wider">{children}</h2>
      <div className="flex-1 h-px bg-[#85B7EB]" />
    </div>
  );
}

function Card({
  title,
  tag,
  tagTone = "navy",
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  tagTone?: "navy" | "green" | "red";
  children: ReactNode;
  className?: string;
}) {
  const tagCls =
    tagTone === "green"
      ? "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]"
      : tagTone === "red"
        ? "bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]"
        : "bg-[#EAF4FB] text-[#1A3A5C] border-[#85B7EB]";
  return (
    <section
      className={`bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden ${className}`}
    >
      <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
          <span className="w-2 h-2 rounded-full bg-[#1A3A5C]" />
          {title}
        </div>
        {tag ? (
          <span className={`text-[11px] px-2 py-0.5 rounded border ${tagCls}`}>{tag}</span>
        ) : null}
      </header>
      <div className="px-[18px] py-[18px]">{children}</div>
    </section>
  );
}

/** KPI 卡（集團 / 單店共用）。tone 控制頂部色條與值色。 */
function KpiCard({
  label,
  value,
  unit,
  sub,
  tone = "navy",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "navy" | "good" | "warn";
}) {
  const bar =
    tone === "warn" ? "bg-[#C8001A]" : tone === "good" ? "bg-[#0F6E56]" : "bg-[#1A3A5C]";
  return (
    <div className="relative bg-white border border-[#E0DDD6] rounded-[10px] px-[18px] py-4 overflow-hidden">
      <span className={`absolute top-0 left-0 right-0 h-[3px] ${bar}`} />
      <div className="text-[11px] text-[#5A5A5A] mb-2">{label}</div>
      <div className="text-[24px] font-bold text-[#1A1A1A] leading-none mb-1.5">
        {value}
        {unit ? <span className="text-[13px] font-normal text-[#5A5A5A]"> {unit}</span> : null}
      </div>
      {sub ? <div className="text-[11px] text-[#5A5A5A]">{sub}</div> : null}
    </div>
  );
}

/** 5 KPI 卡（集團 / 單店共用 CustomerKpis）。 */
function KpiRow({ kpis }: { kpis: CustomerKpis }) {
  const newPct =
    kpis.newCust != null && kpis.active != null && kpis.active > 0
      ? `佔活躍客戶 ${((kpis.newCust / kpis.active) * 100).toFixed(1)}%`
      : "本季新增";
  const churnWarn = kpis.churnRate != null && kpis.churnRate * 100 > 7;
  const repurchaseGood = kpis.repurchaseRate != null && kpis.repurchaseRate * 100 >= 35;
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-7">
      <KpiCard label="👥 活躍客戶" value={fmtInt(kpis.active)} unit="人" sub="近 6 個月有互動" />
      <KpiCard
        label="🆕 本季新客戶"
        value={fmtInt(kpis.newCust)}
        unit="人"
        sub={newPct}
        tone="good"
      />
      <KpiCard
        label="🔄 客戶回購率"
        value={fmtPct(kpis.repurchaseRate)}
        sub="集團目標 ≥ 35%"
        tone={repurchaseGood ? "good" : "navy"}
      />
      <KpiCard
        label="📉 客戶流失率"
        value={fmtPct(kpis.churnRate)}
        sub="警戒線 ≤ 7%"
        tone={churnWarn ? "warn" : "navy"}
      />
      <KpiCard label="⭐ 集團 NPS" value={fmtNps(kpis.nps)} sub="產業均值 +35" />
    </div>
  );
}

/** 警示橫幅（集團 / 單店共用）。 */
function AlertBanner({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="bg-[#FDECEA] border border-[#F5AEAD] border-l-4 border-l-[#C8001A] rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2.5 text-[13px] text-[#8B0012] flex-wrap">
      <span className="text-[16px]">⚠️</span>
      <strong className="mr-1">客戶警示</strong>
      <div className="flex gap-5 flex-wrap">
        {alerts.map((a, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C8001A] shrink-0" />
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 客戶類型 / 風險 chip。 */
function Chip({ kind, value }: { kind: "type" | "risk" | "warranty"; value: string }) {
  let cls = "bg-[#EAF4FB] text-[#1A3A5C]";
  if (kind === "type") {
    cls =
      value === "新客"
        ? "bg-[#EAF4FB] text-[#1A3A5C]"
        : value === "回購"
          ? "bg-[#E1F5EE] text-[#0F6E56]"
          : "bg-[#EEEDFE] text-[#534AB7]";
  } else if (kind === "risk") {
    cls =
      value === "danger"
        ? "bg-[#FDECEA] text-[#C8001A]"
        : value === "warn"
          ? "bg-[#FDF3E3] text-[#854F0B]"
          : "bg-[#E1F5EE] text-[#0F6E56]";
  } else {
    cls = value === "保固中" ? "bg-[#E1F5EE] text-[#0F6E56]" : "bg-[#FDF3E3] text-[#854F0B]";
  }
  const text =
    kind === "risk"
      ? value === "danger"
        ? "高"
        : value === "warn"
          ? "中"
          : "低"
      : value;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

/* ────────────── NPS 走勢（單線；prevYear 給 null 不畫第二條） ────────────── */

function NpsTrend({ trend, height = 200 }: { trend: NpsPoint[]; height?: number }) {
  const months = trend.map((p) => monthShort(p.month));
  const current = trend.map((p) => p.value);
  const prevYear = trend.map(() => null);
  return (
    <D3LineTrend
      months={months}
      current={current}
      prevYear={prevYear}
      currentLabel="NPS"
      prevYearLabel=""
      colorTheme="#1A3A5C"
      height={height}
      valueFormat={(v) => `+${Math.round(v)}`}
      emptyMessage="尚無 NPS 月度資料"
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   主元件
   ══════════════════════════════════════════════════════════════ */

export function CustomerDynamicsBoard({ group, journeys }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useSetPageHeader({
    title: "集團客戶動態",
    breadcrumb: [{ label: "集團管理" }, { label: "客戶動態" }],
    hideSearch: true,
  });

  const journeyMap = useMemo(() => {
    const map = new Map<string, StoreCustomerJourney>();
    for (const j of journeys) map.set(j.store.id, j);
    return map;
  }, [journeys]);

  const activeJourney = selected ? (journeyMap.get(selected) ?? null) : null;

  if (!group) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#9A9890]">尚無客戶動態資料</p>
      </main>
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">集團客戶動態</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP18
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶漏斗 × 流入流失 × 來源分析 × 高風險預警
        </span>
        {/* 門店切換器 */}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selected ?? "all"}
            onChange={(e) => setSelected(e.target.value === "all" ? null : e.target.value)}
            className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] bg-white"
          >
            <option value="all">全部門店</option>
            {journeys.map((j) => (
              <option key={j.store.id} value={j.store.id}>
                {j.store.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {activeJourney ? (
        <DrillView journey={activeJourney} onBack={() => setSelected(null)} />
      ) : (
        <GroupView group={group} onDrill={(id) => setSelected(id)} />
      )}
    </main>
  );
}

/* ────────────── 集團總覽 ────────────── */

function GroupView({
  group,
  onDrill,
}: {
  group: GroupCustomerDynamics;
  onDrill: (storeId: string) => void;
}) {
  const newCustTotal = group.kpis.newCust;

  return (
    <div className="space-y-1">
      <AlertBanner alerts={group.alerts} />

      <SectionTitle>👥 本季客戶關鍵指標</SectionTitle>
      <KpiRow kpis={group.kpis} />

      {/* 漏斗 + 來源 */}
      <SectionTitle>🔽 客戶旅程漏斗</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 mb-6">
        <Card title="集團客戶旅程漏斗" tag="本季累計">
          <D3FunnelChart
            stages={group.funnel.map((f) => ({
              label: f.label,
              count: valOf(f),
              color: f.color,
            }))}
          />
        </Card>
        <Card title="新客來源分析" tag="本季">
          <D3DonutChart
            segments={group.sources.map((s) => ({
              label: s.label,
              value: valOf(s),
              color: s.color,
            }))}
            centerValue={fmtInt(newCustTotal)}
            centerLabel="新客戶"
            height={180}
          />
        </Card>
      </div>

      {/* 門店流動對比 */}
      <SectionTitle>🏪 門店客戶流動對比</SectionTitle>
      <Card title="各門店新客 × 回購 × 流失對比" tag="本季" className="mb-6">
        <D3GroupedBar
          groups={group.storeFlow.map((s) => s.store.short_name ?? s.store.name)}
          series={FLOW_SERIES.map((def) => ({
            key: def.key,
            label: def.label,
            color: def.color,
            values: group.storeFlow.map((s) =>
              def.key === "flow_new"
                ? (s.newCust ?? 0)
                : def.key === "flow_repeat"
                  ? (s.repeat ?? 0)
                  : (s.churn ?? 0),
            ),
          }))}
          orientation="vertical"
          height={240}
          showLegend
        />
      </Card>

      {/* 流失原因 + NPS 走勢 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card title="客戶流失原因分析" tag="本季流失客戶">
          <D3GroupedBar
            groups={group.lostReasons.map((r) => r.label)}
            series={[
              {
                key: "lost_reason",
                label: "流失原因",
                values: group.lostReasons.map(valOf),
              },
            ]}
            orientation="horizontal"
            valueSuffix="%"
            colors={group.lostReasons.map((r) => r.color)}
            height={200}
          />
        </Card>
        <Card title="集團 NPS 月度走勢" tag="近 6 個月">
          <NpsTrend trend={group.npsTrend} />
        </Card>
      </div>

      {/* 高風險彙總表 */}
      <SectionTitle>🚨 高風險流失客戶預警（集團）</SectionTitle>
      <section className="bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden">
        <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
            <span className="w-2 h-2 rounded-full bg-[#1A3A5C]" />
            超過 90 天未回廠客戶
          </div>
          <div className="flex gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded border bg-[#EAF4FB] text-[#1A3A5C] border-[#85B7EB]">
              集團彙總
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded border bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]">
              高風險 {fmtInt(group.highRiskCount)} 人
            </span>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#FAFAF8]">
                {["門店", "超過 90 天", "超過 180 天", "平均未回廠天數", "佔活躍客戶比", "建議行動"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[11px] text-[#5A5A5A] font-semibold border-b border-[#E0DDD6] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {group.riskTable.map((r) => (
                <tr key={r.store.id} className="hover:bg-[#EAF4FB]">
                  <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                    <button
                      type="button"
                      onClick={() => onDrill(r.store.id)}
                      className="font-semibold text-[#1A3A5C] hover:underline cursor-pointer"
                    >
                      {r.store.name} ↗
                    </button>
                  </td>
                  <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{fmtInt(r.over90)}</td>
                  <td
                    className={`px-3 py-2.5 border-b border-[#F0EDE8] font-semibold ${
                      (r.over180 ?? 0) >= 10 ? "text-[#C8001A]" : "text-[#854F0B]"
                    }`}
                  >
                    {fmtInt(r.over180)}
                  </td>
                  <td
                    className={`px-3 py-2.5 border-b border-[#F0EDE8] font-semibold ${
                      (r.avgDays ?? 0) >= 150 ? "text-[#C8001A]" : "text-[#1A1A1A]"
                    }`}
                  >
                    {r.avgDays != null ? `${Math.round(r.avgDays)}天` : "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                    {r.pctActive != null ? `${r.pctActive}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.action.level === "danger"
                          ? "bg-[#FDECEA] text-[#C8001A]"
                          : "bg-[#FDF3E3] text-[#854F0B]"
                      }`}
                    >
                      {r.action.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#FAFAF8] font-bold border-t-2 border-[#E0DDD6]">
                <td className="px-3 py-2.5">集團合計</td>
                <td className="px-3 py-2.5">{fmtInt(group.riskTotal.over90)} 人</td>
                <td className="px-3 py-2.5 text-[#C8001A]">{fmtInt(group.riskTotal.over180)} 人</td>
                <td className="px-3 py-2.5">
                  {group.riskTotal.avgDays != null ? `${group.riskTotal.avgDays}天` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {group.riskTotal.pctActive != null ? `${group.riskTotal.pctActive}%` : "—"}
                </td>
                <td className="px-3 py-2.5">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="text-[11px] text-[#5A5A5A] px-3.5 py-2.5">
          💡 點擊門店名稱進入單店深鑽，查看個別客戶清單
        </div>
      </section>
    </div>
  );
}

/* ────────────── 單店深鑽 ────────────── */

const CUST_FILTERS = [
  { value: "all", label: "全部客戶" },
  { value: "new", label: "新客戶" },
  { value: "repeat", label: "回購客戶" },
  { value: "risk", label: "高風險流失" },
  { value: "loyal", label: "忠誠客戶" },
] as const;

function filterCustomers(custs: CustomerRow[], filter: string): CustomerRow[] {
  switch (filter) {
    case "new":
      return custs.filter((c) => c.type === "新客");
    case "repeat":
      return custs.filter((c) => c.type === "回購");
    case "risk":
      return custs.filter((c) => c.risk === "danger" || c.risk === "warn");
    case "loyal":
      return custs.filter((c) => c.type === "忠誠");
    default:
      return custs;
  }
}

function DrillView({
  journey,
  onBack,
}: {
  journey: StoreCustomerJourney;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const shown = useMemo(() => filterCustomers(journey.customers, filter), [journey.customers, filter]);

  const toneCls = (tone: "navy" | "green" | "amber" | "red") =>
    tone === "green"
      ? "text-[#0F6E56]"
      : tone === "amber"
        ? "text-[#854F0B]"
        : tone === "red"
          ? "text-[#C8001A]"
          : "text-[#1A3A5C]";

  return (
    <div className="space-y-1">
      {/* mode bar */}
      <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2 flex items-center gap-3 text-[12px] text-[#1A3A5C] mb-3">
        <span>📍 單店深鑽模式</span>
        <span className="text-[14px] font-bold">{journey.store.name}</span>
        <span className="text-[#5A5A5A]">｜顯示該門店完整客戶動態</span>
        <button
          type="button"
          onClick={onBack}
          className="ml-auto border border-[#85B7EB] text-[#1A3A5C] px-3 py-1 rounded text-[11px] font-semibold hover:bg-[#1A3A5C] hover:text-white"
        >
          ← 返回集團總覽
        </button>
      </div>

      <SectionTitle>👥 門店客戶關鍵指標</SectionTitle>
      <KpiRow kpis={journey.kpis} />

      <AlertBanner alerts={journey.alerts} />

      {/* 漏斗 + NPS / mini-stats */}
      <SectionTitle>🔽 客戶旅程漏斗</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 mb-6">
        <Card title="客戶旅程漏斗" tag="本季">
          <D3FunnelChart
            stages={journey.funnel.map((f) => ({
              label: f.label,
              count: valOf(f),
              color: f.color,
            }))}
          />
        </Card>
        <Card title="本店 NPS 月度走勢" tag="近 6 個月">
          <div className="grid grid-cols-3 gap-px bg-[#E0DDD6] rounded-lg overflow-hidden mb-4">
            {journey.miniStats.map((s, i) => (
              <div key={i} className="bg-white px-4 py-3.5 text-center">
                <div className="text-[11px] text-[#5A5A5A] mb-1">{s.label}</div>
                <div className={`text-[18px] font-bold ${toneCls(s.tone)}`}>{s.value}</div>
              </div>
            ))}
          </div>
          <NpsTrend trend={journey.npsTrend} height={120} />
        </Card>
      </div>

      {/* 客戶名單 */}
      <SectionTitle>📋 客戶名單（匿名化）</SectionTitle>
      <section className="bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden mb-6">
        <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
            <span className="w-2 h-2 rounded-full bg-[#1A3A5C]" />
            全客戶清單
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-[28px] border border-[#85B7EB] bg-[#EAF4FB] text-[#1A3A5C] rounded px-2 text-[11px] focus:border-[#185FA5]"
            >
              {CUST_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] px-2 py-0.5 rounded border bg-[#EAF4FB] text-[#1A3A5C] border-[#85B7EB]">
              共 {shown.length} 人
            </span>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#FAFAF8]">
                {[
                  "客戶代號",
                  "車型",
                  "購車日",
                  "最後回廠",
                  "未回廠天數",
                  "保固狀態",
                  "消費次數",
                  "客戶類型",
                  "風險",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-[11px] text-[#5A5A5A] font-semibold border-b border-[#E0DDD6] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#9A9890]">
                    沒有符合條件的客戶
                  </td>
                </tr>
              ) : (
                shown.map((c) => (
                  <tr key={c.id} className="hover:bg-[#EAF4FB]">
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8] font-mono text-[11px]">
                      {c.id}
                    </td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.model}</td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.buyDate}</td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.lastVisit}</td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                      <span
                        className={`font-bold ${
                          c.days >= CHURN_RISK_DAYS.critical
                            ? "text-[#C8001A]"
                            : c.days >= CHURN_RISK_DAYS.high
                              ? "text-[#854F0B]"
                              : "text-[#1A1A1A]"
                        }`}
                      >
                        {c.days}天
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                      <Chip kind="warranty" value={c.warranty} />
                    </td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.visits}次</td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                      <Chip kind="type" value={c.type} />
                    </td>
                    <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                      <Chip kind="risk" value={c.risk} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 高風險清單 */}
      <SectionTitle>🚨 高風險流失客戶清單</SectionTitle>
      <section className="bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden">
        <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
            <span className="w-2 h-2 rounded-full bg-[#1A3A5C]" />
            超過 {CHURN_RISK_DAYS.high} 天未回廠
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded border bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]">
            高風險 {journey.highRisk.length} 人
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#FAFAF8]">
                {["客戶代號", "車型", "最後回廠", "未回廠天數", "聯絡方式", "建議行動"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-[11px] text-[#5A5A5A] font-semibold border-b border-[#E0DDD6] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {journey.highRisk.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[#9A9890]">
                    本店暫無 90 天以上未回廠客戶
                  </td>
                </tr>
              ) : (
                journey.highRisk.map((c) => {
                  const critical = c.days >= CHURN_RISK_DAYS.critical;
                  return (
                    <tr key={c.id} className="hover:bg-[#EAF4FB]">
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8] font-mono text-[11px]">
                        {c.id}
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.model}</td>
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8]">{c.lastVisit}</td>
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                        <span className={`font-bold ${critical ? "text-[#C8001A]" : "text-[#854F0B]"}`}>
                          {c.days}天
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8]">LINE / 電話</td>
                      <td className="px-3 py-2.5 border-b border-[#F0EDE8]">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                            critical
                              ? "bg-[#FDECEA] text-[#C8001A]"
                              : "bg-[#FDF3E3] text-[#854F0B]"
                          }`}
                        >
                          {critical ? "優先電話關懷" : "發送關懷簡訊"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
