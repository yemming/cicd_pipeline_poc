"use client";

/**
 * GRP12 集團零件財務總覽 — client board
 *
 * 單頁雙視圖（selected 純前端切、無 server 重撈）：
 *   ▸ 集團總覽：alert + 5 KPI + 門店營收<D3GroupedBar> + 集團快覽 mini-stat
 *     + 毛利率6月走勢<D3LineTrend> + 品類<D3DonutChart> + 庫存健康表（可下鑽）
 *     + 周轉率<D3HBar refLine> + 供應商集中度 list + 精品加裝表
 *   ▸ 單店深鑽：mode-bar + 5 KPI + alert + 採購vs出庫<D3LineTrend> + 倉庫分佈
 *     + SKU 明細（篩選）+ 呆滯清單 + 精品品項排行 + 車型別加裝率<D3HBar>
 *
 * 資料全程 null/空安全（缺值「—」、空資料提示，不 crash）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3GroupedBar } from "@/components/charts/d3-grouped-bar";
import { D3LineTrend } from "@/components/charts/d3-line-trend";
import { D3DonutChart } from "@/components/charts/d3-donut";
import { D3HBar } from "@/components/charts/d3-hbar";
import { PARTS_TURNOVER_TARGET } from "@/domain/group-analytics-labels";
import type {
  GroupPartsFinancials,
  StorePartsDrilldown,
  StorePartsRow,
  CustomerMetricDatum,
  PartsMiniStat,
  SkuRow,
} from "@/domain/group-analytics";

type Props = {
  group: GroupPartsFinancials | null;
  drills: StorePartsDrilldown[];
};

/* ────────────── 格式化 helper（確定性，SSR 安全） ────────────── */

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n)
    ? "—"
    : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 金額 → "8.47M" / "312K" 緊湊顯示 */
const fmtMoney = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};

const fmtPct = (rate: number | null | undefined, digits = 1): string =>
  rate == null || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(digits)}%`;

/** "2026-01-01" → "1月" */
const monthShort = (ymd: string): string => `${parseInt(ymd.slice(5, 7), 10)}月`;

/* ────────────── 共用小元件 ────────────── */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3.5 mt-1">
      <h2 className="text-[13px] font-bold text-[#854F0B] tracking-wider">{children}</h2>
      <div className="flex-1 h-px bg-[#F0C97E]" />
    </div>
  );
}

function Card({
  title,
  tag,
  tagTone = "amber",
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  tagTone?: "amber" | "green" | "red";
  children: ReactNode;
  className?: string;
}) {
  const tagCls =
    tagTone === "green"
      ? "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]"
      : tagTone === "red"
        ? "bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]"
        : "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]";
  return (
    <section className={`bg-white border border-[#E0DDD6] rounded-[10px] overflow-hidden ${className}`}>
      <header className="px-4 py-3 border-b border-[#E0DDD6] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A]">
          <span className="w-2 h-2 rounded-full bg-[#854F0B]" />
          {title}
        </div>
        {tag ? <span className={`text-[11px] px-2 py-0.5 rounded border ${tagCls}`}>{tag}</span> : null}
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
  tone = "amber",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "amber" | "good" | "warn";
}) {
  const bar = tone === "warn" ? "bg-[#C8001A]" : tone === "good" ? "bg-[#0F6E56]" : "bg-[#854F0B]";
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

/** 警示橫幅。 */
function AlertBanner({ alerts, label = "庫存警示" }: { alerts: string[]; label?: string }) {
  if (alerts.length === 0) return null;
  return (
    <div className="bg-[#FDECEA] border border-[#F5AEAD] border-l-4 border-l-[#C8001A] rounded-lg px-4 py-2.5 mb-5 flex items-center gap-2.5 text-[13px] text-[#8B0012] flex-wrap">
      <span className="text-[16px]">⚠️</span>
      <strong className="mr-1">{label}</strong>
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

/** SKU / 庫存狀態 badge。 */
function StatusBadge({ status }: { status: SkuRow["status"] }) {
  const map: Record<SkuRow["status"], { cls: string; text: string }> = {
    normal: { cls: "bg-[#E1F5EE] text-[#0A5040]", text: "正常" },
    warn90: { cls: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]", text: "滯銷90天" },
    warn180: { cls: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]", text: "呆滯180天" },
    low: { cls: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]", text: "庫存不足" },
  };
  const { cls, text } = map[status];
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${cls}`}>{text}</span>;
}

/** 庫存健康狀態 badge（門店表）。 */
function HealthBadge({ status }: { status: StorePartsRow["status"] }) {
  const map: Record<StorePartsRow["status"], { cls: string; text: string }> = {
    ok: { cls: "bg-[#E1F5EE] text-[#0A5040]", text: "健康" },
    warn: { cls: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]", text: "留意" },
    danger: { cls: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]", text: "呆滯警示" },
  };
  const { cls, text } = map[status];
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${cls}`}>{text}</span>;
}

/* ══════════════════════════════════════════════════════════════
   主元件
   ══════════════════════════════════════════════════════════════ */

export function PartsFinancialsBoard({ group, drills }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  useSetPageHeader({
    title: "集團零件財務總覽",
    breadcrumb: [{ label: "集團管理" }, { label: "零件財務" }],
    hideSearch: true,
  });

  const drillMap = useMemo(() => {
    const map = new Map<string, StorePartsDrilldown>();
    for (const d of drills) map.set(d.store.id, d);
    return map;
  }, [drills]);

  const activeDrill = selected ? (drillMap.get(selected) ?? null) : null;

  if (!group) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#9A9890]">尚無零件財務資料</p>
      </main>
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">集團零件財務總覽</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">GRP12</span>
        <span className="text-[12px] text-[#9A9890]">零件採購 × 庫存健康 × 供應商集中度 × 精品加裝</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selected ?? "all"}
            onChange={(e) => setSelected(e.target.value === "all" ? null : e.target.value)}
            className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:border-[#854F0B] bg-white"
          >
            <option value="all">全部門店</option>
            {drills.map((d) => (
              <option key={d.store.id} value={d.store.id}>
                {d.store.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {activeDrill ? (
        <DrillView drill={activeDrill} onBack={() => setSelected(null)} />
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
  group: GroupPartsFinancials;
  onDrill: (storeId: string) => void;
}) {
  const k = group.kpis;
  const deadHigh = group.storeRows.some((r) => (r.deadstockPct ?? 0) >= 0.1);

  // 門店營收 grouped-bar（單系列、per-store）
  const revGroups = group.storeRows.map((r) => r.store.short_name ?? r.store.name);
  const revSeries = [
    {
      key: "revenue",
      label: "零件營收（K）",
      color: "#F5B942",
      values: group.storeRows.map((r) => (r.revenue ?? 0) / 1000),
    },
  ];

  // 周轉率 HBar（達標分級色）
  const turnoverData = group.storeRows.map((r) => ({
    label: r.store.short_name ?? r.store.name,
    value: r.turnover ?? 0,
  }));

  // 毛利率 6 月走勢（單線）
  const trendMonths = group.marginTrend.months.map(monthShort);
  const trendValues = group.marginTrend.values;

  return (
    <>
      <AlertBanner alerts={group.alerts} />

      {/* 5 KPI */}
      <SectionTitle>📦 本季集團關鍵指標</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-6">
        <KpiCard label="🔧 零件總營收" value={`NT$ ${fmtMoney(k.revenue)}`} sub="本季累計" />
        <KpiCard
          label="💰 零件毛利率"
          value={fmtPct(k.marginRate)}
          sub="Benchmark ≥ 30%"
          tone={k.marginRate != null && k.marginRate >= 0.3 ? "good" : "warn"}
        />
        <KpiCard
          label="🔄 庫存周轉率"
          value={k.turnover != null ? k.turnover.toFixed(1) : "—"}
          unit="次/年"
          sub={`目標 ≥ ${PARTS_TURNOVER_TARGET.toFixed(1)} 次/年`}
        />
        <KpiCard
          label="🚨 呆滯庫存金額"
          value={`NT$ ${fmtMoney(k.deadstockAmt)}`}
          sub="警戒佔比 5%"
          tone={deadHigh ? "warn" : "amber"}
        />
        <KpiCard label="✨ 精品加裝業績" value={`NT$ ${fmtMoney(k.accessoryRevenue)}`} sub="本季累計" tone="good" />
      </div>

      {/* 門店業績對比 + 月度快覽 */}
      <SectionTitle>📊 門店零件業績對比</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2">
          <Card title="各門店零件營收" tag="本季累計">
            <D3GroupedBar
              groups={revGroups}
              series={revSeries}
              orientation="vertical"
              height={220}
              valueFormat={(v) => `${Math.round(v)}K`}
            />
          </Card>
        </div>
        <Card title="本月集團快覽" tag={group.period.slice(0, 7)}>
          <div className="grid grid-cols-3 gap-px bg-[#E0DDD6] rounded-lg overflow-hidden mb-4">
            {group.miniStats.map((s) => (
              <MiniStat key={s.label} stat={s} />
            ))}
          </div>
          <div className="text-[11px] text-[#5A5A5A] mb-1.5">零件毛利率月度走勢（近 6 月）</div>
          <D3LineTrend
            months={trendMonths}
            current={trendValues}
            prevYear={trendValues.map(() => null)}
            currentLabel="毛利率"
            prevYearLabel=""
            colorTheme="#F5B942"
            height={120}
            valueFormat={(v) => `${(v * 100).toFixed(0)}%`}
            emptyMessage="尚無走勢資料"
          />
        </Card>
      </div>

      {/* 品項結構 + 庫存健康 */}
      <SectionTitle>🗂 品項結構 × 庫存健康</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card title="零件品項業務結構" tag="金額佔比">
          <CategoryDonut data={group.categoryMix} />
        </Card>
        <Card title="庫存健康一覽" tag="各門店">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-[11px] text-[#5A5A5A]">
                  <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">門店</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存總額</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">毛利率</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">周轉率</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">呆滯率</th>
                  <th className="text-center font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">狀態</th>
                </tr>
              </thead>
              <tbody>
                {group.storeRows.map((r) => (
                  <tr key={r.store.id} className="hover:bg-[#FDF3E3]">
                    <td className="py-2 px-2 border-b border-[#F0EDE8]">
                      <button
                        onClick={() => onDrill(r.store.id)}
                        className="font-semibold text-[#1A3A5C] hover:underline"
                      >
                        {r.store.name} ↗
                      </button>
                    </td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtMoney(r.inventoryValue)}</td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{fmtPct(r.marginRate)}</td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{r.turnover != null ? `${r.turnover}次` : "—"}</td>
                    <td
                      className={`py-2 px-2 border-b border-[#F0EDE8] text-right font-semibold ${(r.deadstockPct ?? 0) >= 0.1 ? "text-[#C8001A]" : (r.deadstockPct ?? 0) >= 0.05 ? "text-[#854F0B]" : "text-[#0F6E56]"}`}
                    >
                      {fmtPct(r.deadstockPct)}
                    </td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-center">
                      <HealthBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-[#9A9890] pt-2.5">💡 點擊門店名稱可進入單店深鑽模式</div>
        </Card>
      </div>

      {/* 周轉率 + 供應商 */}
      <SectionTitle>🔄 庫存周轉 × 供應商分析</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card title="各門店庫存周轉率對比" tag={`次/年，目標 ≥ ${PARTS_TURNOVER_TARGET.toFixed(1)}`}>
          <D3HBar
            data={turnoverData}
            height={200}
            valueSuffix=" 次"
            valueFormat={(v) => v.toFixed(1)}
            domain={[0, Math.max(10, ...turnoverData.map((d) => d.value)) * 1.1]}
            refLines={[{ value: PARTS_TURNOVER_TARGET, label: `目標 ${PARTS_TURNOVER_TARGET.toFixed(1)}`, color: "#854F0B" }]}
            colorFn={(d) => (d.value >= PARTS_TURNOVER_TARGET ? "#0F6E56" : d.value >= PARTS_TURNOVER_TARGET * 0.85 ? "#F5B942" : "#C8001A")}
          />
        </Card>
        <Card title="前 10 大供應商採購集中度" tag="本季">
          <VendorList group={group} />
        </Card>
      </div>

      {/* 精品加裝 */}
      <SectionTitle>✨ 精品加裝業績明細</SectionTitle>
      <Card
        title="精品加裝 — 門店業績"
        tag={`台均加裝率 ${fmtPct(group.accessoryTotal.installRate, 1)}`}
        tagTone="green"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-[11px] text-[#5A5A5A]">
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">門店</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">加裝台數</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">加裝率</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">精品營收</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">台均精品額</th>
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">TOP 品項</th>
              </tr>
            </thead>
            <tbody>
              {group.accessoryRows.map((a) => (
                <tr key={a.store.id} className="hover:bg-[#FDF3E3]">
                  <td className="py-2 px-2 border-b border-[#F0EDE8]">
                    <button onClick={() => onDrill(a.store.id)} className="font-semibold text-[#1A3A5C] hover:underline">
                      {a.store.name} ↗
                    </button>
                  </td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{a.units != null ? `${a.units}台` : "—"}</td>
                  <td
                    className={`py-2 px-2 border-b border-[#F0EDE8] text-right font-semibold ${(a.installRate ?? 0) >= 0.4 ? "text-[#0F6E56]" : (a.installRate ?? 0) >= 0.3 ? "text-[#854F0B]" : "text-[#C8001A]"}`}
                  >
                    {fmtPct(a.installRate)}
                  </td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtMoney(a.revenue)}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtInt(a.avgTicket)}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-[#5A5A5A]">{a.topItems.join("、") || "—"}</td>
                </tr>
              ))}
              <tr className="font-bold bg-[#FAFAF8]">
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6]">集團合計</td>
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6] text-right">
                  {group.accessoryTotal.units != null ? `${group.accessoryTotal.units}台` : "—"}
                </td>
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6] text-right text-[#0F6E56]">
                  {fmtPct(group.accessoryTotal.installRate)}
                </td>
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6] text-right">NT${fmtMoney(group.accessoryTotal.revenue)}</td>
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6] text-right">NT${fmtInt(group.accessoryTotal.avgTicket)}</td>
                <td className="py-2 px-2 border-t-2 border-[#E0DDD6]">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ────────────── 集團子元件 ────────────── */

function MiniStat({ stat }: { stat: PartsMiniStat }) {
  const valCls =
    stat.tone === "red"
      ? "text-[#C8001A]"
      : stat.tone === "green"
        ? "text-[#0F6E56]"
        : stat.tone === "amber"
          ? "text-[#854F0B]"
          : "text-[#1A1A1A]";
  return (
    <div className="bg-white px-3 py-3 text-center">
      <div className="text-[11px] text-[#5A5A5A] mb-1">{stat.label}</div>
      <div className={`text-[17px] font-bold ${valCls}`}>{stat.value}</div>
    </div>
  );
}

function CategoryDonut({ data }: { data: CustomerMetricDatum[] }) {
  const segments = data.map((d) => ({ label: d.label, value: d.value ?? 0, color: d.color }));
  const hasData = segments.some((s) => s.value > 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <D3DonutChart segments={segments} centerValue="4類" centerLabel="品項結構" height={200} showLegend />
      {!hasData ? <div className="text-[12px] text-[#9A9890]">尚無品項結構資料</div> : null}
    </div>
  );
}

function VendorList({ group }: { group: GroupPartsFinancials }) {
  if (group.vendors.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無供應商資料</div>;
  }
  const maxPct = Math.max(...group.vendors.map((v) => v.pct), 1);
  return (
    <div className="space-y-0">
      {group.vendors.map((v, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[#F0EDE8] last:border-b-0">
          <div
            className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${i < 3 ? "bg-[#854F0B] text-white" : "bg-[#FDF3E3] text-[#854F0B]"}`}
          >
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#1A1A1A] truncate">{v.name}</div>
            {v.sub ? <div className="text-[11px] text-[#5A5A5A]">{v.sub}</div> : null}
          </div>
          <div className="w-[100px] h-[6px] bg-[#F0EDE8] rounded overflow-hidden shrink-0">
            <div className="h-full bg-[#F5B942] rounded" style={{ width: `${(v.pct / maxPct) * 100}%` }} />
          </div>
          <div className="text-[12px] font-bold text-[#854F0B] w-[36px] text-right shrink-0">{v.pct}%</div>
        </div>
      ))}
      {group.vendorConcentration != null && group.vendorConcentration >= 60 ? (
        <div className="text-[11px] text-[#C8001A] mt-2.5 px-2.5 py-1.5 bg-[#FDECEA] rounded">
          ⚠️ 前 3 大供應商合計佔比偏高（{group.vendorConcentration}%），建議評估備用供應商
        </div>
      ) : null}
    </div>
  );
}

/* ────────────── 單店深鑽 ────────────── */

function DrillView({ drill, onBack }: { drill: StorePartsDrilldown; onBack: () => void }) {
  const [skuFilter, setSkuFilter] = useState<"all" | "warn90" | "warn180" | "low">("all");
  const k = drill.kpis;

  const filteredSkus = useMemo(() => {
    if (skuFilter === "all") return drill.skus;
    if (skuFilter === "warn90") return drill.skus.filter((s) => s.status === "warn90" || s.status === "warn180");
    if (skuFilter === "warn180") return drill.skus.filter((s) => s.status === "warn180");
    return drill.skus.filter((s) => s.status === "low");
  }, [drill.skus, skuFilter]);

  const modelData = drill.modelAccessory.map((m) => ({ label: m.model, value: m.rate }));

  return (
    <>
      {/* mode-bar */}
      <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-2 flex items-center gap-3 text-[12px] text-[#854F0B] mb-3">
        <span>📍 單店深鑽模式</span>
        <span className="text-[14px] font-bold text-[#854F0B]">{drill.store.name}</span>
        <span className="text-[#5A5A5A]">｜顯示該門店完整零件財務明細</span>
        <button
          onClick={onBack}
          className="ml-auto border border-[#F0C97E] text-[#854F0B] px-3 py-1 rounded text-[11px] font-semibold hover:bg-[#854F0B] hover:text-white"
        >
          ← 返回集團總覽
        </button>
      </div>

      {/* 5 KPI */}
      <SectionTitle>📦 門店關鍵指標</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-5">
        <KpiCard label="🔧 零件總營收" value={`NT$ ${fmtMoney(k.revenue)}`} sub="本季累計" />
        <KpiCard
          label="💰 零件毛利率"
          value={fmtPct(k.marginRate)}
          sub="Benchmark ≥ 30%"
          tone={k.marginRate != null && k.marginRate >= 0.3 ? "good" : "warn"}
        />
        <KpiCard label="🔄 庫存周轉率" value={k.turnover != null ? k.turnover.toFixed(1) : "—"} unit="次/年" sub={`目標 ≥ ${PARTS_TURNOVER_TARGET.toFixed(1)}`} />
        <KpiCard
          label="🚨 呆滯庫存"
          value={`NT$ ${fmtMoney(k.deadstockAmt)}`}
          sub={`佔比 ${fmtPct(k.deadstockPct)}`}
          tone={(k.deadstockPct ?? 0) >= 0.1 ? "warn" : "amber"}
        />
        <KpiCard label="✨ 精品加裝業績" value={`NT$ ${fmtMoney(k.accessoryRevenue)}`} sub="本季累計" tone="good" />
      </div>

      <AlertBanner alerts={drill.alerts} label="門店警示" />
      {drill.alerts.length === 0 ? (
        <div className="bg-[#E1F5EE] border border-[#5DCAA5] border-l-4 border-l-[#0F6E56] rounded-lg px-4 py-2.5 mb-5 text-[13px] text-[#0A5040]">
          ✅ 本門店目前無異常警示，庫存狀態健康
        </div>
      ) : null}

      {/* 採購 vs 出庫 + 倉庫分佈 */}
      <SectionTitle>📈 採購 × 出庫月度趨勢</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2">
          <Card title="採購金額 vs 出庫金額（月）" tag="近 6 個月">
            <D3LineTrend
              months={drill.purchaseTrend.months.map(monthShort)}
              current={drill.purchaseTrend.purchase.map((v) => (v == null ? null : v / 1000))}
              prevYear={drill.purchaseTrend.issue.map((v) => (v == null ? null : v / 1000))}
              currentLabel="採購金額"
              prevYearLabel="出庫金額"
              colorTheme="#F5B942"
              height={200}
              valueFormat={(v) => `${Math.round(v)}K`}
              emptyMessage="尚無趨勢資料"
            />
          </Card>
        </div>
        <Card title="倉庫分佈" tag="庫存金額">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-[11px] text-[#5A5A5A]">
                  <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">倉庫</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">SKU數</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存金額</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">佔比</th>
                </tr>
              </thead>
              <tbody>
                {drill.warehouses.map((w, i) => (
                  <tr key={i} className="hover:bg-[#FDF3E3]">
                    <td className="py-2 px-2 border-b border-[#F0EDE8]">{w.name}</td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{w.sku}</td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtMoney(w.value)}</td>
                    <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{w.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* SKU 明細 */}
      <SectionTitle>🗃 SKU 庫存明細</SectionTitle>
      <Card title="全品項庫存狀態" tag={`共 ${filteredSkus.length} 項`}>
        <div className="flex justify-end mb-2.5">
          <select
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value as typeof skuFilter)}
            className="h-[28px] border border-[#F0C97E] rounded px-2 text-[11.5px] text-[#854F0B] bg-[#FDF3E3]"
          >
            <option value="all">全部品項</option>
            <option value="warn90">滯銷 ≥90天</option>
            <option value="warn180">呆滯 ≥180天</option>
            <option value="low">安全庫存不足</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-[11px] text-[#5A5A5A]">
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">品號</th>
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">品名</th>
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">類別</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存量</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">安全庫存</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存金額</th>
                <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">最後異動</th>
                <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">滯銷天數</th>
                <th className="text-center font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">狀態</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkus.map((s) => (
                <tr key={s.id} className="hover:bg-[#FDF3E3]">
                  <td className="py-2 px-2 border-b border-[#F0EDE8] font-mono text-[11px]">{s.id}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8]">{s.name}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8]">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#FDF3E3] text-[#854F0B]">{s.cat}</span>
                  </td>
                  <td className={`py-2 px-2 border-b border-[#F0EDE8] text-right ${s.qty <= s.safe ? "text-[#C8001A] font-semibold" : ""}`}>{s.qty}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{s.safe}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtInt(s.amt)}</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-[#5A5A5A]">{s.lastMove}</td>
                  <td className={`py-2 px-2 border-b border-[#F0EDE8] text-right font-semibold ${s.status === "warn180" ? "text-[#C8001A]" : s.status === "warn90" ? "text-[#854F0B]" : "text-[#0F6E56]"}`}>{s.age}天</td>
                  <td className="py-2 px-2 border-b border-[#F0EDE8] text-center"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
              {filteredSkus.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-[12px] text-[#9A9890]">無符合條件的品項</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 呆滯清單 */}
      {drill.deadList.length > 0 ? (
        <>
          <SectionTitle>🚨 呆滯 SKU 處理建議</SectionTitle>
          <Card title="超過 90 天未異動品項" tag="需處理" tagTone="red">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="text-[11px] text-[#5A5A5A]">
                    <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">品號</th>
                    <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">品名</th>
                    <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">滯銷天數</th>
                    <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存量</th>
                    <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">庫存金額</th>
                    <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">建議處置</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.deadList.map((s) => (
                    <tr key={s.id} className="hover:bg-[#FDF3E3]">
                      <td className="py-2 px-2 border-b border-[#F0EDE8] font-mono text-[11px]">{s.id}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">{s.name}</td>
                      <td className={`py-2 px-2 border-b border-[#F0EDE8] text-right font-semibold ${s.age >= 180 ? "text-[#C8001A]" : "text-[#854F0B]"}`}>{s.age}天</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{s.qty}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtInt(s.amt)}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]">
                          {s.age >= 180 ? "促銷 / 退回原廠" : "促銷消化"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {/* 精品加裝明細 */}
      <SectionTitle>✨ 精品加裝明細</SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card title="精品品項業績排行" tag="本季">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-[11px] text-[#5A5A5A]">
                  <th className="text-left font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">品項</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">件數</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">營收</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">件均額</th>
                  <th className="text-right font-semibold py-2 px-2 border-b border-[#E0DDD6] bg-[#FAFAF8]">佔精品比</th>
                </tr>
              </thead>
              <tbody>
                {drill.accessoryItems.length > 0 ? (
                  drill.accessoryItems.map((a, i) => (
                    <tr key={i} className="hover:bg-[#FDF3E3]">
                      <td className="py-2 px-2 border-b border-[#F0EDE8]">{a.name}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{a.qty}件</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtMoney(a.rev)}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">NT${fmtInt(a.avg)}</td>
                      <td className="py-2 px-2 border-b border-[#F0EDE8] text-right">{a.pct}%</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="py-6 text-center text-[12px] text-[#9A9890]">尚無精品明細</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="車型別加裝率" tag="本季">
          <D3HBar
            data={modelData}
            height={200}
            valueSuffix="%"
            domain={[0, 60]}
            colorFn={(d) => (d.value >= 40 ? "#0F6E56" : d.value >= 30 ? "#F5B942" : "#C8001A")}
            emptyMessage="尚無車型加裝資料"
          />
        </Card>
      </div>
    </>
  );
}
