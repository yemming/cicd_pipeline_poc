"use client";

/**
 * 業績報表 A 級 board（M01-2）
 *
 * 構成：
 *   1. Filter bar：period / SA / 車型 / 來源
 *   2. KPI 列（4 張 KpiCard）：銷售額 / 訂單數 / 平均單價 / 達標率
 *   3. 兩欄 grid：左 SA 排名 BarChart、右車型熱銷 DonutChart
 *   4. 客戶來源 ROI DonutChart（橫向 small panel）
 *   5. 銷售趨勢 LineChart（30 天）
 *   6. 訂單明細 DataGrid（自帶 Excel 匯出 / 欄位顯隱 / 排序）
 *
 * 三狀態：
 *   - pending：filter 切換時 useTransition + opacity-60 + pointer-events-none
 *   - error：boundary 由 page.tsx 處理（這層只渲染 data；若所有 list 都空就顯示 empty state）
 *   - empty：每個區塊獨立判斷、顯示「本期無資料」hint
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useMemo } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization";
import { BarChart, DonutChart, LineChart } from "@/components/charts";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  PERIOD_LABELS,
  ORDER_STATUS_CHIP,
  type ReportPeriod,
  type SalesReportKpis,
  type SalesConsultantRank,
  type ModelSalesRow,
  type LeadSourceRow,
  type DailyTrendPoint,
  type OrderDetailRow,
} from "@/domain/sales-report.constants";

// ─── 格式化工具 ───────────────────────────────────────────────
function fmtMoney(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(2)} 億`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 萬`;
  return n.toLocaleString();
}

function fmtDelta(curr: number, prev: number): { value: number; tone: "positive" | "negative" | "neutral" } {
  if (prev === 0 && curr === 0) return { value: 0, tone: "neutral" };
  if (prev === 0) return { value: 100, tone: "positive" };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return {
    value: pct,
    tone: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral",
  };
}

// ─── Board props ─────────────────────────────────────────────
export interface SalesReportBoardProps {
  kpis: SalesReportKpis;
  ranking: SalesConsultantRank[];
  models: ModelSalesRow[];
  sources: LeadSourceRow[];
  trend: DailyTrendPoint[];
  orders: OrderDetailRow[];
  options: {
    sas: string[];
    models: { id: string; name: string }[];
    sources: string[];
  };
  filters: {
    period: ReportPeriod;
    saName: string | null;
    modelId: string | null;
    source: string | null;
  };
  periodKey: string;
}

export default function SalesReportBoard({
  kpis,
  ranking,
  models,
  sources,
  trend,
  orders,
  options,
  filters,
  periodKey,
}: SalesReportBoardProps) {
  useSetPageHeader({
    title: "業績報表",
    breadcrumb: [{ label: "銷售管理" }, { label: "業績報表" }],
  });

  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setFilter = (key: "period" | "sa" | "model" | "source", value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    startTransition(() => {
      router.push(`?${next.toString()}`);
    });
  };

  // BarChart 資料（SA 排名 — 取前 8 名）
  const rankingChartData = useMemo(
    () =>
      ranking.slice(0, 8).map((r) => ({
        name: r.name.length > 6 ? `${r.name.slice(0, 6)}…` : r.name,
        本期: Math.round(r.revenue / 10000), // 萬
        上期: Math.round(r.revenuePrev / 10000),
        目標: Math.round((r.target || 0) / 10000),
      })),
    [ranking],
  );

  // DonutChart 資料（車型熱銷 — count 為值）
  const modelChartData = useMemo(
    () => models.slice(0, 6).map((m) => ({ name: m.modelName, value: m.count })),
    [models],
  );

  // DonutChart 資料（來源 ROI — revenue 為值）
  const sourceChartData = useMemo(
    () => sources.slice(0, 8).map((s) => ({ name: s.source, value: Math.round(s.revenue / 10000) })),
    [sources],
  );

  const totalSourceCount = sources.reduce((s, x) => s + x.orders, 0);
  const totalModelCount = models.reduce((s, m) => s + m.count, 0);

  // DataGrid columns
  const columns: DataGridColumn<OrderDetailRow>[] = useMemo(
    () => [
      {
        id: "order_no",
        header: "訂單編號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C]">{r.order_no}</span>
        ),
        exportValue: (r) => r.order_no,
        sortValue: (r) => r.order_no,
      },
      {
        id: "signed_at",
        header: "成交日",
        width: 110,
        cell: (r) => (r.signed_at ? r.signed_at.slice(0, 10) : "—"),
        exportValue: (r) => (r.signed_at ? r.signed_at.slice(0, 10) : ""),
        sortValue: (r) => r.signed_at ?? "",
      },
      {
        id: "rs_name",
        header: "RS",
        width: 100,
        cell: (r) => r.rs_name ?? "—",
        exportValue: (r) => r.rs_name ?? "",
        sortValue: (r) => r.rs_name ?? "",
      },
      {
        id: "customer_name",
        header: "客戶",
        width: 140,
        cell: (r) => r.customer_name ?? "—",
        exportValue: (r) => r.customer_name ?? "",
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle_model_name",
        header: "車型",
        width: 180,
        cell: (r) => r.vehicle_model_name ?? "—",
        exportValue: (r) => r.vehicle_model_name ?? "",
        sortValue: (r) => r.vehicle_model_name ?? "",
      },
      {
        id: "lead_source",
        header: "客戶來源",
        width: 140,
        cell: (r) => {
          if (!r.lead_source) return <span className="text-[#9A9890]">—</span>;
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
              {r.lead_source}
            </span>
          );
        },
        exportValue: (r) => r.lead_source ?? "",
        sortValue: (r) => r.lead_source ?? "",
      },
      {
        id: "total_amount",
        header: "金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono font-semibold text-[#2C2C2A]">
            {r.total_amount != null ? `NT$ ${r.total_amount.toLocaleString()}` : "—"}
          </span>
        ),
        exportValue: (r) => r.total_amount ?? 0,
        sortValue: (r) => r.total_amount ?? 0,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => {
          const c = ORDER_STATUS_CHIP[r.status];
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${c.bg} ${c.text}`}
            >
              {c.label}
            </span>
          );
        },
        exportValue: (r) => ORDER_STATUS_CHIP[r.status]?.label ?? r.status,
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  // Empty 整體判斷（KPI 為 0 且所有 list 都空）
  const isEmpty =
    kpis.revenue === 0 && ranking.length === 0 && models.length === 0 && orders.length === 0;

  return (
    <main className="px-6 py-5 space-y-3" data-testid="sales-report-page">
      {/* ── Header ── */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">業績報表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {periodKey}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          當期 {PERIOD_LABELS[filters.period]}・銷售額 / 訂單數 / 達標率 / SA 排名 / 車型熱銷 / 來源 ROI
        </span>
      </header>

      {/* ── Filter Bar ── */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">期間</label>
            <div className="flex border border-[#D5D3CB] rounded overflow-hidden">
              {(["month", "quarter", "year"] as const).map((p, idx, arr) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilter("period", p === "month" ? null : p)}
                  className={`h-[30px] px-3.5 text-[12.5px] cursor-pointer whitespace-nowrap ${
                    idx < arr.length - 1 ? "border-r border-[#D5D3CB]" : ""
                  } ${
                    filters.period === p
                      ? "bg-[#1A3A5C] text-white font-semibold"
                      : "bg-white text-[#5A5955] hover:bg-[#F4F3F0]"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">銷售顧問</label>
            <select
              value={filters.saName ?? ""}
              onChange={(e) => setFilter("sa", e.target.value || null)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {options.sas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">車型</label>
            <select
              value={filters.modelId ?? ""}
              onChange={(e) => setFilter("model", e.target.value || null)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {options.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">客戶來源</label>
            <select
              value={filters.source ?? ""}
              onChange={(e) => setFilter("source", e.target.value || null)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {options.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                startTransition(() => router.push("?"));
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
        {isPending ? (
          <div className="mt-2 text-[11px] text-[#185FA5]">查詢中⋯</div>
        ) : null}
      </section>

      {/* ── Empty State（全空時）── */}
      {isEmpty ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center">
          <div className="text-[40px] mb-2">📊</div>
          <div className="text-[14px] font-semibold text-[#2C2C2A] mb-1">本期暫無業績資料</div>
          <div className="text-[12px] text-[#9A9890]">
            目前篩選條件下沒有任何成交訂單。請調整期間或過濾條件再試。
          </div>
        </section>
      ) : null}

      {/* ── Layer 1：KPI ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard
          label="本期銷售額"
          value={fmtMoney(kpis.revenue)}
          delta={fmtDelta(kpis.revenue, kpis.revenuePrev)}
          tone="teal"
          layout="vertical"
          icon={<span>💰</span>}
        />
        <KpiCard
          label="本期訂單數"
          value={`${kpis.orderCount} 筆`}
          delta={fmtDelta(kpis.orderCount, kpis.orderCountPrev)}
          tone="blue"
          layout="vertical"
          icon={<span>🧾</span>}
        />
        <KpiCard
          label="平均單價"
          value={fmtMoney(kpis.avgPrice)}
          delta={fmtDelta(kpis.avgPrice, kpis.avgPricePrev)}
          tone="purple"
          layout="vertical"
          icon={<span>🏷️</span>}
        />
        <KpiCard
          label="月度目標達成率"
          value={`${kpis.targetRate}%`}
          delta={{
            value: Math.round(kpis.targetRate - 100),
            tone: kpis.targetRate >= 100 ? "positive" : kpis.targetRate >= 75 ? "neutral" : "negative",
          }}
          tone={kpis.targetRate >= 100 ? "green" : kpis.targetRate >= 75 ? "amber" : "red"}
          layout="vertical"
          icon={<span>🎯</span>}
        />
      </div>

      {/* ── Layer 2：兩欄 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* SA 個人業績排名 BarChart */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">SA 個人業績排名（萬）</span>
            <span className="text-[11px] text-[#9A9890]">本期 vs 上期 vs 目標</span>
          </header>
          <div className="p-4">
            {rankingChartData.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[#9A9890]">本期暫無 SA 銷售紀錄</div>
            ) : (
              <>
                <BarChart
                  data={rankingChartData}
                  categoryKey="name"
                  valueKey={[
                    { key: "本期", color: "#1A3A5C" },
                    { key: "上期", color: "#9CA3AF" },
                    { key: "目標", color: "#F59E0B" },
                  ]}
                  size="md"
                  showLegend
                  orientation="horizontal"
                />
                {/* Top 3 chip */}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {ranking.slice(0, 3).map((r, i) => {
                    const medal = ["🥇", "🥈", "🥉"][i];
                    const tone = i === 0 ? "bg-[#FEF3C7] text-[#854F0B]" : i === 1 ? "bg-[#F1EFE8] text-[#5A5955]" : "bg-[#FDECEA] text-[#854F0B]";
                    return (
                      <span key={r.name} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${tone}`}>
                        {medal} {r.name}・{fmtMoney(r.revenue)}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* 車型熱銷 DonutChart */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">車型熱銷度</span>
            <span className="text-[11px] text-[#9A9890]">共 {totalModelCount} 台</span>
          </header>
          <div className="p-4">
            {modelChartData.length === 0 ? (
              <div className="py-10 text-center text-[12px] text-[#9A9890]">本期暫無車型成交紀錄</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 items-center">
                <DonutChart
                  data={modelChartData}
                  size="md"
                  centerLabel={`${totalModelCount}`}
                  centerCaption="台"
                />
                <div className="space-y-1.5">
                  {models.slice(0, 6).map((m, i) => {
                    const colors = ["#1A3A5C", "#0F6E56", "#854F0B", "#C8001A", "#534AB7", "#185FA5"];
                    const pct = totalModelCount > 0 ? Math.round((m.count / totalModelCount) * 100) : 0;
                    return (
                      <div key={m.modelName} className="flex items-center justify-between gap-2 text-[12px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                          <span className="truncate text-[#2C2C2A]">{m.modelName}</span>
                        </div>
                        <span className="font-mono text-[#5A5955] shrink-0">{m.count} 台 ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── 客戶來源 ROI ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">客戶來源 ROI</span>
          <span className="text-[11px] text-[#9A9890]">共 {totalSourceCount} 筆訂單</span>
        </header>
        <div className="p-4">
          {sourceChartData.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[#9A9890]">本期暫無來源資料（lead_id 未串接）</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              <DonutChart
                data={sourceChartData}
                size="md"
                centerLabel={fmtMoney(sources.reduce((s, x) => s + x.revenue, 0))}
                centerCaption="總業績"
                showLegend={false}
              />
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {sources.map((s, i) => {
                  const colors = ["#1A3A5C", "#0F6E56", "#854F0B", "#C8001A", "#534AB7", "#185FA5", "#0F766E", "#B45309"];
                  return (
                    <div key={s.source} className="flex items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                        <span className="truncate text-[#2C2C2A]">{s.source}</span>
                      </div>
                      <span className="font-mono text-[#5A5955] shrink-0">
                        {s.orders} 筆・{fmtMoney(s.revenue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 銷售趨勢 LineChart ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">近 30 日銷售趨勢</span>
          <span className="text-[11px] text-[#9A9890]">每日成交筆數 & 金額（萬）</span>
        </header>
        <div className="p-4">
          {trend.every((p) => p.count === 0) ? (
            <div className="py-10 text-center text-[12px] text-[#9A9890]">近 30 日暫無成交資料</div>
          ) : (
            <LineChart
              data={trend.map((p) => ({
                date: p.date,
                筆數: p.count,
                金額: Math.round(p.revenue / 10000),
              }))}
              xKey="date"
              yKey={[
                { key: "筆數", color: "#1A3A5C" },
                { key: "金額", color: "#0F6E56" },
              ]}
              size="md"
              showLegend
              smooth
            />
          )}
        </div>
      </section>

      {/* ── 訂單明細 DataGrid ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">訂單明細</span>
          <span className="text-[11px] text-[#9A9890]">共 {orders.length} 筆・支援欄位顯隱 / 排序 / Excel 匯出</span>
        </header>
        <div className="p-3">
          <DataGrid<OrderDetailRow>
            columns={columns}
            data={orders}
            rowKey={(r) => r.id}
            persistKey="sales/manager/sales-report"
            exportFileName={`sales-report-${periodKey}`}
            emptyMessage="本期暫無訂單明細"
            disabled={isPending}
          />
        </div>
      </section>
    </main>
  );
}
