"use client";

/**
 * /crm/aftersales/nps 看板（M02-7 — A 級升級）
 *
 * Spec：docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM05B_NPS看板_售後_v1.html
 *
 * 結構（由上到下）：
 *   1) Page header + filter（period / SA / service_type）
 *   2) KpiCard 列 — NPS 指數 / 平均分 / 樣本數 / 較上期變化
 *   3) 月度趨勢 LineChart（NPS 指數 + 三類數量）
 *   4) DonutChart（promoter / passive / detractor 比例）+ 各面向 AspectGrid
 *   5) BarChart：按 SA / 按 service_type
 *   6) DataGrid「需重點回訪」detractor list（含「建追蹤案」按鈕）
 *
 * 所有寫入互動依 CLAUDE.md UX 規範：pending 鎖 UI + 顯示進行式文字 + banner 回饋。
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { KpiCard } from "@/components/visualization";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import {
  NPS_CATEGORY_BADGE,
  NPS_SEGMENT_COLOR,
} from "@/domain/sales-nps.constants";
import {
  AFTERSALES_NPS_RANGE_LABEL,
  type AftersalesNpsRangeKey,
} from "@/domain/crm-aftersales-nps.constants";
import type {
  AftersalesNpsDashboard,
  AftersalesDetractorRow,
  AftersalesAspectRow,
} from "@/domain/crm-aftersales-nps";
import { escalateDetractorAction } from "@/lib/crm/aftersales-nps-actions";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5] disabled:opacity-60";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const RANGES: AftersalesNpsRangeKey[] = ["3m", "6m", "12m"];

/** NPS 分數色票：>50 綠 / 0-50 黃 / <0 紅 */
function npsColor(score: number): { bg: string; fg: string } {
  if (score >= 50) return { bg: "#EAF3DE", fg: "#3B6D11" };
  if (score >= 0) return { bg: "#FDF3E3", fg: "#854F0B" };
  return { bg: "#FDECEA", fg: "#CC0000" };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function AftersalesNpsBoard({
  data,
  range,
  sa,
  serviceType,
  canEscalate,
}: {
  data: AftersalesNpsDashboard;
  range: AftersalesNpsRangeKey;
  sa: string | null;
  serviceType: string | null;
  canEscalate: boolean;
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [escalateTarget, setEscalateTarget] =
    useState<AftersalesDetractorRow | null>(null);

  const pushFilters = (next: {
    range?: AftersalesNpsRangeKey;
    sa?: string | null;
    serviceType?: string | null;
  }) => {
    const u = new URLSearchParams();
    const r = next.range ?? range;
    if (r !== "6m") u.set("range", r);
    const s = next.sa === undefined ? sa : next.sa;
    if (s) u.set("sa", s);
    const st = next.serviceType === undefined ? serviceType : next.serviceType;
    if (st) u.set("service_type", st);
    const qs = u.toString();
    startNav(() => router.push(`/crm/aftersales/nps${qs ? `?${qs}` : ""}`));
  };

  const onReset = () => {
    if (range === "6m" && !sa && !serviceType) return;
    startNav(() => router.push("/crm/aftersales/nps"));
  };

  const showBanner = (b: { ok: boolean; msg: string }) => {
    setBanner(b);
    if (b.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  };

  const { kpi, trend, bySa, byService, aspects, detractors, saOptions, serviceTypeOptions } =
    data;

  // Donut 資料（用 NPS 三段色）
  const donutData = useMemo(
    () => [
      { name: "推薦者", value: kpi.promoter, color: NPS_SEGMENT_COLOR.promoter },
      { name: "中立者", value: kpi.passive, color: NPS_SEGMENT_COLOR.passive },
      { name: "批評者", value: kpi.detractor, color: NPS_SEGMENT_COLOR.detractor },
    ],
    [kpi.promoter, kpi.passive, kpi.detractor],
  );

  // SA bar：取 top 8 樣本數最多的；單條 nps_score，rainbow 區分
  const saBarData = useMemo(
    () =>
      bySa.slice(0, 8).map((g) => ({
        name: g.label,
        nps: g.npsScore,
        total: g.total,
      })),
    [bySa],
  );

  // Service type bar：依樣本數排序
  const serviceBarData = useMemo(
    () =>
      byService.map((g) => ({
        name: g.label,
        nps: g.npsScore,
        total: g.total,
      })),
    [byService],
  );

  const isEmpty = kpi.total === 0;
  const isPending = navPending;

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
    >
      {/* 1. Page header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">售後 NPS 看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          CRM05B
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維修滿意度淨推薦值（NPS）分析 · 月度趨勢 / SA 表現 / 服務類型 / 批評者追蹤
        </span>
      </header>

      {/* Filter bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>期間</label>
            <select
              value={range}
              onChange={(e) =>
                pushFilters({ range: e.target.value as AftersalesNpsRangeKey })
              }
              className={`${inputClass} w-[120px]`}
              data-testid="nps-range-select"
              disabled={isPending}
            >
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {AFTERSALES_NPS_RANGE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>SA</label>
            <select
              value={sa ?? ""}
              onChange={(e) => pushFilters({ sa: e.target.value || null })}
              className={`${inputClass} w-[140px]`}
              data-testid="nps-sa-select"
              disabled={isPending}
            >
              <option value="">全部</option>
              {saOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>服務類型</label>
            <select
              value={serviceType ?? ""}
              onChange={(e) => pushFilters({ serviceType: e.target.value || null })}
              className={`${inputClass} w-[140px]`}
              data-testid="nps-service-select"
              disabled={isPending}
            >
              <option value="">全部</option>
              {serviceTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onReset}
              disabled={isPending || (range === "6m" && !sa && !serviceType)}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {isEmpty ? (
        <EmptyState
          hasFilters={Boolean(sa || serviceType)}
          rangeLabel={AFTERSALES_NPS_RANGE_LABEL[range]}
          onReset={onReset}
        />
      ) : (
        <>
          {/* 2. KpiCard 列 */}
          <KpiRow kpi={kpi} rangeLabel={AFTERSALES_NPS_RANGE_LABEL[range]} />

          {/* 3. 月度趨勢 + Donut */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <SectionCard
                title="▼ NPS 月度趨勢"
                sub={AFTERSALES_NPS_RANGE_LABEL[range]}
              >
                {trend.every((p) => p.total === 0) ? (
                  <EmptyHint msg="本期無樣本可顯示趨勢" />
                ) : (
                  <LineChart
                    data={trend}
                    xKey="label"
                    yKey={[
                      { key: "npsScore", label: "NPS 指數", color: "#1A3A5C" },
                      {
                        key: "promoter",
                        label: "推薦者",
                        color: NPS_SEGMENT_COLOR.promoter,
                      },
                      {
                        key: "passive",
                        label: "中立者",
                        color: NPS_SEGMENT_COLOR.passive,
                      },
                      {
                        key: "detractor",
                        label: "批評者",
                        color: NPS_SEGMENT_COLOR.detractor,
                      },
                    ]}
                    size="md"
                    showLegend={true}
                    showDots={true}
                  />
                )}
              </SectionCard>
            </div>
            <SectionCard title="▼ 推薦／中立／批評 比例" sub={`共 ${kpi.total} 份`}>
              <DonutChart
                data={donutData}
                size="md"
                showLegend={true}
                centerLabel={
                  kpi.npsScore > 0 ? `+${kpi.npsScore}` : String(kpi.npsScore)
                }
                centerCaption="NPS 指數"
              />
              {/* 分群明細（純顯示，供金標 E2E 精確抓取；donut legend 不含數值） */}
              <div
                className="flex items-center justify-center gap-3 mt-2 text-[11px] text-[#5A5955]"
                data-testid="nps-seg-detail"
              >
                <span>
                  推薦者{" "}
                  <b data-testid="nps-seg-promoter-n" style={{ color: NPS_SEGMENT_COLOR.promoter }}>
                    {kpi.promoter}
                  </b>
                </span>
                <span>
                  中立者{" "}
                  <b data-testid="nps-seg-passive-n" style={{ color: NPS_SEGMENT_COLOR.passive }}>
                    {kpi.passive}
                  </b>
                </span>
                <span>
                  批評者{" "}
                  <b data-testid="nps-seg-detractor-n" style={{ color: NPS_SEGMENT_COLOR.detractor }}>
                    {kpi.detractor}
                  </b>
                </span>
              </div>
            </SectionCard>
          </section>

          {/* 4. SA / service_type 兩條 BarChart */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SectionCard
              title="▼ 各 SA NPS 指數"
              sub={`本期前 ${Math.min(8, bySa.length)} 名（依樣本數排序）`}
            >
              {saBarData.length === 0 ? (
                <EmptyHint msg="本期無 SA 樣本" />
              ) : (
                <>
                  <BarChart
                    data={saBarData}
                    categoryKey="name"
                    valueKey="nps"
                    tone="blue"
                    rainbow={true}
                    size="md"
                  />
                  <SaTable rows={bySa.slice(0, 8)} />
                </>
              )}
            </SectionCard>
            <SectionCard
              title="▼ 各服務類型 NPS 指數"
              sub="依服務類型分組比較"
            >
              {serviceBarData.length === 0 ? (
                <EmptyHint msg="本期無服務類型樣本" />
              ) : (
                <>
                  <BarChart
                    data={serviceBarData}
                    categoryKey="name"
                    valueKey="nps"
                    tone="teal"
                    rainbow={true}
                    size="md"
                  />
                  <ServiceTable rows={byService} />
                </>
              )}
            </SectionCard>
          </section>

          {/* 5. 各面向平均分（aspects） */}
          <SectionCard title="▼ 售後各面向平均分" sub="本期 vs 上期 delta（滿分 10）">
            <AspectGrid aspects={aspects} />
          </SectionCard>

          {/* 6. 需重點回訪 — Detractor DataGrid */}
          <SectionCard
            title="▼ 需重點回訪（批評者）"
            sub="評分 ≤ 6 分，須主管介入跟進"
            badge={
              detractors.length > 0 ? (
                <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FDECEA] text-[#CC0000]">
                  {detractors.length} 件 ・ 已升級 {kpi.escalatedCount} 件
                </span>
              ) : null
            }
            noPadding
          >
            <DetractorGrid
              rows={detractors}
              canEscalate={canEscalate}
              onEscalate={(row) => setEscalateTarget(row)}
            />
          </SectionCard>
        </>
      )}

      {/* Escalate modal */}
      {escalateTarget ? (
        <EscalateModal
          row={escalateTarget}
          onClose={() => setEscalateTarget(null)}
          onDone={(b) => {
            setEscalateTarget(null);
            showBanner(b);
            startNav(() => router.refresh());
          }}
        />
      ) : null}

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
          data-testid="nps-banner"
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

// ============================================================
// 子元件
// ============================================================

function SectionCard({
  title,
  sub,
  badge,
  children,
  noPadding,
}: {
  title: string;
  sub?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
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
      <div className={noPadding ? "" : "px-4 py-3"}>{children}</div>
    </section>
  );
}

function KpiRow({
  kpi,
  rangeLabel,
}: {
  kpi: AftersalesNpsDashboard["kpi"];
  rangeLabel: string;
}) {
  const npsTone =
    kpi.npsScore >= 50 ? "green" : kpi.npsScore >= 0 ? "amber" : "red";
  return (
    <section
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
      data-testid="nps-kpi-row"
    >
      <KpiCard
        label={`NPS 指數（${rangeLabel}）`}
        value={kpi.npsScore > 0 ? `+${kpi.npsScore}` : String(kpi.npsScore)}
        tone={npsTone}
        delta={
          kpi.deltaVsPrev !== null
            ? {
                value: kpi.deltaVsPrev,
                tone:
                  kpi.deltaVsPrev > 0
                    ? "positive"
                    : kpi.deltaVsPrev < 0
                      ? "negative"
                      : "neutral",
              }
            : undefined
        }
        layout="vertical"
      />
      <KpiCard
        label="平均分數（0–10）"
        value={kpi.avgScore.toFixed(1)}
        tone="blue"
        layout="vertical"
      />
      <KpiCard
        label="本期有效樣本"
        value={`${kpi.total} 份`}
        tone="teal"
        layout="vertical"
      />
      <KpiCard
        label="批評者待處理"
        value={
          kpi.detractor === 0
            ? "0"
            : `${kpi.detractor - kpi.escalatedCount} / ${kpi.detractor}`
        }
        tone="red"
        layout="vertical"
      />
    </section>
  );
}

function SaTable({
  rows,
}: {
  rows: AftersalesNpsDashboard["bySa"];
}) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-[11.5px] mt-2" data-testid="nps-sa-table">
      <thead>
        <tr className="border-b border-[#EEECE6] text-[10.5px] text-[#9A9890]">
          <th className="text-left font-medium py-1 pr-2">SA</th>
          <th className="text-right font-medium py-1 px-2">樣本</th>
          <th className="text-right font-medium py-1 px-2">平均</th>
          <th className="text-right font-medium py-1 pl-2">NPS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const c = npsColor(r.npsScore);
          return (
            <tr key={r.key} className="border-b last:border-b-0 border-[#F4F2EC]">
              <td className="py-1 pr-2 text-[#2C2C2A]">{r.label}</td>
              <td className="py-1 px-2 text-right text-[#5A5955] font-mono">
                {r.total}
              </td>
              <td className="py-1 px-2 text-right text-[#5A5955] font-mono">
                {r.avgScore.toFixed(1)}
              </td>
              <td className="py-1 pl-2 text-right">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold font-mono"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {r.npsScore > 0 ? `+${r.npsScore}` : r.npsScore}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ServiceTable({
  rows,
}: {
  rows: AftersalesNpsDashboard["byService"];
}) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-[11.5px] mt-2" data-testid="nps-service-table">
      <thead>
        <tr className="border-b border-[#EEECE6] text-[10.5px] text-[#9A9890]">
          <th className="text-left font-medium py-1 pr-2">服務類型</th>
          <th className="text-right font-medium py-1 px-2">樣本</th>
          <th className="text-right font-medium py-1 px-2">推薦</th>
          <th className="text-right font-medium py-1 px-2">批評</th>
          <th className="text-right font-medium py-1 pl-2">NPS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const c = npsColor(r.npsScore);
          return (
            <tr key={r.key} className="border-b last:border-b-0 border-[#F4F2EC]">
              <td className="py-1 pr-2 text-[#2C2C2A]">{r.label}</td>
              <td className="py-1 px-2 text-right text-[#5A5955] font-mono">
                {r.total}
              </td>
              <td
                className="py-1 px-2 text-right font-mono"
                style={{ color: NPS_SEGMENT_COLOR.promoter }}
              >
                {r.promoter}
              </td>
              <td
                className="py-1 px-2 text-right font-mono"
                style={{ color: NPS_SEGMENT_COLOR.detractor }}
              >
                {r.detractor}
              </td>
              <td className="py-1 pl-2 text-right">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold font-mono"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {r.npsScore > 0 ? `+${r.npsScore}` : r.npsScore}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AspectGrid({ aspects }: { aspects: AftersalesAspectRow[] }) {
  if (aspects.length === 0 || aspects.every((a) => a.avg === 0)) {
    return <EmptyHint msg="本期尚無面向評分資料" />;
  }
  const aspectColor = (avg: number): string => {
    if (avg >= 8.5) return "#0F6E56";
    if (avg >= 7.5) return "#185FA5";
    return "#854F0B";
  };
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
      data-testid="nps-aspect-grid"
    >
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
                : "持平";
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
                style={{ width: `${fillPct}%`, backgroundColor: color }}
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

function DetractorGrid({
  rows,
  canEscalate,
  onEscalate,
}: {
  rows: AftersalesDetractorRow[];
  canEscalate: boolean;
  onEscalate: (row: AftersalesDetractorRow) => void;
}) {
  const columns: DataGridColumn<AftersalesDetractorRow>[] = useMemo(
    () => [
      {
        id: "responded_at",
        header: "回覆日期",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {fmtDate(r.responded_at)}
          </span>
        ),
        exportValue: (r) => fmtDate(r.responded_at),
        sortValue: (r) => r.responded_at,
      },
      {
        id: "score",
        header: "評分",
        width: 70,
        align: "right",
        cell: (r) => {
          const badge = NPS_CATEGORY_BADGE.detractor;
          return (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono"
              style={{ backgroundColor: badge.bg, color: badge.fg }}
            >
              {r.score}
            </span>
          );
        },
        exportValue: (r) => r.score,
        sortValue: (r) => r.score,
      },
      {
        id: "customer",
        header: "客戶",
        width: 130,
        cell: (r) => (
          <span className="text-[12px] text-[#2C2C2A] font-semibold">
            {r.customer_name ?? "—"}
          </span>
        ),
        exportValue: (r) => r.customer_name ?? "",
      },
      {
        id: "sa",
        header: "SA",
        width: 90,
        cell: (r) => r.sa_name ?? "—",
        exportValue: (r) => r.sa_name ?? "",
      },
      {
        id: "service_type",
        header: "服務類型",
        width: 110,
        cell: (r) => (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
            {r.service_type_label}
          </span>
        ),
        exportValue: (r) => r.service_type_label,
      },
      {
        id: "store",
        header: "門店",
        width: 110,
        cell: (r) => r.store_name ?? "—",
        exportValue: (r) => r.store_name ?? "",
      },
      {
        id: "comment",
        header: "客戶留言摘要",
        cell: (r) =>
          r.comment ? (
            <span
              className="text-[12px] text-[#2C2C2A] line-clamp-2"
              title={r.comment}
            >
              「{r.comment}」
            </span>
          ) : (
            <span className="text-[11.5px] text-[#9A9890] italic">（無留言）</span>
          ),
        exportValue: (r) => r.comment ?? "",
        sortable: false,
      },
      {
        id: "escalated",
        header: "狀態",
        width: 100,
        cell: (r) =>
          r.escalated ? (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap"
              title={r.escalated_notes ?? ""}
            >
              已升級
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
              待處理
            </span>
          ),
        exportValue: (r) => (r.escalated ? "已升級" : "待處理"),
        sortValue: (r) => (r.escalated ? 1 : 0),
      },
    ],
    [],
  );

  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[12px] text-[#9A9890]">
        🎉 本期沒有批評者，太棒了
      </div>
    );
  }

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="crm/aftersales/nps/detractors"
      exportFileName="aftersales-nps-detractors"
      emptyMessage="本期無批評者"
      rowActionsWidth={140}
      rowActions={(r) => (
        <button
          onClick={() => onEscalate(r)}
          disabled={!canEscalate || r.escalated}
          title={
            !canEscalate
              ? "權限不足，無法建立追蹤"
              : r.escalated
                ? "此筆已升級主管介入"
                : "建立主管介入追蹤紀錄"
          }
          className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {r.escalated ? "已升級" : "建追蹤案"}
        </button>
      )}
    />
  );
}

function EscalateModal({
  row,
  onClose,
  onDone,
}: {
  row: AftersalesDetractorRow;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!notes.trim()) {
      setErr("請輸入升級說明");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const res = await escalateDetractorAction(row.id, notes);
    setSubmitting(false);
    if (res.ok) {
      onDone({ ok: true, msg: "✓ 已升級主管介入" });
    } else {
      setErr(res.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center px-4"
      role="dialog"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-[#EEECE6]">
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            建立主管介入追蹤
          </span>
          <span
            className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono"
            style={{
              backgroundColor: NPS_CATEGORY_BADGE.detractor.bg,
              color: NPS_CATEGORY_BADGE.detractor.fg,
            }}
          >
            {row.score} 分
          </span>
        </header>
        <div className="px-4 py-3 space-y-3">
          <div className="text-[12.5px] text-[#5A5955] space-y-1">
            <div>
              <span className="text-[#9A9890]">客戶：</span>
              <span className="text-[#2C2C2A] font-semibold">
                {row.customer_name ?? "—"}
              </span>
              <span className="text-[#9A9890] ml-3">SA：</span>
              <span className="text-[#2C2C2A]">{row.sa_name ?? "—"}</span>
            </div>
            <div>
              <span className="text-[#9A9890]">服務：</span>
              <span className="text-[#2C2C2A]">{row.service_type_label}</span>
              <span className="text-[#9A9890] ml-3">日期：</span>
              <span className="text-[#2C2C2A] font-mono">
                {fmtDate(row.responded_at)}
              </span>
            </div>
            {row.comment ? (
              <div className="bg-[#FAFAF8] border border-[#EEECE6] rounded p-2 text-[12px]">
                「{row.comment}」
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>
              升級說明（將寫入回覆 metadata.escalation）
              <span className="text-[#CC0000] ml-1">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={submitting}
              placeholder="說明為何要主管介入、後續預計動作…"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:border-[#185FA5] disabled:opacity-60"
              data-testid="nps-escalate-notes"
            />
          </div>
          {err ? (
            <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1">
              {err}
            </div>
          ) : null}
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting || !notes.trim()}
            data-testid="nps-escalate-submit"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {submitting ? "建立中⋯" : "建立追蹤"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function EmptyHint({ msg }: { msg: string }) {
  return (
    <div className="text-[12px] text-[#9A9890] py-6 text-center">{msg}</div>
  );
}

function EmptyState({
  hasFilters,
  rangeLabel,
  onReset,
}: {
  hasFilters: boolean;
  rangeLabel: string;
  onReset: () => void;
}) {
  return (
    <section
      className="bg-white border border-[#EEECE6] rounded-lg px-6 py-12 text-center"
      data-testid="nps-empty"
    >
      <div className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
        {rangeLabel}內沒有 NPS 回覆
      </div>
      <div className="text-[12px] text-[#9A9890] mb-3">
        {hasFilters
          ? "目前的篩選條件下沒有資料，可以放寬篩選或切換期間"
          : "等問卷工作站再多回覆幾筆就會有看板資料"}
      </div>
      {hasFilters ? (
        <button
          onClick={onReset}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          清除篩選
        </button>
      ) : null}
    </section>
  );
}
