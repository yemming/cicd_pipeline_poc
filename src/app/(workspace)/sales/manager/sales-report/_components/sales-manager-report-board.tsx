"use client";

import Link from "next/link";
import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type { SalesManagerReportData } from "@/domain/sales-manager-report";
import {
  PERIOD_LABEL,
  type Period,
  type RsFilterValue,
  RS_FILTER_OPTIONS,
  type KpiCard,
  type ModelRow,
  type RsRow,
} from "@/domain/sales-manager-report.constants";

// ── 色票 mapping ──
const KPI_TONE_BORDER: Record<KpiCard["tone"], string> = {
  good: "border-[#5DCAA5] bg-[#F5FDF9]",
  warn: "border-[#F0C97E] bg-[#FFFDF5]",
  alert: "border-[#F5AEAD] bg-[#FFF8F8]",
  plain: "border-[#EEECE6] bg-white",
};

const KPI_NUM_COLOR: Record<KpiCard["color"], string> = {
  teal: "text-[#0F6E56]",
  amber: "text-[#854F0B]",
  red: "text-[#C8001A]",
  blue: "text-[#185FA5]",
  purple: "text-[#534AB7]",
  default: "text-[#2C2C2A]",
};

const KPI_BAR_COLOR: Record<NonNullable<KpiCard["progressBar"]>, string> = {
  teal: "bg-[#0F6E56]",
  amber: "bg-[#F0C97E]",
  red: "bg-[#C8001A]",
  blue: "bg-[#185FA5]",
};

const DELTA_STYLE: Record<NonNullable<KpiCard["deltaKind"]>, string> = {
  up: "bg-[#E1F5EE] text-[#0F6E56]",
  down: "bg-[#FDECEA] text-[#C8001A]",
  flat: "bg-[#F1EFE8] text-[#5A5955]",
};

// ── 小組件 ──
function LayerTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-wider uppercase text-[#9A9890] mb-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

function KpiCardView({ kpi }: { kpi: KpiCard }) {
  return (
    <div
      className={`rounded-lg border px-3.5 py-3 relative ${KPI_TONE_BORDER[kpi.tone]}`}
    >
      <div className="text-[11px] text-[#9A9890] mb-1">{kpi.label}</div>
      <div className={`text-[26px] font-bold font-mono leading-none mb-1 ${KPI_NUM_COLOR[kpi.color]}`}>
        {kpi.value}
        <span className="text-[14px] font-normal ml-0.5">{kpi.unit}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {kpi.target !== undefined && (
          <span className="text-[11px] text-[#9A9890]">目標 {kpi.target}{kpi.unit}</span>
        )}
        {kpi.deltaText && kpi.deltaKind && (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${DELTA_STYLE[kpi.deltaKind]}`}>
            {kpi.deltaText}
          </span>
        )}
      </div>
      {kpi.progressPct !== undefined && kpi.progressBar && (
        <div className="h-1 bg-[#EEECE6] rounded mt-2 overflow-hidden">
          <div
            className={`h-full rounded ${KPI_BAR_COLOR[kpi.progressBar]}`}
            style={{ width: `${kpi.progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  iconBg,
  title,
  subtitle,
  rightSlot,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <header className="px-4 py-2.5 flex items-center justify-between border-b border-[#EEECE6] bg-[#FAFAF8]">
      <div className="flex items-center gap-2.5">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[14px] shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
          {subtitle && <div className="text-[11px] text-[#9A9890] mt-px">{subtitle}</div>}
        </div>
      </div>
      {rightSlot}
    </header>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "blue" | "teal" | "amber" | "red" | "gray" | "purple";
}) {
  const cls: Record<typeof tone, string> = {
    blue: "bg-[#EAF4FB] text-[#185FA5]",
    teal: "bg-[#E1F5EE] text-[#0F6E56]",
    amber: "bg-[#FDF3E3] text-[#854F0B]",
    red: "bg-[#FDECEA] text-[#C8001A]",
    gray: "bg-[#F1EFE8] text-[#5A5955]",
    purple: "bg-[#EEEDFE] text-[#534AB7]",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap ${cls[tone]}`}>
      {children}
    </span>
  );
}

// ── RS table 樣式 helper ──
function fillCls(actual: number, good: number, ok: number) {
  if (actual >= good) return "bg-[#0F6E56]";
  if (actual >= ok) return "bg-[#185FA5]";
  return "bg-[#C8001A]";
}

function rankInfo(rank: number) {
  if (rank === 1) return { cls: "bg-[#D4A800] text-white", label: "🥇" };
  if (rank === 2) return { cls: "bg-[#9A9890] text-white", label: "🥈" };
  if (rank === 3) return { cls: "bg-[#C47A3C] text-white", label: "🥉" };
  return { cls: "bg-[#EEECE6] text-[#7A7A78]", label: String(rank) };
}

function RsTable({ rows }: { rows: RsRow[] }) {
  const sorted = [...rows].sort((a, b) => b.sales - a.sales);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["排名", "RS 顧問", "成交台數", "業績金額", "試駕率", "報價率", "即時報價率", "回訪率", "HABC H+A"].map((h, i) => (
              <th
                key={h}
                className={`text-[10.5px] font-semibold tracking-wider uppercase text-[#9A9890] px-3 py-2 border-b-2 border-[#EEECE6] whitespace-nowrap ${i === 0 ? "w-10 text-left" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const rank = idx + 1;
            const ri = rankInfo(rank);
            return (
              <tr key={r.name} className="hover:bg-[#FAFAF8] transition-colors">
                <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                  <span className={`w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-[11px] font-bold ${ri.cls}`}>
                    {ri.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12.5px] font-semibold text-[#2C2C2A]">
                  {r.name}
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12.5px] font-semibold font-mono text-[#1A3A5C]">
                  {r.sales} 台
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0] text-[12.5px] font-semibold font-mono text-[#5A5955]">
                  {r.rev} 萬
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-[90px] h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                      <div className={`h-full rounded ${fillCls(r.trial, 60, 45)}`} style={{ width: `${r.trial}%` }} />
                    </div>
                    <span className="text-[12px] font-mono font-semibold">{r.trial}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-[90px] h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                      <div className={`h-full rounded ${fillCls(r.quote, 70, 55)}`} style={{ width: `${r.quote}%` }} />
                    </div>
                    <span className="text-[12px] font-mono font-semibold">{r.quote}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-[90px] h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                      <div className={`h-full rounded ${fillCls(r.golden, 80, 60)}`} style={{ width: `${r.golden}%` }} />
                    </div>
                    <span className="text-[12px] font-mono font-semibold">{r.golden}%</span>
                  </div>
                </td>
                <td className={`px-3 py-2.5 border-b border-[#F4F3F0] text-[12.5px] font-mono font-semibold ${r.revisit >= 90 ? "text-[#0F6E56]" : "text-[#C8001A]"}`}>
                  {r.revisit}%
                </td>
                <td className="px-3 py-2.5 border-b border-[#F4F3F0]">
                  <Badge tone={r.habc >= 7 ? "teal" : r.habc >= 5 ? "blue" : "amber"}>{r.habc} 人</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelGrid({ rows }: { rows: ModelRow[] }) {
  const total = rows.reduce((s, m) => s + m.count, 0);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {rows.map((m) => {
        const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
        const barW = m.max > 0 ? Math.round((m.count / m.max) * 100) : 0;
        return (
          <div key={m.name} className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-3 py-2.5">
            <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1.5">{m.name}</div>
            <div className="text-[10px] text-[#9A9890] mb-2">{m.series}</div>
            <div className="flex justify-between items-center mb-1.5">
              <div className="text-[20px] font-bold font-mono text-[#1A3A5C]">
                {m.count}
                <span className="text-[12px] font-normal ml-0.5">台</span>
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890] text-right">{pct}% 佔比</div>
                <div className="text-[11.5px] text-[#5A5955] text-right">
                  {m.rev > 0 ? `${m.rev} 萬` : "—"}
                </div>
              </div>
            </div>
            <div className="h-[5px] bg-[#EEECE6] rounded overflow-hidden">
              <div className="h-full rounded bg-[#1A3A5C]" style={{ width: `${barW}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SalesManagerReportBoard({ data }: { data: SalesManagerReportData }) {
  useSetPageHeader({
    title: "RS_M2 業績報表",
    breadcrumb: [{ label: "銷售管理" }, { label: "業績報表" }],
    hideSearch: true,
  });

  const [period, setPeriod] = useState<Period>("month");
  const [rsFilter, setRsFilter] = useState<RsFilterValue>("all");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout((window as unknown as { __mrToast?: number }).__mrToast);
    (window as unknown as { __mrToast?: number }).__mrToast = window.setTimeout(
      () => setToast(null),
      2500,
    ) as unknown as number;
  };

  // 進度百分比（BEP track 上 fill width）
  const bepFillPct = Math.min(
    100,
    Math.round((data.bep.achieved / data.bep.monthlyTarget) * 100),
  );
  const bepTargetLinePct = Math.round((data.bep.bepPoint / data.bep.monthlyTarget) * 100);

  return (
    <main className="px-6 py-5 space-y-3" data-testid="sales-manager-report-page">
      {/* Sub bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2 flex flex-wrap items-center gap-2.5">
        <span className="text-[11px] text-[#9A9890] font-semibold">期間</span>
        <div className="flex border border-[#D5D3CB] rounded-md overflow-hidden">
          {(["month", "quarter", "year"] as const).map((p, idx, arr) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                showToast(`已切換至：${PERIOD_LABEL[p]}`);
              }}
              className={`px-3.5 py-1.5 text-[12px] cursor-pointer whitespace-nowrap transition-all ${
                idx < arr.length - 1 ? "border-r border-[#D5D3CB]" : ""
              } ${
                period === p
                  ? "bg-[#F1EFE8] text-[#2C2C2A] font-semibold"
                  : "bg-white text-[#7A7A78]"
              }`}
            >
              {p === "month" ? "本月" : p === "quarter" ? "本季" : "本年"}
            </button>
          ))}
        </div>

        <span className="w-px h-[18px] bg-[#EEECE6]" />

        <span className="text-[11px] text-[#9A9890] font-semibold">人員</span>
        <select
          value={rsFilter}
          onChange={(e) => setRsFilter(e.target.value as RsFilterValue)}
          className="px-2.5 py-1.5 border border-[#D5D3CB] rounded-md text-[12.5px] text-[#2C2C2A] bg-white outline-none focus:border-[#185FA5]"
        >
          {RS_FILTER_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === "all" ? "全體 RS" : o}
            </option>
          ))}
        </select>

        <span className="w-px h-[18px] bg-[#EEECE6]" />

        <button
          type="button"
          onClick={() => showToast("📊 匯出 Excel 報表（Phase 2）")}
          className="px-3 py-1.5 rounded-md text-[12px] border border-[#D5D3CB] bg-white text-[#4A4A48] flex items-center gap-1 hover:bg-[#F4F3F0]"
        >
          📊 匯出 Excel
        </button>
        <button
          type="button"
          onClick={() => showToast("🖨 列印報表（Phase 2）")}
          className="px-3 py-1.5 rounded-md text-[12px] border border-[#D5D3CB] bg-white text-[#4A4A48] flex items-center gap-1 hover:bg-[#F4F3F0]"
        >
          🖨 列印
        </button>

        <div className="ml-auto text-[11px] text-[#9A9890]">{PERIOD_LABEL[period]}</div>
      </section>

      {/* 跨頁導覽 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Link
          href="/sales/overview"
          className="px-3 py-1 text-[11.5px] rounded-md border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 銷售總覽
        </Link>
        <Link
          href="/sales/manager/funnel"
          className="px-3 py-1 text-[11.5px] rounded-md border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
        >
          漏斗看板
        </Link>
        <button
          type="button"
          onClick={() => showToast("→ 主管設定（Phase 2）")}
          className="px-3 py-1 text-[11.5px] rounded-md border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
        >
          主管設定
        </button>
      </div>

      {/* Layer 1 */}
      <div>
        <LayerTitle>Layer 1 — 結果指標（總經理視角）</LayerTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {data.layer1.map((k) => (
            <KpiCardView key={k.label} kpi={k} />
          ))}
        </div>
      </div>

      {/* 損益平衡進度 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="📊"
          iconBg="bg-[#FDF3E3]"
          title="損益平衡進度"
          subtitle="月固定成本覆蓋狀況 · 超過損益點後每台均為純利潤"
          rightSlot={
            <div className="flex items-center gap-2">
              <Badge tone="amber">損益點：{data.bep.bepPoint} 台</Badge>
              <Badge tone="teal">已超越 ＋{data.bep.achieved - data.bep.bepPoint} 台</Badge>
            </div>
          }
        />
        <div className="p-4">
          <div className="flex justify-between items-end mb-2">
            <div>
              <div className="text-[11px] text-[#9A9890] mb-1">本月已成交</div>
              <div className="text-[28px] font-bold font-mono text-[#0F6E56]">
                {data.bep.achieved} 台
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-[#9A9890] mb-1">損益平衡點</div>
              <div className="text-[18px] font-bold font-mono text-[#1A3A5C]">
                {data.bep.bepPoint} 台
              </div>
            </div>
          </div>

          <div className="relative mt-4">
            <div className="relative mb-6">
              <div
                className="absolute -top-5 text-[10px] font-semibold text-[#1A3A5C] whitespace-nowrap"
                style={{ left: `${bepTargetLinePct}%`, transform: "translateX(-50%)" }}
              >
                ▼ 損益點 {data.bep.bepPoint} 台
              </div>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#1A3A5C] z-10"
                style={{ left: `${bepTargetLinePct}%` }}
              />
            </div>
            <div className="h-7 bg-[#F4F3F0] rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md flex items-center pl-3 transition-all"
                style={{
                  width: `${bepFillPct}%`,
                  background: `linear-gradient(90deg,#F0C97E 0%,#F0C97E 55%,#0F6E56 55%,#0F6E56 100%)`,
                }}
              >
                <span className="text-[12px] font-bold text-white font-mono whitespace-nowrap">
                  {data.bep.achieved} / {data.bep.monthlyTarget} 台
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10.5px] text-[#9A9890] font-mono">
              <span>0</span>
              <span>損益點 {data.bep.bepPoint} 台</span>
              <span>目標 {data.bep.monthlyTarget} 台</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg p-2.5 border bg-[#FFF8F8] border-[#F5AEAD]">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[#C8001A] mb-1">虧損區間</div>
              <div className="text-[16px] font-bold font-mono text-[#C8001A]">0 – {data.bep.bepPoint - 1} 台</div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">固定成本未覆蓋</div>
            </div>
            <div className="rounded-lg p-2.5 border bg-[#FFFDF5] border-[#F0C97E]">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[#854F0B] mb-1">打平區間</div>
              <div className="text-[16px] font-bold font-mono text-[#854F0B]">{data.bep.bepPoint} 台</div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">剛好覆蓋固定成本</div>
            </div>
            <div className="rounded-lg p-2.5 border bg-[#F5FDF9] border-[#5DCAA5]">
              <div className="text-[10px] font-bold tracking-wider uppercase text-[#0F6E56] mb-1">獲利區間 ✅</div>
              <div className="text-[16px] font-bold font-mono text-[#0F6E56]">
                {data.bep.bepPoint + 1} – {data.bep.monthlyTarget} 台
              </div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">每台均為純利潤 · 已在此區</div>
            </div>
          </div>

          <div className="mt-3 px-3 py-2.5 bg-[#F5FDF9] border border-[#5DCAA5] rounded-lg text-[12px] text-[#085041] leading-relaxed">
            💡 目前超過損益點 <b>{data.bep.achieved - data.bep.bepPoint} 台</b>，月底前還需達成{" "}
            <b>{Math.max(0, data.bep.monthlyTarget - data.bep.achieved)} 台</b>才能完成月度目標
            （{data.bep.monthlyTarget} 台）。損益平衡點由財務部設定，如需調整請聯繫系統管理員。
          </div>

          <div className="mt-2.5 bg-[#E8EDF2] border border-dashed border-[#8FAABB] rounded-lg px-3 py-2.5 text-[11.5px] text-[#3A5A6C]">
            🔒 <b>財務預留欄位</b>：毛利率 / 月固定成本 / 每台平均售價 — Phase 2 由財務模組補齊
          </div>
        </div>
      </section>

      {/* Layer 2 */}
      <div>
        <LayerTitle>Layer 2 — 過程指標（銷售主管視角）</LayerTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {data.layer2.map((k) => (
            <KpiCardView key={k.label} kpi={k} />
          ))}
        </div>
      </div>

      {/* Layer 3 */}
      <div>
        <LayerTitle>Layer 3 — 行為數據（銷售顧問視角）</LayerTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {data.layer3.map((k) => (
            <KpiCardView key={k.label} kpi={k} />
          ))}
        </div>
      </div>

      {/* 月份趨勢 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="📈"
          iconBg="bg-[#EAF4FB]"
          title="近 5 個月成交台數趨勢"
          subtitle={`月度對比 · 目標線 ${data.monthlyChartTarget} 台`}
        />
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
            {data.monthlyTrend.map((m) => (
              <div
                key={m.label}
                className={`rounded-md px-2.5 py-2 border text-center ${
                  m.isCurrent
                    ? "border-[#185FA5] bg-[#EAF4FB]"
                    : "border-[#EEECE6] bg-[#FAFAF8]"
                }`}
              >
                <div className={`text-[10.5px] mb-1 ${m.isCurrent ? "text-[#185FA5] font-semibold" : "text-[#9A9890]"}`}>
                  {m.label}
                </div>
                <div className={`text-[18px] font-bold font-mono ${m.isCurrent ? "text-[#185FA5]" : "text-[#2C2C2A]"}`}>
                  {m.count}
                </div>
                <div className={`text-[10.5px] mt-0.5 ${
                  m.rateKind === "up" ? "text-[#0F6E56]" :
                  m.rateKind === "down" ? "text-[#C8001A]" : "text-[#9A9890]"
                }`}>
                  {m.ratePct >= 0 ? "+" : ""}{m.ratePct}%
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mb-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#7A7A78]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#1A3A5C]" />
              實際成交
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#7A7A78]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#EEECE6]" />
              目標 {data.monthlyChartTarget} 台
            </div>
          </div>

          <div className="flex items-end gap-2 h-[160px] px-1">
            {data.monthlyTrend.map((m) => {
              const barH = Math.round((m.count / data.monthlyChartTarget) * 130);
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex gap-1 items-end w-full" style={{ height: 130 }}>
                    <div
                      className="flex-1 rounded-t transition-all"
                      style={{
                        height: barH,
                        background: m.isCurrent ? "#C8001A" : "#1A3A5C",
                      }}
                      title={`${m.label}：${m.count} 台`}
                    />
                    <div
                      className="flex-1 rounded-t transition-all bg-[#EEECE6]"
                      style={{ height: 130 }}
                      title={`目標：${data.monthlyChartTarget} 台`}
                    />
                  </div>
                  <div className="text-[10.5px] text-[#9A9890] text-center">{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* RS 排行 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="👥"
          iconBg="bg-[#E8EDF2]"
          title="RS 個人業績排行"
          subtitle="本月 · 主管專屬視角"
          rightSlot={<Badge tone="blue">主管視角</Badge>}
        />
        <RsTable rows={data.rsRanking} />
      </section>

      {/* 車系業績 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="🏍️"
          iconBg="bg-[#FDECEA]"
          title="車系業績分析"
          subtitle="本月各車系成交台數與佔比"
        />
        <div className="p-4">
          <ModelGrid rows={data.modelSales} />
        </div>
      </section>

      {/* 週趨勢 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="📅"
          iconBg="bg-[#E1F5EE]"
          title="本月週趨勢"
          subtitle="每週到店人次 vs 成交台數"
        />
        <div className="p-4">
          <div className="flex gap-3 mb-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#7A7A78]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#1A3A5C]" />
              到店人次
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#7A7A78]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#C8001A]" />
              成交台數（×5 倍顯示）
            </div>
          </div>
          <div className="flex items-end gap-2.5 h-[160px] px-1">
            {data.weeklyTrend.map((w) => {
              const cH = Math.round((w.contacts / 40) * 130);
              const sH = Math.round(((w.sales * 5) / 40) * 130);
              return (
                <div key={w.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex gap-1 items-end w-full" style={{ height: 130 }}>
                    <div
                      className="flex-1 rounded-t bg-[#1A3A5C] transition-all"
                      style={{ height: cH }}
                      title={`到店：${w.contacts} 人`}
                    />
                    <div
                      className="flex-1 rounded-t bg-[#C8001A] transition-all"
                      style={{ height: sH }}
                      title={`成交：${w.sales} 台`}
                    />
                  </div>
                  <div className="text-[10px] text-[#9A9890] text-center">{w.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 財務損益（預留） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <PanelHeader
          icon="💹"
          iconBg="bg-[#EEEDFE]"
          title="財務損益報表"
          subtitle="毛利分析 · 費用結構 · Phase 2 開放"
          rightSlot={<Badge tone="gray">Phase 2 預留</Badge>}
        />
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="bg-[#E8EDF2] border border-dashed border-[#8FAABB] rounded-lg p-5 text-center text-[#3A5A6C]">
              <div className="text-[13px] font-semibold mb-1.5">💹 毛利結構分析</div>
              <div className="text-[12px] opacity-70 leading-relaxed">
                新車毛利 / 中古車毛利 / 衍生商品
                <br />
                待財務模組 Phase 2 補齊資料後開啟
              </div>
            </div>
            <div className="bg-[#E8EDF2] border border-dashed border-[#8FAABB] rounded-lg p-5 text-center text-[#3A5A6C]">
              <div className="text-[13px] font-semibold mb-1.5">📋 費用結構</div>
              <div className="text-[12px] opacity-70 leading-relaxed">
                人事成本 / 場地費用 / 行銷費用
                <br />
                需對接財務系統或手動輸入
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#1A3A5C] text-white px-4 py-2.5 rounded-lg text-[12.5px] z-50 shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
