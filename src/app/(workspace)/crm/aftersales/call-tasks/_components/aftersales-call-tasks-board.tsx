"use client";

/**
 * 售後電訪工作台（CRM03B）A 級 wrapper
 *
 * 結構：
 *   1. 上方 InsightPanel — 售後維運洞察（NPS 7 日趨勢 SparkLine + call_type 分佈 Donut + 14 日完成率 Bar + NPS promoter/passive/detractor 拆解）
 *   2. 下方 sales 版 <CallTasksBoard> — 共用實作（KPI 卡 / 日期 / tab pills / 卡片）
 *
 * 不動 sales board；只在 aftersales 這側多疊一層視覺強化。
 */

import { BarChart, DonutChart, SparkLine } from "@/components/charts";
import { StatusDot } from "@/components/visualization";
import { CallTasksBoard } from "../../../sales/call-tasks/_components/call-tasks-board";
import type {
  AftersalesCallTaskInsights,
  AftersalesNpsAggregate,
} from "@/domain/sales-call-tasks";
import type {
  CallTaskBoardFilters,
  CallTaskBoardKpi,
  CallTaskBoardRow,
} from "@/domain/sales-call-tasks.constants";

type HistoryEntry = {
  date: string;
  result: string;
  note?: string;
  tone?: "teal" | "blue" | "amber" | "red" | "gray";
};

export function AftersalesCallTasksBoard({
  rows,
  kpi,
  byCallType,
  dateTotal,
  canEdit,
  filters,
  currentUserId,
  historyMap,
  basePath,
  rangeLabel,
  insights,
}: {
  rows: CallTaskBoardRow[];
  kpi: CallTaskBoardKpi;
  byCallType: Record<string, number>;
  dateTotal: number;
  canEdit: boolean;
  filters: CallTaskBoardFilters;
  currentUserId?: string | null;
  historyMap: Record<string, HistoryEntry[]>;
  basePath: string;
  rangeLabel?: string;
  insights: AftersalesCallTaskInsights;
}) {
  return (
    <>
      {/* 上方 — 售後維運洞察（A 級視覺強化區塊） */}
      <section
        className="px-6 pt-5"
        aria-label="售後維運洞察"
        data-testid="aftersales-call-tasks-insight"
      >
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#185FA5]">
              insights
            </span>
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              售後維運洞察
            </h2>
            <span className="text-[11px] text-[#9A9890]">
              本月聚合 · 過去 7 天 NPS 趨勢 · 過去 14 天完成率 · 過去 / 未來 30 天分佈
            </span>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3">
            {/* (1) NPS 月度拆解 + 7 日 SparkLine */}
            <InsightCardNps insights={insights} />

            {/* (2) 過去 14 天每日完成數 BarChart */}
            <InsightCardCompletion insights={insights} />

            {/* (3) call_type 分佈 DonutChart */}
            <InsightCardDistribution insights={insights} />
          </div>
        </div>
      </section>

      {/* 下方 — 共用實作 */}
      <CallTasksBoard
        rows={rows}
        kpi={kpi}
        byCallType={byCallType}
        dateTotal={dateTotal}
        canEdit={canEdit}
        filters={filters}
        currentUserId={currentUserId}
        historyMap={historyMap}
        basePath={basePath}
        rangeLabel={rangeLabel}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (1) NPS 月度拆解 + 7 日 SparkLine
// ──────────────────────────────────────────────────────────────────────────

function InsightCardNps({
  insights,
}: {
  insights: AftersalesCallTaskInsights;
}) {
  const { nps_trend_7d, nps_monthly } = insights;
  const trendValues = nps_trend_7d.map((d) => d.avg ?? 0);
  const hasTrend = nps_trend_7d.some((d) => d.avg != null);

  return (
    <article className="bg-white border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-[#185FA5]">
          sentiment_satisfied
        </span>
        <h3 className="text-[12.5px] font-semibold text-[#2C2C2A]">
          本月 NPS 拆解
        </h3>
        <span className="ml-auto text-[11px] text-[#9A9890]">
          {nps_monthly.total} 份回收
        </span>
      </header>

      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold text-[#185FA5] leading-none">
          {nps_monthly.avg != null ? nps_monthly.avg : "—"}
        </span>
        <span className="text-[11px] text-[#9A9890]">/10 月度均分</span>
        {nps_monthly.nps_score != null ? (
          <span
            className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
              nps_monthly.nps_score >= 50
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : nps_monthly.nps_score >= 0
                  ? "bg-[#FDF3E3] text-[#854F0B]"
                  : "bg-[#FDECEA] text-[#CC0000]"
            }`}
            title="標準 NPS 指數 = %推薦者 − %貶損者 (-100 ~ 100)"
          >
            NPS {nps_monthly.nps_score > 0 ? "+" : ""}
            {nps_monthly.nps_score}
          </span>
        ) : null}
      </div>

      <NpsStackedBar agg={nps_monthly} />

      <div className="flex items-center gap-3 text-[11px] text-[#5A5955] flex-wrap">
        <span className="inline-flex items-center gap-1">
          <StatusDot tone="green" size="sm" />
          推薦 {nps_monthly.promoter}
        </span>
        <span className="inline-flex items-center gap-1">
          <StatusDot tone="amber" size="sm" />
          中立 {nps_monthly.passive}
        </span>
        <span className="inline-flex items-center gap-1">
          <StatusDot tone="red" size="sm" />
          貶損 {nps_monthly.detractor}
        </span>
      </div>

      <div className="mt-1 border-t border-[#EEECE6] pt-2">
        <div className="flex items-center justify-between text-[11px] text-[#9A9890] mb-1">
          <span>過去 7 日 NPS 走勢</span>
          {hasTrend ? null : <span>本週尚無回收</span>}
        </div>
        {hasTrend ? (
          <SparkLine data={trendValues} tone="blue" height={28} />
        ) : (
          <div className="h-[28px] flex items-center text-[11px] text-[#9A9890]">
            —
          </div>
        )}
      </div>
    </article>
  );
}

function NpsStackedBar({ agg }: { agg: AftersalesNpsAggregate }) {
  const total = agg.total;
  if (total === 0) {
    return (
      <div className="h-[10px] rounded-full bg-[#F2F2F2]" aria-hidden />
    );
  }
  const promoterPct = (agg.promoter / total) * 100;
  const passivePct = (agg.passive / total) * 100;
  const detractorPct = (agg.detractor / total) * 100;
  return (
    <div
      className="h-[10px] rounded-full overflow-hidden flex bg-[#F2F2F2]"
      role="img"
      aria-label={`NPS 結構：推薦 ${agg.promoter}, 中立 ${agg.passive}, 貶損 ${agg.detractor}`}
    >
      <div
        style={{ width: `${promoterPct}%`, background: "#0F6E56" }}
        title={`推薦 ${agg.promoter}`}
      />
      <div
        style={{ width: `${passivePct}%`, background: "#D4820A" }}
        title={`中立 ${agg.passive}`}
      />
      <div
        style={{ width: `${detractorPct}%`, background: "#CC0000" }}
        title={`貶損 ${agg.detractor}`}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (2) 過去 14 天每日完成數 BarChart
// ──────────────────────────────────────────────────────────────────────────

function InsightCardCompletion({
  insights,
}: {
  insights: AftersalesCallTaskInsights;
}) {
  const data = insights.completion_14d.map((d) => ({
    day: d.date.slice(5), // MM-DD
    done: d.done,
    pending: Math.max(0, d.total - d.done),
  }));
  const totalDone = insights.completion_14d.reduce((a, b) => a + b.done, 0);
  const totalAll = insights.completion_14d.reduce((a, b) => a + b.total, 0);
  const rate = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
  const hasData = totalAll > 0;

  return (
    <article className="bg-white border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-[#0F6E56]">
          check_circle
        </span>
        <h3 className="text-[12.5px] font-semibold text-[#2C2C2A]">
          過去 14 天完成率
        </h3>
        <span className="ml-auto text-[11px] text-[#9A9890]">
          {totalDone}/{totalAll}
        </span>
      </header>

      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold text-[#0F6E56] leading-none">
          {rate}%
        </span>
        <span className="text-[11px] text-[#9A9890]">14 日完成率</span>
      </div>

      {hasData ? (
        <BarChart
          data={data}
          categoryKey="day"
          valueKey={[
            { key: "done", label: "完成", color: "#0F6E56" },
            { key: "pending", label: "未完成", color: "#EEECE6" },
          ]}
          stacked
          size="sm"
          showLegend={false}
        />
      ) : (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-[#9A9890] border border-dashed border-[#EEECE6] rounded">
          過去 14 天無排程任務
        </div>
      )}

      <p className="text-[11px] text-[#9A9890]">
        綠色 = 已完成；灰色 = 未完成（含 pending / in_progress / skipped）
      </p>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// (3) call_type 分佈 DonutChart
// ──────────────────────────────────────────────────────────────────────────

function InsightCardDistribution({
  insights,
}: {
  insights: AftersalesCallTaskInsights;
}) {
  const data = insights.call_type_distribution.map((d) => ({
    name: d.label,
    value: d.count,
  }));
  const total = data.reduce((a, b) => a + b.value, 0);
  const hasData = total > 0;
  const topType = insights.call_type_distribution[0];

  return (
    <article className="bg-white border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px] text-[#854F0B]">
          donut_large
        </span>
        <h3 className="text-[12.5px] font-semibold text-[#2C2C2A]">
          電訪類型分佈
        </h3>
        <span className="ml-auto text-[11px] text-[#9A9890]">±30 天</span>
      </header>

      {hasData ? (
        <div className="flex items-center gap-2">
          <div className="w-[120px] shrink-0">
            <DonutChart
              data={data}
              size="sm"
              showLegend={false}
              showTooltip
              centerLabel={`${total}`}
              centerCaption="件"
            />
          </div>
          <ul className="flex-1 min-w-0 space-y-1 text-[11.5px]">
            {insights.call_type_distribution.slice(0, 5).map((d, i) => {
              const colors = [
                "#1A3A5C",
                "#0F6E56",
                "#185FA5",
                "#854F0B",
                "#CC0000",
                "#534AB7",
              ];
              const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
              return (
                <li
                  key={d.call_type}
                  className="flex items-center gap-1.5 min-w-0"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: colors[i % colors.length] }}
                    aria-hidden
                  />
                  <span className="text-[#2C2C2A] truncate">{d.label}</span>
                  <span className="ml-auto text-[#5A5955] font-mono tabular-nums">
                    {d.count}
                  </span>
                  <span className="text-[#9A9890] w-9 text-right font-mono">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-[11px] text-[#9A9890] border border-dashed border-[#EEECE6] rounded">
          ±30 天內無排程任務
        </div>
      )}

      {topType ? (
        <p className="text-[11px] text-[#9A9890]">
          量最大：
          <b className="text-[#2C2C2A]">{topType.label}</b>（{topType.count}{" "}
          件，占{" "}
          {total > 0 ? Math.round((topType.count / total) * 100) : 0}%）
        </p>
      ) : null}
    </article>
  );
}
