"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  STORE_RANGE_LABEL,
  npsColor,
  deltaColor,
  type StoreOverviewRangeKey,
} from "@/domain/store-overview.constants";
import type {
  StoreOverviewData,
  NpsTrendBucket,
  TopTagRow,
  StaffRanking,
  StoreAlert,
  SalesLeadKpi,
  ServiceKpi,
  StoreKpi,
} from "@/domain/store-overview";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const RANGES: StoreOverviewRangeKey[] = ["30d", "90d", "ytd"];

function fmtMoney(n: number): string {
  if (n >= 10_000_000) {
    return `NT$${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `NT$${(n / 10_000).toFixed(1)}萬`;
  }
  return `NT$${n.toLocaleString()}`;
}

export function StoreOverviewView({
  data,
  range,
  basePath = "/dashboard/store-overview",
}: {
  data: StoreOverviewData;
  range: StoreOverviewRangeKey;
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onRangeChange = (next: StoreOverviewRangeKey) => {
    const u = new URLSearchParams();
    if (next !== "30d") u.set("range", next);
    const qs = u.toString();
    startTransition(() => router.push(`${basePath}${qs ? `?${qs}` : ""}`));
  };

  const { kpi, npsByKind, npsBenchmark, npsTrend, topTags, saStaffRanking, salesLeadKpi, serviceKpi, alerts } = data;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">門店綜合概覽</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          DASHBOARD
        </span>
        <span className="text-[12px] text-[#9A9890]">
          店長視角・銷售 RS × 售後 SA × 跨部門標籤 三合一儀表板
        </span>
        <div className="ml-auto flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>期間</label>
            <select
              value={range}
              onChange={(e) => onRangeChange(e.target.value as StoreOverviewRangeKey)}
              className={`${inputClass} w-[120px]`}
              data-testid="store-range-select"
              disabled={isPending}
            >
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {STORE_RANGE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 跨部門 KPI 區（5 顆） */}
      <SectionCard title="▼ 跨部門綜合 KPI" rightSlot={<ReadOnlyBadge />}>
        <div
          className={`grid grid-cols-2 md:grid-cols-5 gap-2 ${isPending ? "opacity-60" : ""}`}
        >
          <KpiCard
            label="期間總營收"
            value={fmtMoney(kpi.totalRevenue)}
            sub={`銷售 ${fmtMoney(kpi.salesRevenue)} + 售後 ${fmtMoney(kpi.serviceRevenue)}`}
            valueColor="#1A3A5C"
            testid="kpi-revenue"
            valueFontSize={18}
          />
          <KpiCard
            label="新車成交"
            value={String(kpi.newCarCount)}
            sub={`期間內轉換的 leads`}
            valueColor="#1A3A5C"
            testid="kpi-new-car"
          />
          <KpiCard
            label="售後工單台次"
            value={String(kpi.workOrderCount)}
            sub={`平均單金額 ${fmtMoney(kpi.workOrderAvgAmount)}`}
            valueColor="#0F6E56"
            testid="kpi-wo-count"
          />
          <KpiCard
            label="整體 NPS"
            value={String(kpi.combinedNps)}
            sub={`銷售 ${npsByKind[0].npsScore} / 售後 ${npsByKind[1].npsScore}`}
            valueColor={npsColor(kpi.combinedNps).fg}
            testid="kpi-combined-nps"
          />
          <KpiCard
            label="需店長跟進"
            value={String(kpi.followUpCount)}
            sub={`批評者 ${npsByKind[0].detractor + npsByKind[1].detractor} 件 + 逾期 ${serviceKpi.overdueCount} 件`}
            valueColor="#CC0000"
            testid="kpi-followup"
          />
        </div>
      </SectionCard>

      {/* NPS 對比卡（RS / SA / 標竿） */}
      <SectionCard title="▼ NPS 對比（銷售 vs 售後 vs 行業標竿）">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="nps-compare">
          <NpsCompareBox
            label="銷售 NPS（RS）"
            score={npsByKind[0].npsScore}
            sub={`${npsByKind[0].total} 筆回答`}
            theme={{ bg: "#EAF4FB", border: "#BBD2E8", fg: "#1A3A5C" }}
          />
          <NpsCompareBox
            label="售後 NPS（SA）"
            score={npsByKind[1].npsScore}
            sub={`${npsByKind[1].total} 筆回答`}
            theme={{ bg: "#E8F5F0", border: "#B6DCC9", fg: "#0F6E56" }}
          />
          <NpsCompareBox
            label="行業標竿（參考）"
            score={npsBenchmark}
            sub="高端重機平均水準"
            theme={{ bg: "#F4F3F0", border: "#D5D3CB", fg: "#5A5955" }}
          />
        </div>
      </SectionCard>

      {/* NPS 月度趨勢小圖（雙軸折線） */}
      <SectionCard title="▼ NPS 月度趨勢對比（近 6 個月）">
        <NpsTrendChart trend={npsTrend} benchmark={npsBenchmark} />
      </SectionCard>

      {/* 銷售 + 售後 部門 KPI（左右並列） */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="▼ 銷售部門（RS）" rightSlot={<DeptBadge text="RS 主管操作範圍" tone="navy" />}>
          <SalesLeadKpiPanel kpi={salesLeadKpi} kpiTop={kpi} />
        </SectionCard>
        <SectionCard title="▼ 售後部門（SA）" rightSlot={<DeptBadge text="SA 主管操作範圍" tone="teal" />}>
          <ServiceKpiPanel kpi={serviceKpi} />
        </SectionCard>
      </section>

      {/* SA 人員排行 */}
      <SectionCard title="▼ SA 人員服務效率（依工單台次）">
        <StaffRankingTable rows={saStaffRanking} />
      </SectionCard>

      {/* 客戶標籤 Top 5 + 預警清單 並列 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="▼ 跨部門客戶標籤 Top 5">
          <TopTagsList rows={topTags} />
        </SectionCard>
        <SectionCard title="▼ 需店長關注項目">
          <AlertList alerts={alerts} />
        </SectionCard>
      </section>
    </main>
  );
}

function ReadOnlyBadge() {
  return (
    <span className="px-1.5 py-0.5 text-[10.5px] rounded-md bg-[#F2F2F2] text-[#6B6A68] font-medium">
      唯讀
    </span>
  );
}

function DeptBadge({ text, tone }: { text: string; tone: "navy" | "teal" }) {
  const palette =
    tone === "navy"
      ? { bg: "#EAF4FB", fg: "#185FA5" }
      : { bg: "#E8F5F0", fg: "#0F6E56" };
  return (
    <span
      className="px-1.5 py-0.5 text-[10.5px] rounded-md font-medium"
      style={{ backgroundColor: palette.bg, color: palette.fg }}
    >
      {text}
    </span>
  );
}

function SectionCard({
  title,
  children,
  rightSlot,
}: {
  title: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
        {rightSlot ? <span className="ml-auto">{rightSlot}</span> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueColor,
  testid,
  valueFontSize,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
  testid: string;
  valueFontSize?: number;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className="font-semibold leading-tight"
        style={{ color: valueColor, fontSize: `${valueFontSize ?? 24}px` }}
        data-testid={testid}
      >
        {value}
      </div>
      <div className="text-[10.5px] text-[#9A9890] mt-1">{sub}</div>
    </div>
  );
}

function NpsCompareBox({
  label,
  score,
  sub,
  theme,
}: {
  label: string;
  score: number;
  sub: string;
  theme: { bg: string; border: string; fg: string };
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}` }}
    >
      <div className="text-[12px] font-medium" style={{ color: theme.fg }}>
        {label}
      </div>
      <div
        className="text-[28px] font-bold leading-tight mt-1"
        style={{ color: theme.fg }}
      >
        {score >= 0 ? `+${score}` : score}
      </div>
      <div className="text-[11px] mt-1" style={{ color: theme.fg, opacity: 0.85 }}>
        {sub}
      </div>
    </div>
  );
}

function NpsTrendChart({
  trend,
  benchmark,
}: {
  trend: NpsTrendBucket[];
  benchmark: number;
}) {
  if (trend.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-6 text-center">尚無資料</div>;
  }
  // npsScore 範圍 [-100, 100]，中軸 y=0
  const chartH = 140;
  const halfH = chartH / 2;
  return (
    <div data-testid="nps-trend-chart">
      <div className="flex items-end gap-3 overflow-x-auto pb-2" style={{ minHeight: chartH + 32 }}>
        {trend.map((p) => {
          // 兩條 bar：RS 藍、SA 綠
          const rsRatio = Math.max(-1, Math.min(1, p.sales / 100));
          const saRatio = Math.max(-1, Math.min(1, p.aftersales / 100));
          const rsH = Math.abs(rsRatio) * halfH;
          const saH = Math.abs(saRatio) * halfH;
          const rsColor = "#1A3A5C";
          const saColor = "#0F6E56";
          return (
            <div
              key={p.month}
              className="flex flex-col items-center min-w-[60px]"
              title={`${p.month} · RS ${p.sales} / SA ${p.aftersales}`}
            >
              <div
                className="relative w-full flex justify-center gap-1"
                style={{ height: chartH }}
              >
                {/* 中軸線 */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-[#D5D3CB]"
                  style={{ top: halfH }}
                />
                {/* 標竿線 */}
                <div
                  className="absolute left-0 right-0 border-t border-dashed"
                  style={{
                    top: halfH - (benchmark / 100) * halfH,
                    borderColor: "#9A9890",
                  }}
                />
                {/* RS bar 藍 */}
                <div
                  className="absolute rounded"
                  style={{
                    width: 14,
                    left: "calc(50% - 16px)",
                    bottom: p.sales >= 0 ? halfH : undefined,
                    top: p.sales < 0 ? halfH : undefined,
                    height: rsH,
                    backgroundColor: rsColor,
                    opacity: 0.85,
                  }}
                />
                {/* SA bar 綠 */}
                <div
                  className="absolute rounded"
                  style={{
                    width: 14,
                    left: "calc(50% + 2px)",
                    bottom: p.aftersales >= 0 ? halfH : undefined,
                    top: p.aftersales < 0 ? halfH : undefined,
                    height: saH,
                    backgroundColor: saColor,
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="text-[10px] text-[#9A9890] mt-1 whitespace-nowrap">
                {p.month.slice(5)}月
              </div>
              <div className="text-[10px] font-mono">
                <span style={{ color: rsColor }}>{p.sales}</span>
                <span className="text-[#D5D3CB] mx-0.5">·</span>
                <span style={{ color: saColor }}>{p.aftersales}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10.5px] mt-1">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block rounded" style={{ backgroundColor: "#1A3A5C" }} />
          <span style={{ color: "#1A3A5C" }}>RS 銷售側</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 inline-block rounded" style={{ backgroundColor: "#0F6E56" }} />
          <span style={{ color: "#0F6E56" }}>SA 售後側</span>
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          <span className="w-3 border-t border-dashed border-[#9A9890]" />
          <span className="text-[#9A9890]">行業標竿 +{benchmark}</span>
        </span>
      </div>
    </div>
  );
}

function SalesLeadKpiPanel({ kpi, kpiTop }: { kpi: SalesLeadKpi; kpiTop: StoreKpi }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      <MiniKpi label="新車成交" value={kpiTop.newCarCount} unit="台" color="#1A3A5C" />
      <MiniKpi label="進行中潛客" value={kpi.active} unit="筆" color="#1A3A5C" />
      <MiniKpi label="休眠潛客" value={kpi.dormant} unit="筆" color="#854F0B" />
      <MiniKpi label="戰敗 lead" value={kpi.lost} unit="筆" color="#CC0000" />
      <div className="col-span-2 text-[11px] text-[#9A9890] mt-1">
        7 天內待喚回：<span className="font-semibold text-[#1A3A5C]">{kpi.reviveCandidates}</span> 筆
      </div>
    </div>
  );
}

function ServiceKpiPanel({ kpi }: { kpi: ServiceKpi }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      <MiniKpi label="期間工單台次" value={kpi.totalWorkOrders} unit="台" color="#0F6E56" />
      <MiniKpi label="平均單金額" value={kpi.avgAmount.toLocaleString()} unit="NT$" color="#0F6E56" />
      <MiniKpi label="逾期未回廠" value={kpi.overdueCount} unit="位" color="#CC0000" />
      <MiniKpi label="14 天內保養到期" value={kpi.upcomingDueCount} unit="位" color="#854F0B" />
    </div>
  );
}

function MiniKpi({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | string;
  unit: string;
  color: string;
}) {
  return (
    <div className="bg-[#F8F7F4] rounded-md px-3 py-2">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="leading-tight">
        <span className="text-[20px] font-semibold font-mono" style={{ color }}>
          {value}
        </span>
        <span className="text-[11px] text-[#9A9890] ml-1">{unit}</span>
      </div>
    </div>
  );
}

function StaffRankingTable({ rows }: { rows: StaffRanking[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890] py-3 text-center">
        期間內尚無 SA 工單
      </div>
    );
  }
  return (
    <table className="w-full text-[12px]" data-testid="staff-ranking">
      <thead>
        <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
          <th className="text-left font-medium py-1.5 pr-2 w-[60px]">排名</th>
          <th className="text-left font-medium py-1.5 pr-2">服務顧問</th>
          <th className="text-right font-medium py-1.5 px-2">完成工單</th>
          <th className="text-right font-medium py-1.5 px-2">平均單金額</th>
          <th className="text-right font-medium py-1.5 px-2">NPS 均分</th>
          <th className="text-right font-medium py-1.5 pl-2">批評者</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const rankColor =
            r.rank === 1
              ? "#0F6E56"
              : r.rank === 2
                ? "#1A3A5C"
                : r.rank === 3
                  ? "#854F0B"
                  : "#5A5955";
          const npsColorVal =
            r.npsAvg >= 9 ? "#0F6E56" : r.npsAvg >= 7 ? "#854F0B" : "#CC0000";
          return (
            <tr key={r.name} className="border-b last:border-b-0 border-[#F4F2EC]">
              <td className="py-1.5 pr-2">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: rankColor }}
                >
                  {r.rank}
                </span>
              </td>
              <td className="py-1.5 pr-2 text-[#2C2C2A] font-medium">{r.name}</td>
              <td className="py-1.5 px-2 text-right font-mono font-semibold" style={{ color: "#0F6E56" }}>
                {r.workOrderCount}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-[#5A5955]">
                NT${r.avgAmount.toLocaleString()}
              </td>
              <td className="py-1.5 px-2 text-right font-mono font-semibold" style={{ color: npsColorVal }}>
                {r.npsAvg > 0 ? r.npsAvg.toFixed(1) : "—"}
              </td>
              <td className="py-1.5 pl-2 text-right">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold font-mono"
                  style={
                    r.detractorCount === 0
                      ? { backgroundColor: "#EAF3DE", color: "#3B6D11" }
                      : { backgroundColor: "#FDECEA", color: "#CC0000" }
                  }
                >
                  {r.detractorCount}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TopTagsList({ rows }: { rows: TopTagRow[] }) {
  if (rows.length === 0) {
    return <div className="text-[12px] text-[#9A9890] py-3 text-center">尚無標籤資料</div>;
  }
  return (
    <ul className="space-y-1.5" data-testid="top-tags">
      {rows.map((t, i) => (
        <li
          key={`${t.label}-${i}`}
          className="flex items-center gap-2 text-[12px] py-1 px-2 rounded bg-[#F8F7F4]"
        >
          <span className="text-[14px]">{t.emoji ?? "🏷️"}</span>
          <span className="text-[#2C2C2A] flex-1">{t.label}</span>
          <span className="text-[11px] text-[#9A9890]">{t.count} 個客戶</span>
        </li>
      ))}
    </ul>
  );
}

function AlertList({ alerts }: { alerts: StoreAlert[] }) {
  return (
    <ul className="space-y-2" data-testid="alert-list">
      {alerts.map((a, i) => {
        const palette =
          a.level === "red"
            ? { bg: "#FEF6F5", border: "#FCE6E4", fg: "#CC0000", icon: "🔴" }
            : a.level === "amber"
              ? { bg: "#FDF8EE", border: "#F0E1B8", fg: "#854F0B", icon: "⚠️" }
              : { bg: "#EFF8F3", border: "#C9E2D3", fg: "#0F6E56", icon: "✅" };
        return (
          <li
            key={i}
            className="rounded-md p-2.5 flex gap-2"
            style={{ backgroundColor: palette.bg, border: `1px solid ${palette.border}` }}
          >
            <span className="text-[16px] leading-tight">{palette.icon}</span>
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold" style={{ color: palette.fg }}>
                {a.title}
              </div>
              <div className="text-[11.5px] text-[#5A5955] mt-0.5 leading-relaxed">{a.body}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// 提示 lint：deltaColor 在這版未使用但保留 helper（trend 趨勢箭頭 phase 2 會用）
void deltaColor;
