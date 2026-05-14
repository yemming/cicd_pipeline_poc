"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  NPS_CATEGORY_BADGE,
  RANGE_LABEL,
  type RangeKey,
} from "@/domain/sales-nps.constants";
import type {
  SalesNpsDashboard,
  NpsGroupRow,
  NpsTrendPoint,
  NpsResponseRow,
} from "@/domain/sales-nps";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const RANGES: RangeKey[] = ["7d", "30d", "90d", "all"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    return tz.toISOString().slice(0, 16).replace("T", " ");
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

export function NpsDashboardView({
  data,
  range,
  rangeLabel,
  basePath = "/sales/crm/nps-dashboard",
  title = "銷售 NPS 看板",
  sprintTag = "CRM05",
  caption = "銷售後客戶滿意度淨推薦值（NPS）分析・趨勢／分組／批評者留言",
}: {
  data: SalesNpsDashboard;
  range: RangeKey;
  rangeLabel: string;
  basePath?: string;
  title?: string;
  sprintTag?: string;
  caption?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onRangeChange = (next: RangeKey) => {
    const u = new URLSearchParams();
    if (next !== "90d") u.set("range", next);
    const qs = u.toString();
    startTransition(() =>
      router.push(`${basePath}${qs ? `?${qs}` : ""}`),
    );
  };

  const { kpi, trend, byStore, bySalesPerson, recentDetractors } = data;
  const npsBadge = npsColor(kpi.npsScore);

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
              className={`${inputClass} w-[110px]`}
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

      {/* KPI 卡 5 顆 */}
      <section
        className={`grid grid-cols-2 md:grid-cols-5 gap-2 ${isPending ? "opacity-60" : ""}`}
      >
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="text-[11px] text-[#9A9890]">NPS 分數</div>
          <div
            className="text-[24px] font-semibold leading-tight"
            style={{ color: npsBadge.fg }}
            data-testid="nps-kpi-score"
          >
            {kpi.npsScore}
          </div>
          <div
            className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded-md text-[10.5px] font-medium"
            style={{ backgroundColor: npsBadge.bg, color: npsBadge.fg }}
          >
            平均分 {kpi.avgScore.toFixed(1)}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="text-[11px] text-[#9A9890]">回應數</div>
          <div
            className="text-[24px] font-semibold leading-tight text-[#2C2C2A]"
            data-testid="nps-kpi-total"
          >
            {kpi.total}
          </div>
          <div className="text-[10.5px] text-[#9A9890] mt-1">{rangeLabel}</div>
        </div>
        <KpiCard
          label="推薦者%"
          value={`${kpi.promoterPct.toFixed(1)}%`}
          sub={`${kpi.promoter} 人 · 9–10 分`}
          badge={NPS_CATEGORY_BADGE.promoter}
          testid="nps-kpi-promoter"
        />
        <KpiCard
          label="中立者%"
          value={`${kpi.passivePct.toFixed(1)}%`}
          sub={`${kpi.passive} 人 · 7–8 分`}
          badge={NPS_CATEGORY_BADGE.passive}
          testid="nps-kpi-passive"
        />
        <KpiCard
          label="批評者%"
          value={`${kpi.detractorPct.toFixed(1)}%`}
          sub={`${kpi.detractor} 人 · 0–6 分`}
          badge={NPS_CATEGORY_BADGE.detractor}
          testid="nps-kpi-detractor"
        />
      </section>

      {/* 趨勢圖 */}
      <SectionCard title={`▼ 每週 NPS 趨勢（${rangeLabel}）`}>
        <TrendChart trend={trend} />
      </SectionCard>

      {/* 分組視圖：店 / 業務員 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="▼ 依門店">
          <GroupTable rows={byStore} emptyMsg="尚無門店資料" testid="nps-group-store" />
        </SectionCard>
        <SectionCard title="▼ 依業務員">
          <GroupTable
            rows={bySalesPerson}
            emptyMsg="尚無業務員資料"
            testid="nps-group-sales"
          />
        </SectionCard>
      </section>

      {/* 批評者留言 */}
      <SectionCard title="▼ 最近批評者留言（0–6 分）">
        <DetractorList rows={recentDetractors} />
      </SectionCard>
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  badge,
  testid,
}: {
  label: string;
  value: string;
  sub: string;
  badge: { bg: string; fg: string };
  testid: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className="text-[20px] font-semibold leading-tight"
        style={{ color: badge.fg }}
        data-testid={testid}
      >
        {value}
      </div>
      <div
        className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded-md text-[10.5px] font-medium"
        style={{ backgroundColor: badge.bg, color: badge.fg }}
      >
        {sub}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function TrendChart({ trend }: { trend: NpsTrendPoint[] }) {
  if (trend.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無資料</div>;
  }
  // 圖：每個 bucket 一條垂直 bar（高度 = npsScore 比例，含正負軸），下方標日期
  // npsScore 範圍 [-100, 100]；中軸 y=0
  const maxAbs = 100;
  const chartH = 140; // px
  const halfH = chartH / 2;
  return (
    <div data-testid="nps-trend-chart">
      <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: chartH + 32 }}>
        {trend.map((p) => {
          const ratio = Math.max(-1, Math.min(1, p.npsScore / maxAbs));
          const barH = Math.abs(ratio) * halfH;
          const isPos = p.npsScore >= 0;
          const color = npsColor(p.npsScore);
          return (
            <div
              key={p.bucket}
              className="flex flex-col items-center min-w-[44px]"
              title={`${p.bucket} · NPS ${p.npsScore} · ${p.total} 筆`}
            >
              <div
                className="relative w-full flex justify-center"
                style={{ height: chartH }}
              >
                {/* 上半（正值區） */}
                <div
                  className="absolute w-[20px] rounded-t"
                  style={{
                    bottom: halfH,
                    height: isPos ? barH : 0,
                    backgroundColor: color.fg,
                    opacity: 0.85,
                  }}
                />
                {/* 下半（負值區） */}
                <div
                  className="absolute w-[20px] rounded-b"
                  style={{
                    top: halfH,
                    height: !isPos ? barH : 0,
                    backgroundColor: color.fg,
                    opacity: 0.85,
                  }}
                />
                {/* 中軸線 */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-[#D5D3CB]"
                  style={{ top: halfH }}
                />
                {/* 數字 label */}
                <span
                  className="absolute text-[10px] font-medium"
                  style={{
                    bottom: isPos ? halfH + barH + 2 : undefined,
                    top: !isPos ? halfH + barH + 2 : undefined,
                    color: color.fg,
                  }}
                >
                  {p.npsScore}
                </span>
              </div>
              <div className="text-[10px] text-[#9A9890] mt-1 whitespace-nowrap">
                {p.bucket.slice(5)}
              </div>
              <div className="text-[10px] text-[#9A9890]">{p.total} 筆</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupTable({
  rows,
  emptyMsg,
  testid,
}: {
  rows: NpsGroupRow[];
  emptyMsg: string;
  testid: string;
}) {
  if (rows.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-3 text-center">{emptyMsg}</div>;
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
              <td className="py-1.5 px-2 text-right text-[#3B6D11] font-mono">
                {r.promoter}
              </td>
              <td className="py-1.5 px-2 text-right text-[#854F0B] font-mono">
                {r.passive}
              </td>
              <td className="py-1.5 px-2 text-right text-[#CC0000] font-mono">
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

function DetractorList({ rows }: { rows: NpsResponseRow[] }) {
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
            className="border border-[#FCE6E4] rounded-md p-2.5 bg-[#FEF6F5]"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold font-mono"
                style={{ backgroundColor: badge.bg, color: badge.fg }}
              >
                {r.score} 分
              </span>
              <span className="text-[12px] text-[#2C2C2A] font-medium">
                {r.customer_name ?? "—"}
              </span>
              <span className="text-[11px] text-[#9A9890]">
                {r.sales_person ?? "—"} · {r.store_name ?? "—"}
              </span>
              <span className="text-[11px] text-[#9A9890] ml-auto">
                {fmtDate(r.responded_at)} {fmtDateTime(r.responded_at).slice(-5)}
              </span>
            </div>
            {r.comment ? (
              <div className="mt-1.5 text-[12px] text-[#2C2C2A] leading-relaxed">
                {r.comment}
              </div>
            ) : (
              <div className="mt-1.5 text-[12px] text-[#9A9890] italic">
                （無留言）
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
