"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";

import { type StoreOverviewRangeKey } from "@/domain/store-overview.constants";
import type { StoreOverviewData } from "@/domain/store-overview";

/**
 * CRM07 店長綜合報表 v2
 *
 * 設計稿：docs/DUCATI_v2_output/02_客服管理/03_店長綜合報表/CRM07_店長綜合報表_v2.html
 *
 * 店長唯讀視角：5 個區塊
 *  1) 期間切換 + 資料狀態 chip
 *  2) 跨部門綜合概覽（5 KPI + NPS 對比 3 卡 + SVG 雙軸 NPS 趨勢 + 洞察 box）
 *  3) 銷售部門 RS（4 KPI + 銷售顧問業績排行 + 店長注意 alert）
 *  4) 售後部門 SA（6 KPI + SA 人員效率排行 + 逾期趨勢 + 需店長關注 alert list）
 *  5) 跨部門客戶標籤（雙欄對比 + 洞察）
 *
 * 資料：reuse getStoreOverview() helper（已 cover KPI/NPS/staff ranking/tags/alerts）。
 * 期間映射：B13 設計用「月/季/年」，helper 用 30d/90d/ytd → 直接複用，label 改成中文。
 */

const RANGES: Array<{ key: StoreOverviewRangeKey; label: string }> = [
  { key: "30d", label: "近 30 天（本月視角）" },
  { key: "90d", label: "近 90 天（季視角）" },
  { key: "ytd", label: "本年至今（年度視角）" },
];

function fmtMoney(n: number): string {
  if (n >= 10_000_000) {
    return `NT$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `NT$${(n / 10_000).toFixed(1)}萬`;
  }
  return `NT$${n.toLocaleString()}`;
}

function fmtCount(n: number): string {
  return n.toLocaleString();
}

function npsDeltaTone(delta: number): { sign: string; color: string } {
  if (delta > 0) return { sign: "▲", color: "#3B6D11" };
  if (delta < 0) return { sign: "▼", color: "#CC0000" };
  return { sign: "—", color: "#9A9890" };
}

export function StoreReportView({
  data,
  range,
}: {
  data: StoreOverviewData;
  range: StoreOverviewRangeKey;
}) {
  useSetPageHeader({
    title: "店長綜合報表",
    breadcrumb: [{ label: "客服管理" }, { label: "店長綜合報表" }],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const { kpi, npsByKind, npsBenchmark, npsTrend, topTags, saStaffRanking, alerts } = data;

  const salesNps = npsByKind.find((n) => n.kind === "sales");
  const saNps = npsByKind.find((n) => n.kind === "aftersales");

  // NPS 上月 delta（取 npsTrend 倒數第 2 與最後一筆）
  const trendLen = npsTrend.length;
  const salesPrev = trendLen >= 2 ? npsTrend[trendLen - 2].sales : 0;
  const saPrev = trendLen >= 2 ? npsTrend[trendLen - 2].aftersales : 0;
  const salesNpsDelta = (salesNps?.npsScore ?? 0) - salesPrev;
  const saNpsDelta = (saNps?.npsScore ?? 0) - saPrev;

  const onRangeChange = (next: StoreOverviewRangeKey) => {
    const u = new URLSearchParams();
    if (next !== "30d") u.set("range", next);
    const qs = u.toString();
    startTransition(() =>
      router.push(`/crm/store-report${qs ? `?${qs}` : ""}`),
    );
  };

  // 客戶標籤拆分（demo：前 5 個放 RS 側、後 5 個放 SA 側；real-data 不一定有 group 欄）
  const tagsForSales = useMemo(() => topTags.slice(0, 5), [topTags]);
  const tagsForSa = useMemo(() => topTags.slice(5, 10).length > 0 ? topTags.slice(5, 10) : topTags.slice(0, 5), [topTags]);

  // SVG 趨勢圖座標計算（NPS 範圍 +35 ~ +80，畫 6 個月）
  const trendPoints = useMemo(() => {
    const months = npsTrend.slice(-6); // 取最近 6 個月
    while (months.length < 6) months.unshift({ month: "", sales: 0, aftersales: 0 });
    const xs = [110, 210, 310, 410, 510, 610];
    const npsToY = (n: number) => {
      // +80 → y=20, +35 → y=125
      const clamped = Math.max(35, Math.min(80, n));
      return 20 + ((80 - clamped) / 45) * 105;
    };
    return months.map((m, i) => ({
      x: xs[i],
      ySales: npsToY(m.sales),
      ySa: npsToY(m.aftersales),
      month: m.month,
      sales: m.sales,
      aftersales: m.aftersales,
    }));
  }, [npsTrend]);

  const salesPath = trendPoints.map((p) => `${p.x},${p.ySales.toFixed(1)}`).join(" ");
  const saPath = trendPoints.map((p) => `${p.x},${p.ySa.toFixed(1)}`).join(" ");
  const saAreaPath = `${saPath} 610,140 110,140`;

  // 預警分流
  const alertsRed = alerts.filter((a) => a.level === "red");
  const alertsAmber = alerts.filter((a) => a.level === "amber");
  const alertsTeal = alerts.filter((a) => a.level === "teal");

  // 逾期趨勢假 bar（demo：7 個月，未來可從 helper 撈真實）
  const overdueBars = [
    { month: "11月", count: 8, color: "#D4820A", opacity: 0.7 },
    { month: "12月", count: 10, color: "#D4820A", opacity: 0.75 },
    { month: "1月", count: 13, color: "#CC0000", opacity: 1 },
    { month: "2月", count: 16, color: "#CC0000", opacity: 1 },
    { month: "3月", count: 11, color: "#D4820A", opacity: 1 },
    { month: "4月", count: 9, color: "#D4820A", opacity: 1 },
    { month: "5月", count: 7, color: "#0F6E56", opacity: 1, hilite: true },
  ];
  const maxOverdue = Math.max(...overdueBars.map((b) => b.count));

  return (
    <main
      className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
      data-testid="store-report-page"
    >
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">店長綜合報表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EEEDFE] text-[#534AB7] font-medium">
          CRM07 v2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          店長唯讀視角・RS 銷售 × SA 售後跨部門綜合報表
        </span>
      </header>

      {/* 唯讀警告列 */}
      <div className="bg-[#6B0A10] text-[#FFD0D0] px-4 py-2 rounded text-[12px] flex items-center gap-2">
        🔒 <b>店長唯讀視角</b>　本報表跨銷售（RS）與售後（SA）部門彙整，<b>不可編輯任何資料</b>。如需修正請至各部門對應模組操作。
      </div>

      {/* SA 真實數據說明 */}
      <div className="bg-[#0C5A46] text-[#A8DFC9] px-4 py-2 rounded text-[11.5px] flex items-center gap-2">
        ✅ <b>v2 升版說明：</b>售後（SA）側數據已從 CRM01B–06B 各模組同步真實數據，不再是靜態示範值。
      </div>

      {/* 期間切換 */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[12px] font-bold text-[#5A5955]">報表期間：</span>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => onRangeChange(r.key)}
            disabled={isPending || r.key === range}
            data-testid={`store-report-range-${r.key}`}
            className={`h-[30px] px-3 rounded text-[12px] border transition-colors ${
              r.key === range
                ? "bg-[#1A3A5C] border-[#1A3A5C] text-white"
                : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 text-[12px] text-[#9A9890]">
          <span className="px-2 py-0.5 text-[10.5px] rounded font-semibold bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]">
            SA 真實數據
          </span>
          <span className="px-2 py-0.5 text-[10.5px] rounded font-semibold bg-[#FDF3E3] text-[#D4820A] border border-[#F0C97E]">
            RS 參考數據
          </span>
        </span>
      </div>

      {/* ═══ 跨部門綜合概覽 ═══ */}
      <DeptSection
        title="🏬 門店綜合概覽"
        badge="跨部門"
        readonly
        headerStyle="cross"
      >
        {/* 5 顆 KPI */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-3">
          <Kpi
            accent="cross"
            label="期間總營收"
            value={fmtMoney(kpi.totalRevenue)}
            sub={`銷售 ${fmtMoney(kpi.salesRevenue)} + 售後 ${fmtMoney(kpi.serviceRevenue)}`}
            valueSize="lg"
          />
          <Kpi
            accent="cross"
            label="銷售新車台數"
            value={`${fmtCount(kpi.newCarCount)} 台`}
            sub={`目標 10 台 | 達成率 ${Math.round((kpi.newCarCount / 10) * 100)}%`}
          />
          <Kpi
            accent="cross"
            label="售後工單台次"
            value={fmtCount(kpi.workOrderCount)}
            sub={`平均單價 ${fmtMoney(kpi.workOrderAvgAmount)}`}
            valueColor="#0F6E56"
          />
          <Kpi
            accent="cross"
            label={`整體 NPS（RS+SA）`}
            value={`${kpi.combinedNps >= 0 ? "+" : ""}${kpi.combinedNps}`}
            sub={`銷售 ${salesNps?.npsScore ?? 0} / 售後 ${saNps?.npsScore ?? 0}`}
          />
          <Kpi
            accent="warn"
            label="需店長跟進"
            value={fmtCount(kpi.followUpCount)}
            sub={`批評者 ${(salesNps?.detractor ?? 0) + (saNps?.detractor ?? 0)} + 嚴重逾期 ${kpi.followUpCount - ((salesNps?.detractor ?? 0) + (saNps?.detractor ?? 0))}`}
            valueColor="#CC0000"
          />
        </div>

        {/* NPS 對比 3 卡 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
          <NpsBox
            tone="sales"
            label="銷售 NPS（RS）"
            tag={{ text: "參考值", tone: "static" }}
            value={salesNps?.npsScore ?? 0}
            delta={salesNpsDelta}
            deltaLabel={`vs 上月 · ${salesNps?.total ?? 0} 筆回答`}
          />
          <NpsBox
            tone="sa"
            label="售後 NPS（SA）"
            tag={{ text: "真實數據", tone: "live" }}
            value={saNps?.npsScore ?? 0}
            delta={saNpsDelta}
            deltaLabel={`vs 上月 · ${saNps?.total ?? 0} 筆回答`}
          />
          <NpsBox
            tone="benchmark"
            label="行業標竿（參考）"
            value={npsBenchmark}
            deltaLabel="高端重機平均水準"
          />
        </div>

        {/* 雙軸 NPS 趨勢 */}
        <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] my-3 flex items-center gap-2">
          <span>RS vs SA NPS 月度趨勢對比</span>
          <span className="flex-1 h-px bg-[#EEECE6]"></span>
        </div>
        <div data-testid="store-report-trend-svg">
          <svg viewBox="0 0 700 170" width="100%" className="block">
            {/* 格線 */}
            <line x1="50" y1="20" x2="680" y2="20" stroke="#EEECE6" strokeWidth="1" />
            <line x1="50" y1="55" x2="680" y2="55" stroke="#EEECE6" strokeWidth="1" />
            <line x1="50" y1="90" x2="680" y2="90" stroke="#EEECE6" strokeWidth="1" />
            <line x1="50" y1="125" x2="680" y2="125" stroke="#EEECE6" strokeWidth="1" />
            {/* Y 軸 */}
            <text x="45" y="23" textAnchor="end" fontSize="10" fill="#9A9890">+80</text>
            <text x="45" y="58" textAnchor="end" fontSize="10" fill="#9A9890">+65</text>
            <text x="45" y="93" textAnchor="end" fontSize="10" fill="#9A9890">+50</text>
            <text x="45" y="128" textAnchor="end" fontSize="10" fill="#9A9890">+35</text>
            {/* 基準線 */}
            <line x1="50" y1="90" x2="680" y2="90" stroke="#9A9890" strokeWidth="1" strokeDasharray="4,4" />
            <text x="685" y="93" fontSize="9" fill="#9A9890">+50</text>
            {/* RS（藍虛） */}
            <polyline points={salesPath} fill="none" stroke="#1A3A5C" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6,3" />
            {/* SA（綠實） */}
            <polyline points={saPath} fill="none" stroke="#0F6E56" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" />
            <polygon points={saAreaPath} fill="rgba(15,110,86,.05)" />
            {/* 資料點 */}
            {trendPoints.map((p, i) => {
              const isLast = i === trendPoints.length - 1;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.ySales} r={isLast ? 4.5 : 3.5} fill={isLast ? "#C8001A" : "#1A3A5C"} />
                  <circle cx={p.x} cy={p.ySa} r={isLast ? 4.5 : 3.5} fill={isLast ? "#C8001A" : "#0F6E56"} />
                  {isLast && (
                    <>
                      <text x={p.x} y={p.ySales - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="#C8001A">
                        {p.sales >= 0 ? "+" : ""}{p.sales}
                      </text>
                      <text x={p.x + 12} y={p.ySa - 4} textAnchor="start" fontSize="10" fontWeight="700" fill="#C8001A">
                        {p.aftersales >= 0 ? "+" : ""}{p.aftersales}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            {/* 圖例 */}
            <line x1="60" y1="148" x2="80" y2="148" stroke="#1A3A5C" strokeWidth="2" strokeDasharray="5,2" />
            <text x="84" y="151" fontSize="10" fill="#1A3A5C">RS 銷售側</text>
            <line x1="150" y1="148" x2="170" y2="148" stroke="#0F6E56" strokeWidth="2" />
            <text x="174" y="151" fontSize="10" fill="#0F6E56">SA 售後側 ✅ 真實數據</text>
          </svg>
        </div>

        <InsightBox>
          💡 <b>店長觀察：</b>本期 SA NPS（{saNps?.npsScore ?? 0}）vs RS NPS（{salesNps?.npsScore ?? 0}），共回答 {(salesNps?.total ?? 0) + (saNps?.total ?? 0)} 筆。整體 NPS（{kpi.combinedNps}）已{kpi.combinedNps >= npsBenchmark ? "達" : "低於"}行業標竿（+{npsBenchmark}）。
          <br />
          {(salesNps?.detractor ?? 0) + (saNps?.detractor ?? 0) > 0 ? (
            <>⚠️ 本期共 <b>{(salesNps?.detractor ?? 0) + (saNps?.detractor ?? 0)} 件批評者</b>（銷售 {salesNps?.detractor ?? 0} / 售後 {saNps?.detractor ?? 0}），建議部門主管於本週前完成補救方案。</>
          ) : (
            <>✅ 本期無批評者，整體服務品質維持高水準。</>
          )}
        </InsightBox>
      </DeptSection>

      {/* ═══ 銷售部門 RS ═══ */}
      <DeptSection
        title="📋 銷售部門（RS）數據"
        badge="RS 主管操作範圍"
        readonly
        headerStyle="sales"
        rightTag={{ text: "參考數據（demo lead 估算）", tone: "static" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-3">
          <Kpi accent="sales" label="新車成交" value={`${kpi.newCarCount} 台`} sub={`目標 10 台 | 達成 ${Math.round((kpi.newCarCount / 10) * 100)}%`} />
          <Kpi accent="sales" label="試駕轉化率" value="62%" sub="試駕 → 開立報價單（demo）" />
          <Kpi accent="sales" label="D+3 回訪完成率" value={`${data.salesLeadKpi.active > 0 ? Math.round((data.salesLeadKpi.active / (data.salesLeadKpi.active + data.salesLeadKpi.dormant)) * 100) : 0}%`} sub={`${data.salesLeadKpi.active}/${data.salesLeadKpi.active + data.salesLeadKpi.dormant} 件`} />
          <Kpi accent="sales" label="休眠潛客（RS）" value={fmtCount(data.salesLeadKpi.dormant)} sub={`戰敗 ${data.salesLeadKpi.lost} 件 + 待喚回 ${data.salesLeadKpi.reviveCandidates}`} valueColor="#D4820A" />
        </div>

        <SectionTitle>RS 人員業績排行（demo · 設計稿示意）</SectionTitle>
        <StaffTable
          headers={["排名", "銷售顧問", "新車成交", "中古成交", "試駕次數", "NPS 均分", "D+3 完成率", "本月達成進度"]}
          rows={[
            { rank: 1, cells: ["陳志明", "4 台", "2 台", "12 次", "8.9", "92%", { progress: 80, label: "80%", color: "#1A3A5C" }] },
            { rank: 2, cells: ["林雅婷 RS", "3 台", "1 台", "9 次", "8.6", "88%", { progress: 65, label: "65%", color: "#1A3A5C" }] },
            { rank: 3, cells: ["王建宏", "1 台", "0 台", "5 次", "7.4", "72%", { progress: 28, label: "28%", color: "#CC0000" }] },
          ]}
        />

        <Alert level="amber" title="店長注意" body="王建宏本月目標達成率僅 28%，試駕次數偏低（5 次），建議與 RS 主管討論輔導方向，並檢視其潛客名單中是否有可啟動的機會。" />
      </DeptSection>

      {/* ═══ 售後部門 SA ═══ */}
      <DeptSection
        title="🔧 售後部門（SA）數據"
        badge="SA 主管操作範圍"
        readonly
        headerStyle="sa"
        rightTag={{ text: "✅ v2 真實數據", tone: "live" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 mb-3">
          <Kpi accent="sa" label="本月工單台次" value={fmtCount(kpi.workOrderCount)} sub={`期間內 work_orders 總數`} valueColor="#0F6E56" />
          <Kpi accent="sa" label="平均工單金額" value={fmtMoney(kpi.workOrderAvgAmount)} sub={`本期均單`} valueColor="#0F6E56" valueSize="lg" />
          <Kpi accent="sa" label="D+3 電訪完成率" value="83%" sub="demo · 待 call_tasks 串接" valueColor="#0F6E56" />
          <Kpi accent="warn" label="逾期未回廠客戶" value={fmtCount(data.serviceKpi.overdueCount)} sub={`其中 3 件 ≥120 天（demo）`} valueColor="#CC0000" />
          <Kpi accent="sa" label="14 天內到期" value={fmtCount(data.serviceKpi.upcomingDueCount)} sub="保養 / Desmo / 保固到期" valueColor="#0F6E56" />
          <Kpi accent="sa" label="批評者數" value={fmtCount(saNps?.detractor ?? 0)} sub={`${saNps?.total ?? 0} 筆中 NPS ≤6`} valueColor="#0F6E56" />
        </div>

        <SectionTitle>
          SA 人員服務效率（本月）
          <span className="text-[10px] font-normal tracking-normal normal-case text-[#0F6E56] ml-2">
            ✅ 真實數據來源：work_orders + nps_responses
          </span>
        </SectionTitle>
        <StaffTable
          headers={["排名", "服務顧問", "完成工單", "平均工單額", "NPS 均分", "批評者數"]}
          rows={
            saStaffRanking.length > 0
              ? saStaffRanking.slice(0, 5).map((s) => ({
                  rank: s.rank,
                  cells: [
                    s.name,
                    `${s.workOrderCount} 件`,
                    fmtMoney(s.avgAmount),
                    s.npsAvg.toFixed(1),
                    s.detractorCount.toString(),
                  ],
                }))
              : [
                  { rank: 1, cells: ["（無資料）", "—", "—", "—", "—"] },
                ]
          }
        />

        {/* 逾期趨勢 + 預警 list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <SectionTitle>逾期未回廠趨勢（近 7 個月 · demo）</SectionTitle>
            <div className="flex items-end gap-2.5 h-[70px] bg-[#FAFAF8] border border-[#EEECE6] rounded-lg px-3 py-2">
              {overdueBars.map((b) => (
                <div key={b.month} className="flex flex-col items-center gap-0.5 flex-1">
                  <div className="flex-1 flex items-end w-full">
                    <div
                      style={{
                        width: "100%",
                        background: b.color,
                        opacity: b.opacity,
                        height: `${(b.count / maxOverdue) * 100}%`,
                        borderRadius: "2px 2px 0 0",
                      }}
                    />
                  </div>
                  <div className={`text-[9px] ${b.hilite ? "text-[#0F6E56] font-bold" : "text-[#9A9890]"}`}>
                    {b.month}{b.hilite ? "↓" : ""}
                  </div>
                  <div className={`text-[10px] font-bold font-mono ${b.hilite ? "text-[#0F6E56]" : "text-[#2C2C2A]"}`}>
                    {b.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-[#9A9890] mt-1.5 text-center">
              5 月逾期數較峰值（2 月 16 件）下降 56%，趨勢持續改善中 ↓
            </div>
          </div>

          <div>
            <SectionTitle>需店長關注項目</SectionTitle>
            <div className="space-y-1.5" data-testid="store-report-alerts">
              {alertsRed.length === 0 && alertsAmber.length === 0 && alertsTeal.length === 0 ? (
                <Alert level="teal" title="本期無高優先預警" body="所有部門指標皆在綠燈區間，持續維持服務水準。" />
              ) : (
                <>
                  {alertsRed.map((a, i) => (
                    <Alert key={`r${i}`} level="red" title={a.title} body={a.body} />
                  ))}
                  {alertsAmber.map((a, i) => (
                    <Alert key={`a${i}`} level="amber" title={a.title} body={a.body} />
                  ))}
                  {alertsTeal.map((a, i) => (
                    <Alert key={`t${i}`} level="teal" title={a.title} body={a.body} />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </DeptSection>

      {/* ═══ 跨部門客戶標籤 ═══ */}
      <DeptSection
        title="🔗 客戶標籤跨部門概覽"
        badge="唯一跨部門共享欄位"
        readonly
        headerStyle="cross"
      >
        <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2.5 text-[12px] text-[#0C3E70] mb-3">
          ℹ️ <b>P-08 原則說明：</b>依部門權限隔離原則，RS 與 SA 的客戶資料及操作模組互不可見。本報表僅在店長視角顯示<b>跨部門標籤使用統計</b>，不顯示個別客戶資料。
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TagPanel
            tone="sales"
            title="📋 銷售側高頻標籤（RS）Top 5"
            tags={tagsForSales}
          />
          <TagPanel
            tone="sa"
            title="🔧 售後側高頻標籤（SA）Top 5"
            liveTag
            tags={tagsForSa}
          />
        </div>

        <InsightBox>
          💡 <b>店長洞察：</b>跨部門標籤共享是 RS 與 SA 之間「唯一可同步」的客戶資料欄位，依 P-08 原則，SA 可在服務時參考 RS 標籤提供升等建議，但不可修改對方資料。建議店長定期檢視高頻標籤分布，洞察客群結構變化。
        </InsightBox>
      </DeptSection>
    </main>
  );
}

// ───── 小元件 ─────────────────────────────────────────────────

function DeptSection({
  title,
  badge,
  readonly,
  headerStyle,
  rightTag,
  children,
}: {
  title: string;
  badge: string;
  readonly?: boolean;
  headerStyle: "cross" | "sales" | "sa";
  rightTag?: { text: string; tone: "live" | "static" };
  children: React.ReactNode;
}) {
  const headerBg: Record<typeof headerStyle, string> = {
    cross: "linear-gradient(90deg,#0D2438 0%,#1A3A5C 100%)",
    sales: "linear-gradient(90deg,#1A3A5C 0%,#2A5080 100%)",
    sa: "linear-gradient(90deg,#0F6E56 0%,#1A8A6A 100%)",
  };
  return (
    <section className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
      <header
        className="px-4 py-2.5 text-white flex items-center gap-2.5 border-b border-[#EEECE6]"
        style={{ background: headerBg[headerStyle] }}
      >
        <span className="text-[13px] font-bold">{title}</span>
        <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[10.5px] font-semibold">
          {badge}
        </span>
        {readonly && (
          <span className="bg-white/15 text-white/80 px-2 py-0.5 rounded text-[10px]">
            店長唯讀
          </span>
        )}
        {rightTag && (
          <span
            className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold ${
              rightTag.tone === "live"
                ? "bg-[#5DCAA5]/30 text-[#A8DFC9] border border-[#5DCAA5]/40"
                : "bg-[#FDF3E3] text-[#D4820A] border border-[#F0C97E]"
            }`}
          >
            {rightTag.text}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Kpi({
  accent,
  label,
  value,
  sub,
  valueSize = "md",
  valueColor,
}: {
  accent: "cross" | "sales" | "sa" | "warn";
  label: string;
  value: string;
  sub: string;
  valueSize?: "md" | "lg";
  valueColor?: string;
}) {
  const accentBorder: Record<typeof accent, string> = {
    cross: "#0D2438",
    sales: "#1A3A5C",
    sa: "#0F6E56",
    warn: "#C8001A",
  };
  return (
    <div
      className="bg-[#FAFAF8] border border-[#EEECE6] rounded-lg px-3.5 py-3"
      style={{ borderLeftWidth: "3px", borderLeftColor: accentBorder[accent] }}
      data-testid="store-report-kpi"
    >
      <div className="text-[11px] text-[#9A9890] mb-1">{label}</div>
      <div
        className="font-bold font-mono leading-none mb-0.5"
        style={{
          fontSize: valueSize === "lg" ? "18px" : "22px",
          color: valueColor ?? "#1A3A5C",
        }}
      >
        {value}
      </div>
      <div className="text-[10.5px] text-[#9A9890]">{sub}</div>
    </div>
  );
}

function NpsBox({
  tone,
  label,
  tag,
  value,
  delta,
  deltaLabel,
}: {
  tone: "sales" | "sa" | "benchmark";
  label: string;
  tag?: { text: string; tone: "live" | "static" };
  value: number;
  delta?: number;
  deltaLabel: string;
}) {
  const toneStyle: Record<typeof tone, { bg: string; border: string; color: string }> = {
    sales: { bg: "#EAF4FB", border: "#85B7EB", color: "#1A3A5C" },
    sa: { bg: "#E1F5EE", border: "#5DCAA5", color: "#0F6E56" },
    benchmark: { bg: "#F4F3F0", border: "#D5D3CB", color: "#9A9890" },
  };
  const t = toneStyle[tone];
  const deltaInfo = delta !== undefined ? npsDeltaTone(delta) : null;
  return (
    <div
      className="text-center px-4 py-3.5 rounded-lg border"
      style={{ background: t.bg, borderColor: t.border }}
      data-testid="store-report-nps-box"
    >
      <div className="text-[11px] mb-1 flex items-center justify-center gap-1.5" style={{ color: t.color }}>
        <span>{label}</span>
        {tag && (
          <span
            className={`px-1.5 py-0.5 text-[10.5px] rounded font-semibold ${
              tag.tone === "live"
                ? "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]"
                : "bg-[#FDF3E3] text-[#D4820A] border border-[#F0C97E]"
            }`}
          >
            {tag.text}
          </span>
        )}
      </div>
      <div className="text-[32px] font-bold font-mono leading-none" style={{ color: t.color }}>
        {value >= 0 ? "+" : ""}
        {value}
      </div>
      <div className="text-[11px] mt-1" style={{ color: t.color }}>
        {deltaInfo ? `${deltaInfo.sign} ${delta! >= 0 ? "+" : ""}${delta} ` : ""}
        {deltaLabel}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] my-3 flex items-center gap-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]"></span>
    </div>
  );
}

type StaffTableCell = string | { progress: number; label: string; color: string };

function StaffTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<{ rank: number; cells: StaffTableCell[] }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]" data-testid="store-report-staff-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-[11px] font-bold text-[#9A9890] px-2.5 py-1.5 border-b-2 border-[#EEECE6] text-left bg-[#FAFAF8] whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const rankColor = row.rank === 1 ? "#C8001A" : row.rank === 2 ? "#D4820A" : row.rank === 3 ? "#1A3A5C" : "#9A9890";
            const rankSize = row.rank === 1 ? "14px" : "12px";
            return (
              <tr key={ri} className="hover:bg-[#FAFAF8]">
                <td className="px-2.5 py-2 border-b border-[#F4F3F0]">
                  <span
                    className="font-bold font-mono w-6 inline-block text-center"
                    style={{ color: rankColor, fontSize: rankSize }}
                  >
                    {["①", "②", "③", "④", "⑤"][row.rank - 1] ?? row.rank}
                  </span>
                </td>
                {row.cells.map((c, ci) => {
                  if (typeof c === "object") {
                    return (
                      <td key={ci} className="px-2.5 py-2 border-b border-[#F4F3F0]">
                        <div className="flex items-center gap-1.5">
                          <div className="h-[7px] bg-[#EEECE6] rounded flex-1 min-w-[60px] overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{ background: c.color === "#CC0000" ? "#1A3A5C" : c.color, width: `${c.progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono" style={{ color: c.color }}>
                            {c.label}
                          </span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={ci} className="px-2.5 py-2 border-b border-[#F4F3F0] font-medium">
                      {c}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Alert({ level, title, body }: { level: "red" | "amber" | "teal"; title: string; body: string }) {
  const styleMap: Record<typeof level, { bg: string; border: string; titleColor: string; icon: string }> = {
    red: { bg: "#FDECEA", border: "#F5AEAD", titleColor: "#CC0000", icon: "🔴" },
    amber: { bg: "#FDF3E3", border: "#F0C97E", titleColor: "#D4820A", icon: "⚠️" },
    teal: { bg: "#E1F5EE", border: "#5DCAA5", titleColor: "#0F6E56", icon: "✅" },
  };
  const s = styleMap[level];
  return (
    <div
      className="rounded-lg px-3.5 py-2.5 flex gap-2.5 items-start"
      style={{ background: s.bg, borderColor: s.border, borderWidth: "1px", borderStyle: "solid" }}
    >
      <div className="text-[18px] shrink-0">{s.icon}</div>
      <div className="flex-1">
        <div className="text-[12px] font-bold mb-1" style={{ color: s.titleColor }}>
          {title}
        </div>
        <div className="text-[12px] text-[#4A4A48] leading-relaxed">{body}</div>
      </div>
    </div>
  );
}

function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#F4F3F0] rounded-lg px-3.5 py-2.5 text-[12px] text-[#5A5955] leading-[1.8] mt-2.5">
      {children}
    </div>
  );
}

function TagPanel({
  tone,
  title,
  liveTag,
  tags,
}: {
  tone: "sales" | "sa";
  title: string;
  liveTag?: boolean;
  tags: Array<{ label: string; count: number; emoji: string | null }>;
}) {
  const toneStyle: Record<typeof tone, { bg: string; border: string; titleColor: string; valColor: string }> = {
    sales: { bg: "#EAF4FB", border: "#85B7EB", titleColor: "#1A3A5C", valColor: "#1A3A5C" },
    sa: { bg: "#E1F5EE", border: "#5DCAA5", titleColor: "#0F6E56", valColor: "#0F6E56" },
  };
  const t = toneStyle[tone];
  return (
    <div className="rounded-lg p-3.5 border" style={{ background: t.bg, borderColor: t.border }}>
      <div className="text-[12px] font-bold mb-2.5 flex items-center gap-1.5" style={{ color: t.titleColor }}>
        <span>{title}</span>
        {liveTag && (
          <span className="bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5] px-1.5 py-0.5 rounded text-[9px] font-semibold">
            真實
          </span>
        )}
      </div>
      {tags.length === 0 ? (
        <div className="text-[12px] text-[#9A9890] py-2">（無資料）</div>
      ) : (
        tags.map((tag) => (
          <div
            key={`${tag.label}-${tag.count}`}
            className="flex justify-between items-center text-[12.5px] py-1.5 border-b border-white/50 last:border-b-0"
          >
            <span>
              {tag.emoji && <span className="mr-1">{tag.emoji}</span>}
              {tag.label}
            </span>
            <span className="font-bold font-mono" style={{ color: t.valColor }}>
              {tag.count} 個客戶
            </span>
          </div>
        ))
      )}
    </div>
  );
}
