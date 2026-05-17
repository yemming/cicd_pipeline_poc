"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

import {
  NPS_CATEGORY_BADGE,
  NPS_SEGMENT_COLOR,
  RANGE_LABEL,
  type RangeKey,
} from "@/domain/sales-nps.constants";
import type {
  SalesNpsDashboard,
  NpsAspectRow,
  NpsSaCard,
  NpsTrendPoint,
  NpsResponseRow,
} from "@/domain/sales-nps";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const RANGES: RangeKey[] = ["6m", "12m"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

/** NPS 分數的色彩級距：>50 綠 / 0-50 黃 / <0 紅 */
function npsColor(score: number): { bg: string; fg: string } {
  if (score >= 50) return { bg: "#EAF3DE", fg: "#3B6D11" };
  if (score >= 0) return { bg: "#FDF3E3", fg: "#854F0B" };
  return { bg: "#FDECEA", fg: "#CC0000" };
}

/** 面向 bar 的顏色：≥8.5 綠 / 7.5–8.5 藍 / <7.5 amber */
function aspectColor(score: number): string {
  if (score >= 8.5) return "#0F6E56";
  if (score >= 7.5) return "#185FA5";
  return "#854F0B";
}

export function NpsDashboardView({
  data,
  range,
  rangeLabel,
  basePath = "/crm/sales/nps",
  title = "銷售 NPS 看板",
  sprintTag = "CRM05A",
  caption = "銷售後客戶滿意度淨推薦值（NPS）分析・趨勢／面向評分／批評者追蹤",
  kind = "sales",
}: {
  data: SalesNpsDashboard;
  range: RangeKey;
  rangeLabel: string;
  basePath?: string;
  title?: string;
  sprintTag?: string;
  caption?: string;
  kind?: "sales" | "aftersales";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onRangeChange = (next: RangeKey) => {
    const u = new URLSearchParams();
    if (next !== "6m") u.set("range", next);
    const qs = u.toString();
    startTransition(() => router.push(`${basePath}${qs ? `?${qs}` : ""}`));
  };

  const { kpi, trend, byStore, saCards, aspects, recentDetractors } = data;
  const isAftersales = kind === "aftersales";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{title}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintTag}
        </span>
        <span className="text-[12px] text-[#9A9890]">{caption}</span>
        <div className="ml-auto flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>期間</label>
            <select
              value={range}
              onChange={(e) => onRangeChange(e.target.value as RangeKey)}
              className={`${inputClass} w-[120px]`}
              data-testid="nps-range-select"
              disabled={isPending}
            >
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Hero：左 NPS 分數 / 右 3 欄分段分佈條 */}
      <NpsHero
        kpi={kpi}
        rangeLabel={rangeLabel}
        pending={isPending}
      />

      {/* 趨勢 + (aftersales: SA 卡片 / sales: KPI 摘要) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard
          title={`▼ NPS 月度趨勢`}
          sub={rangeLabel}
        >
          <TrendChart trend={trend} />
        </SectionCard>
        {isAftersales ? (
          <SectionCard title="▼ SA 個人 NPS 表現" sub="本期各 SA 客戶滿意度">
            <SaCardGrid cards={saCards} />
          </SectionCard>
        ) : (
          <SectionCard title="▼ RS 個人 NPS 表現" sub="本期各 RS 銷售滿意度">
            <SaCardGrid cards={saCards} />
          </SectionCard>
        )}
      </section>

      {/* 各面向評分 + 依門店 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard
          title={isAftersales ? "▼ 售後各面向平均分" : "▼ 銷售各面向平均分"}
          sub="D+3 問卷細項（滿分 10）"
        >
          <AspectGrid aspects={aspects} />
        </SectionCard>
        <SectionCard title="▼ 依門店">
          <GroupTable rows={byStore} emptyMsg="尚無門店資料" testid="nps-group-store" />
        </SectionCard>
      </section>

      {/* 批評者追蹤 */}
      <SectionCard
        title="▼ 批評者追蹤處理"
        sub="評分 6 分以下，須主管介入跟進"
        badge={
          recentDetractors.length > 0 ? (
            <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FDECEA] text-[#CC0000]">
              {recentDetractors.length} 件待處理
            </span>
          ) : null
        }
      >
        <DetractorList rows={recentDetractors} isAftersales={isAftersales} />
      </SectionCard>
    </main>
  );
}

function NpsHero({
  kpi,
  rangeLabel,
  pending,
}: {
  kpi: SalesNpsDashboard["kpi"];
  rangeLabel: string;
  pending: boolean;
}) {
  const npsBadge = npsColor(kpi.npsScore);
  const trendStr =
    kpi.deltaVsPrev === null
      ? "—"
      : kpi.deltaVsPrev > 0
        ? `▲ +${kpi.deltaVsPrev} vs 上期`
        : kpi.deltaVsPrev < 0
          ? `▼ ${kpi.deltaVsPrev} vs 上期`
          : `— 持平 vs 上期`;
  const trendColor =
    kpi.deltaVsPrev === null
      ? "#9A9890"
      : kpi.deltaVsPrev > 0
        ? "#3B6D11"
        : kpi.deltaVsPrev < 0
          ? "#CC0000"
          : "#9A9890";

  // 分段比例
  const segs: Array<{
    key: "promoter" | "passive" | "detractor";
    pct: number;
    n: number;
    label: string;
    sub: string;
  }> = [
    {
      key: "promoter",
      pct: kpi.promoterPct,
      n: kpi.promoter,
      label: "推薦者",
      sub: "9–10 分",
    },
    {
      key: "passive",
      pct: kpi.passivePct,
      n: kpi.passive,
      label: "被動者",
      sub: "7–8 分",
    },
    {
      key: "detractor",
      pct: kpi.detractorPct,
      n: kpi.detractor,
      label: "批評者",
      sub: "0–6 分",
    },
  ];

  return (
    <section
      className={`bg-white border border-[#EEECE6] rounded-lg p-4 ${pending ? "opacity-60" : ""}`}
      data-testid="nps-hero"
    >
      <div className="flex items-stretch gap-4 flex-wrap">
        {/* 左：NPS 分數 */}
        <div className="flex flex-col justify-center min-w-[140px]">
          <div className="text-[11px] text-[#9A9890]">本期 NPS 分數</div>
          <div
            className="text-[52px] font-bold leading-none font-mono"
            style={{ color: npsBadge.fg }}
            data-testid="nps-kpi-score"
          >
            {kpi.npsScore > 0 ? `+${kpi.npsScore}` : kpi.npsScore}
          </div>
          <div className="text-[11px] text-[#9A9890] mt-1">
            滿分 +100 · 平均分 {kpi.avgScore.toFixed(1)}
          </div>
          <div
            className="text-[12px] font-medium mt-1"
            style={{ color: trendColor }}
          >
            {trendStr}
          </div>
        </div>

        <div className="w-px self-stretch bg-[#EEECE6]" />

        {/* 中：3 欄分段卡 */}
        <div className="flex-1 grid grid-cols-3 gap-2 min-w-[280px]">
          {segs.map((s) => {
            const badge = NPS_CATEGORY_BADGE[s.key];
            return (
              <div
                key={s.key}
                className="rounded-lg px-3 py-2 text-center"
                style={{ backgroundColor: badge.bg }}
              >
                <div
                  className="text-[24px] font-bold font-mono leading-tight"
                  style={{ color: badge.fg }}
                  data-testid={`nps-seg-${s.key}-n`}
                >
                  {s.n}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: badge.fg }}>
                  {s.label}（{s.sub}）
                </div>
                <div
                  className="text-[12px] font-semibold mt-0.5 font-mono"
                  style={{ color: badge.fg }}
                  data-testid={`nps-seg-${s.key}-pct`}
                >
                  {s.pct.toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-px self-stretch bg-[#EEECE6]" />

        {/* 右：分佈 stacked bar */}
        <div className="min-w-[200px] flex-1 flex flex-col justify-center">
          <div className="text-[11px] text-[#9A9890] mb-1.5">
            本期回答分佈
          </div>
          <div
            className="h-[14px] rounded-full overflow-hidden flex bg-[#F2F2F2]"
            data-testid="nps-stacked-bar"
          >
            <div
              style={{
                width: `${kpi.promoterPct}%`,
                backgroundColor: NPS_SEGMENT_COLOR.promoter,
              }}
              title={`推薦者 ${kpi.promoterPct}%`}
            />
            <div
              style={{
                width: `${kpi.passivePct}%`,
                backgroundColor: NPS_SEGMENT_COLOR.passive,
              }}
              title={`被動者 ${kpi.passivePct}%`}
            />
            <div
              style={{
                width: `${kpi.detractorPct}%`,
                backgroundColor: NPS_SEGMENT_COLOR.detractor,
              }}
              title={`批評者 ${kpi.detractorPct}%`}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10.5px] text-[#5A5955]">
            <span style={{ color: NPS_SEGMENT_COLOR.promoter }}>
              推 {kpi.promoterPct.toFixed(0)}%
            </span>
            <span style={{ color: NPS_SEGMENT_COLOR.passive }}>
              被 {kpi.passivePct.toFixed(0)}%
            </span>
            <span style={{ color: NPS_SEGMENT_COLOR.detractor }}>
              批 {kpi.detractorPct.toFixed(0)}%
            </span>
          </div>
          <div className="text-[11px] text-[#9A9890] mt-2">
            有效回答 <b className="text-[#2C2C2A]">{kpi.total}</b> 份 · {rangeLabel}
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionCard({
  title,
  sub,
  badge,
  children,
}: {
  title: string;
  sub?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
          {sub ? <span className="text-[11px] text-[#9A9890]">{sub}</span> : null}
        </div>
        {badge}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function TrendChart({ trend }: { trend: NpsTrendPoint[] }) {
  if (trend.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無資料</div>
    );
  }
  // 找最後一個點，做 highlight（紅色加大）
  const lastIdx = trend.length - 1;
  return (
    <div data-testid="nps-trend-chart" style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={trend}
          margin={{ top: 18, right: 12, bottom: 4, left: -10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#EEECE6" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#5A5955" }}
            tickLine={false}
            axisLine={{ stroke: "#D5D3CB" }}
          />
          <YAxis
            domain={[-100, 100]}
            ticks={[-100, -50, 0, 50, 100]}
            tick={{ fontSize: 10, fill: "#9A9890" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #EEECE6",
            }}
          />
          <ReferenceLine y={0} stroke="#9A9890" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="npsScore"
            stroke="#1A3A5C"
            strokeWidth={2.5}
            dot={(props) => {
              const { cx, cy, index, payload } = props as {
                cx: number;
                cy: number;
                index: number;
                payload: NpsTrendPoint;
              };
              const isLast = index === lastIdx;
              const c = npsColor(payload.npsScore).fg;
              return (
                <g key={`dot-${payload.bucket}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isLast ? 5 : 3.5}
                    fill={isLast ? "#CC0000" : c}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  <text
                    x={cx}
                    y={cy - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={isLast ? 700 : 500}
                    fill={isLast ? "#CC0000" : c}
                  >
                    {payload.npsScore > 0 ? `+${payload.npsScore}` : payload.npsScore}
                  </text>
                </g>
              );
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SaCardGrid({ cards }: { cards: NpsSaCard[] }) {
  if (cards.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-3 text-center">
        尚無個人資料
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      data-testid="nps-sa-grid"
    >
      {cards.map((c) => {
        const npsBadge = npsColor(c.npsScore);
        return (
          <div
            key={c.name}
            className="bg-[#FAFAF8] border border-[#EEECE6] rounded-lg p-3"
            data-testid={`nps-sa-card-${c.name}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[12.5px] font-semibold text-[#2C2C2A]">
                {c.name}
              </span>
              {c.badge === "top" ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#EAF3DE] text-[#3B6D11]">
                  ⭐ 最高
                </span>
              ) : c.badge === "attention" ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#FDF3E3] text-[#854F0B]">
                  ⚠️ 待改善
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[22px] font-bold font-mono leading-tight"
                style={{ color: npsBadge.fg }}
              >
                {c.avgScore.toFixed(1)}
              </span>
              <div className="flex-1 h-[8px] bg-[#EEECE6] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, c.avgScore * 10)}%`,
                    backgroundColor: npsBadge.fg,
                  }}
                />
              </div>
            </div>
            <div className="text-[11px] text-[#5A5955] flex gap-2 flex-wrap">
              <span>{c.total} 筆回答</span>
              <span style={{ color: NPS_SEGMENT_COLOR.promoter }}>
                推薦 {c.promoterPct.toFixed(0)}%
              </span>
              {c.detractorPct > 0 ? (
                <span style={{ color: NPS_SEGMENT_COLOR.detractor }}>
                  批評 {c.detractorPct.toFixed(0)}%
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AspectGrid({ aspects }: { aspects: NpsAspectRow[] }) {
  if (aspects.length === 0 || aspects.every((a) => a.avg === 0)) {
    return (
      <div className="text-[12px] text-[#9A9890] py-3 text-center">
        本期尚無面向評分資料
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="nps-aspect-grid">
      {aspects.map((a) => {
        const color = aspectColor(a.avg);
        const fillPct = Math.min(100, a.avg * 10);
        const deltaStr =
          a.delta === null
            ? "—"
            : a.delta > 0
              ? `▲ +${a.delta.toFixed(1)}`
              : a.delta < 0
                ? `▼ ${a.delta.toFixed(1)}`
                : "— 持平";
        const deltaColor =
          a.delta === null
            ? "#9A9890"
            : a.delta > 0
              ? "#3B6D11"
              : a.delta < 0
                ? "#CC0000"
                : "#9A9890";
        return (
          <div
            key={a.key}
            className="bg-[#FAFAF8] border border-[#EEECE6] rounded-lg p-3"
            data-testid={`nps-aspect-${a.key}`}
          >
            <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1.5">
              {a.label}
            </div>
            <div className="h-[8px] bg-[#EEECE6] rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${fillPct}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span
                className="text-[12px] font-bold font-mono"
                style={{ color }}
              >
                {a.avg.toFixed(1)} / 10
              </span>
              <span
                className="text-[11px] font-semibold"
                style={{ color: deltaColor }}
              >
                {deltaStr}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupTable({
  rows,
  emptyMsg,
  testid,
}: {
  rows: SalesNpsDashboard["byStore"];
  emptyMsg: string;
  testid: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-3 text-center">{emptyMsg}</div>
    );
  }
  return (
    <table className="w-full text-[12px]" data-testid={testid}>
      <thead>
        <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
          <th className="text-left font-medium py-1.5 pr-2">名稱</th>
          <th className="text-right font-medium py-1.5 px-2">回應數</th>
          <th className="text-right font-medium py-1.5 px-2">推薦</th>
          <th className="text-right font-medium py-1.5 px-2">中立</th>
          <th className="text-right font-medium py-1.5 px-2">批評</th>
          <th className="text-right font-medium py-1.5 pl-2">NPS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const c = npsColor(r.npsScore);
          return (
            <tr key={r.key} className="border-b last:border-b-0 border-[#F4F2EC]">
              <td className="py-1.5 pr-2 text-[#2C2C2A]">{r.label}</td>
              <td className="py-1.5 px-2 text-right text-[#5A5955] font-mono">
                {r.total}
              </td>
              <td
                className="py-1.5 px-2 text-right font-mono"
                style={{ color: NPS_SEGMENT_COLOR.promoter }}
              >
                {r.promoter}
              </td>
              <td
                className="py-1.5 px-2 text-right font-mono"
                style={{ color: NPS_SEGMENT_COLOR.passive }}
              >
                {r.passive}
              </td>
              <td
                className="py-1.5 px-2 text-right font-mono"
                style={{ color: NPS_SEGMENT_COLOR.detractor }}
              >
                {r.detractor}
              </td>
              <td className="py-1.5 pl-2 text-right">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold font-mono"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {r.npsScore}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DetractorList({
  rows,
  isAftersales,
}: {
  rows: NpsResponseRow[];
  isAftersales: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-3 text-center">
        🎉 期間內沒有批評者留言
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="nps-detractor-list">
      {rows.map((r) => {
        const badge = NPS_CATEGORY_BADGE.detractor;
        return (
          <li
            key={r.id}
            className="rounded-md p-3 bg-[#FEF6F5] border border-[#FCE6E4]"
            style={{
              // 左 4px 紅邊框（spec 要求）
              borderLeft: "4px solid #CC0000",
            }}
          >
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono"
                style={{ backgroundColor: badge.bg, color: badge.fg }}
              >
                {r.score} 分
              </span>
              <span className="text-[12px] text-[#2C2C2A] font-semibold">
                {r.customer_name ?? "—"}
              </span>
              <span className="text-[11px] text-[#9A9890]">
                {isAftersales ? "SA" : "RS"}：{r.sales_person ?? "—"}
                {r.service_type ? ` · ${r.service_type}` : ""}
                {r.store_name ? ` · ${r.store_name}` : ""}
              </span>
              <span className="text-[11px] text-[#9A9890] ml-auto">
                {fmtDate(r.responded_at)}
              </span>
            </div>
            {r.comment ? (
              <div className="text-[12.5px] text-[#2C2C2A] leading-relaxed font-semibold bg-white/60 rounded px-2.5 py-1.5">
                「{r.comment}」
              </div>
            ) : (
              <div className="text-[12px] text-[#9A9890] italic">（無留言）</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
