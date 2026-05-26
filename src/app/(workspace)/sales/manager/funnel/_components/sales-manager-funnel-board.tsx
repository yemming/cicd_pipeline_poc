"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization";
import { SparkLine } from "@/components/charts";
import type { SalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import type {
  Period,
  RsKey,
  RsMetrics,
  ViewRole,
  HabcBreakdown,
} from "@/domain/sales-manager-funnel.constants";
import { PERIOD_LABEL } from "@/domain/sales-manager-funnel.constants";

// ─── 數值工具 ───────────────────────────────────────────────
function pctN(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
function aggregate(rsList: RsMetrics[]): Omit<RsMetrics, "key" | "name"> & { habc: HabcBreakdown } {
  return rsList.reduce(
    (acc, r) => ({
      contacts: acc.contacts + r.contacts,
      builds: acc.builds + r.builds,
      trials: acc.trials + r.trials,
      quotes: acc.quotes + r.quotes,
      orders: acc.orders + r.orders,
      deliveries: acc.deliveries + r.deliveries,
      habc: {
        H: acc.habc.H + r.habc.H,
        A: acc.habc.A + r.habc.A,
        B: acc.habc.B + r.habc.B,
        C: acc.habc.C + r.habc.C,
      },
    }),
    { contacts: 0, builds: 0, trials: 0, quotes: 0, orders: 0, deliveries: 0, habc: { H: 0, A: 0, B: 0, C: 0 } },
  );
}

// 將百分比達標度映射到 design tokens tone
type StatusTone = "good" | "warn" | "alert";
function statusTone(actual: number, target: number): StatusTone {
  if (actual >= target) return "good";
  if (actual >= target * 0.8) return "warn";
  return "alert";
}
const STATUS_COLOR: Record<StatusTone, { stroke: string; bg: string; border: string; text: string; needle: string }> = {
  good:  { stroke: "#5DCAA5", bg: "#F5FDF9", border: "#5DCAA5", text: "#0F6E56", needle: "#0F6E56" },
  warn:  { stroke: "#F0A500", bg: "#FFFDF5", border: "#F0C97E", text: "#854F0B", needle: "#E07800" },
  alert: { stroke: "#C8001A", bg: "#FFF8F8", border: "#F5AEAD", text: "#C8001A", needle: "#C8001A" },
};

// 把 0-100 數字轉成半圓上的座標（cx,cy 為圓心，R 為半徑）
function arcPoint(value: number, cx: number, cy: number, R: number): { x: number; y: number } {
  const deg = 180 - value * 1.8;
  const r = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(r) * R, y: cy - Math.sin(r) * R };
}

// 模擬近 12 週趨勢（用當期值在區間 80-110% 隨機散播，給 demo 用）
function seededTrend(base: number, weeks = 12, seed = 1): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < weeks; i++) {
    s = (s * 9301 + 49297) % 233280;
    const ratio = 0.8 + (s / 233280) * 0.5; // 0.8 - 1.3
    out.push(Math.max(0, Math.round(base * ratio)));
  }
  return out;
}

export interface SalesManagerFunnelBoardProps {
  data: SalesManagerFunnelData;
  pageHeader?: {
    title?: string;
    breadcrumb?: { label: string; href?: string }[];
  };
}

export default function SalesManagerFunnelBoard({ data, pageHeader }: SalesManagerFunnelBoardProps) {
  useSetPageHeader({
    title: pageHeader?.title ?? "RS_M1 銷售漏斗看板",
    breadcrumb: pageHeader?.breadcrumb ?? [{ label: "主管工作台" }, { label: "銷售漏斗" }],
  });

  const [role, setRole] = useState<ViewRole>("manager");
  const [rsKey, setRsKey] = useState<RsKey | "all">("all");
  const [period, setPeriod] = useState<Period>("month");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout((window as unknown as { __mfToast?: number }).__mfToast);
    (window as unknown as { __mfToast?: number }).__mfToast = window.setTimeout(
      () => setToast(null),
      2500,
    ) as unknown as number;
  };

  // 個人視角強制鎖在 lin
  const effectiveRsKey: RsKey | "all" = role === "personal" ? "lin" : rsKey;
  const currentMetrics = useMemo(() => {
    if (effectiveRsKey === "all") {
      const agg = aggregate(data.rsList);
      return { name: "全店匯總", ...agg };
    }
    const r = data.rsList.find((x) => x.key === effectiveRsKey);
    if (!r) return { name: "—", contacts: 0, builds: 0, trials: 0, quotes: 0, orders: 0, deliveries: 0, habc: { H: 0, A: 0, B: 0, C: 0 } };
    return { name: r.name, contacts: r.contacts, builds: r.builds, trials: r.trials, quotes: r.quotes, orders: r.orders, deliveries: r.deliveries, habc: r.habc };
  }, [data.rsList, effectiveRsKey]);

  const m = currentMetrics;
  const buildRate = pctN(m.builds, m.contacts);
  const trialRate = pctN(m.trials, m.builds);
  const quoteRate = pctN(m.quotes, m.trials);
  const orderRate = pctN(m.orders, m.quotes);
  const closeRate = pctN(m.deliveries, m.contacts);

  const isAll = effectiveRsKey === "all";
  const isEmpty = m.contacts === 0 && m.builds === 0 && m.trials === 0 && m.quotes === 0 && m.orders === 0 && m.deliveries === 0;

  // Layer 2 gauge 項目
  const layer2Items = [
    { key: "build", label: "建檔完整率", value: buildRate, target: data.kpiTargets.build },
    { key: "trial", label: "試乘試駕率", value: trialRate, target: data.kpiTargets.trial },
    { key: "quote", label: "報價轉化率", value: quoteRate, target: data.kpiTargets.quote },
    { key: "order", label: "訂車成交率", value: orderRate, target: data.kpiTargets.order },
  ];

  return (
    <main className="px-6 py-5 space-y-4" data-testid="sales-manager-funnel-page">
      {/* 1. Sub bar：視角 / RS / 期間 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex items-center gap-1 bg-[#F8F7F4] rounded-md p-1">
          {(["manager", "personal"] as ViewRole[]).map((r) => {
            const active = role === r;
            return (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  if (r === "personal") setRsKey("lin");
                  showToast(r === "manager" ? "主管視角：可查看全店及各 RS 數據" : "個人視角：僅顯示您的數據");
                }}
                className="px-3 py-1.5 rounded text-[12.5px] font-medium whitespace-nowrap transition-colors"
                style={{
                  background: active ? (r === "manager" ? "#1A3A5C" : "#534AB7") : "transparent",
                  color: active ? "#fff" : "#5A5955",
                }}
                data-testid={`sales-manager-funnel-role-${r}`}
              >
                {r === "manager" ? "🏢 主管視角" : "👤 個人視角"}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={rsKey}
            onChange={(e) => setRsKey(e.target.value as RsKey | "all")}
            disabled={role === "personal"}
            className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white disabled:opacity-50"
            data-testid="sales-manager-funnel-rs-select"
          >
            <option value="all">全店匯總</option>
            {data.rsList.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>
          {role === "personal" && (
            <span className="text-[10.5px] text-[#9A9890]">🔒 依登入帳號鎖定</span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-[#F8F7F4] rounded-md p-1">
          {(["month", "quarter", "year"] as Period[]).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded text-[12.5px] font-medium whitespace-nowrap transition-colors"
                style={{
                  background: active ? "#C8001A" : "transparent",
                  color: active ? "#fff" : "#5A5955",
                }}
                data-testid={`sales-manager-funnel-period-${p}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            );
          })}
        </div>

        <div className="ml-auto text-[11px] text-[#9A9890]">
          最後更新：{data.lastUpdated}
          {data.isFallback && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[10px] font-semibold">
              fallback 資料
            </span>
          )}
        </div>
      </section>

      {/* 2. 視角 banner */}
      <div
        className="rounded-lg px-4 py-2.5 text-[12.5px] border"
        style={
          role === "manager"
            ? { background: "linear-gradient(135deg,#EAF4FB 0%,#F5FAFE 100%)", borderColor: "#85B7EB", color: "#185FA5" }
            : { background: "linear-gradient(135deg,#EEEDFE 0%,#F8F7FE 100%)", borderColor: "#AFA9EC", color: "#534AB7" }
        }
      >
        {role === "manager"
          ? <>🏢 <b>主管視角</b>　顯示{isAll ? "全店匯總" : `RS ${m.name}`} · {PERIOD_LABEL[period]} · 可比較跨 RS 績效</>
          : <>👤 <b>個人視角</b>　顯示 {m.name} · {PERIOD_LABEL[period]} · 跟全店平均對標</>
        }
      </div>

      {/* Empty state — 整個 metrics 都 0 時顯示提示，但仍渲染下方 chart（會空但結構在） */}
      {isEmpty && (
        <div
          className="rounded-lg px-4 py-3 text-[12.5px] border bg-[#FAFAF8] border-[#EEECE6] text-[#5A5955]"
          data-testid="sales-manager-funnel-empty"
        >
          ℹ️ 本期間（{PERIOD_LABEL[period]}）尚無 {isAll ? "全店" : `RS ${m.name}`} 銷售活動資料。建議切換期間或先在「接待手卡 / 試乘預約」建立資料。
        </div>
      )}

      {/* 3. Layer 1 — 結果指標（design pattern KpiCard with-chart + SparkLine） */}
      <LayerHeader index={1} title="結果指標" subtitle="給主管看的最終成績" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="sales-manager-funnel-layer1">
        {[
          { label: "本月成交台數", value: m.deliveries, unit: "台", target: data.kpiTargets.deliveries, tone: "teal" as const },
          { label: "整體成交率",   value: closeRate,    unit: "%",  target: data.kpiTargets.closeRate,  tone: "blue" as const },
          { label: "本月報價單數", value: m.quotes,     unit: "張", target: null,                       tone: "amber" as const },
          { label: "本月訂車台數", value: m.orders,     unit: "台", target: data.kpiTargets.ordersAbs,  tone: "purple" as const },
        ].map((k, i) => {
          const st = k.target != null ? statusTone(k.value, k.target) : null;
          const cardTone = st === "alert" ? "red" as const : st === "warn" ? "amber" as const : k.tone;
          const trend = seededTrend(k.value || 5, 12, i + 1);
          const trendTone = st === "alert" ? "red" : st === "warn" ? "amber" : "teal";
          return (
            <KpiCard
              key={k.label}
              label={k.label}
              value={`${k.value}${k.unit}`}
              tone={cardTone}
              layout="with-chart"
              sparkline={<SparkLine data={trend} tone={trendTone as "red" | "amber" | "teal"} height={36} />}
              className="hover:shadow-md transition-shadow"
            />
          );
        })}
      </div>

      {/* 4. Layer 2 — 過程指標（半圓 gauge KPI，spec 核心視覺） */}
      <LayerHeader index={2} title="過程指標" subtitle="點擊卡片可展開 PULS 診斷（Phase 2）" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="sales-manager-funnel-layer2">
        {layer2Items.map((it) => {
          const tone = statusTone(it.value, it.target);
          const col = STATUS_COLOR[tone];
          const pv = Math.min(100, Math.max(0, it.value));
          const tg = Math.min(100, Math.max(0, it.target));

          const cx = 50, cy = 48, R = 36;
          const halfCirc = Math.PI * R;
          const valDash = (halfCirc * pv) / 100;
          const needle = arcPoint(pv, cx, cy, R - 4);
          const tgInner = arcPoint(tg, cx, cy, R + 2);
          const tgOuter = arcPoint(tg, cx, cy, R + 10);
          const ticks: { v: number; major: boolean }[] = [
            { v: 0, major: true }, { v: 25, major: false }, { v: 50, major: true }, { v: 75, major: false }, { v: 100, major: true },
          ];

          return (
            <button
              key={it.key}
              type="button"
              onClick={() => showToast(`PULS 診斷 — Phase 2 規劃中（${it.label}）`)}
              className="text-left bg-white border-[1.5px] rounded-lg p-3 hover:shadow-md transition-all relative"
              style={{ borderColor: col.border, background: col.bg }}
              data-testid={`sales-manager-funnel-layer2-${it.key}`}
            >
              {tone === "alert" && (
                <span
                  className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full"
                  style={{ background: "#C8001A", animation: "pulse 1.2s infinite" }}
                  aria-hidden
                />
              )}
              <div className="text-[11.5px] font-semibold text-[#5A5955] mb-1 text-center">{it.label}</div>
              <svg viewBox="0 0 100 56" style={{ width: "100%", maxWidth: 140, display: "block", margin: "0 auto", overflow: "visible" }}>
                {/* 背景弧 */}
                <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="#E8E7E4" strokeWidth={10} strokeLinecap="butt" />
                {/* 警示底色弧 */}
                <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="#FDF3E3" strokeWidth={10} strokeLinecap="butt" />
                {/* 實際值彩色弧 */}
                <path
                  d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
                  fill="none"
                  stroke={col.stroke}
                  strokeWidth={10}
                  strokeLinecap="butt"
                  strokeDasharray={`${valDash.toFixed(1)} ${(halfCirc - valDash + 1).toFixed(1)}`}
                />
                {/* 光澤 */}
                <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={4} strokeLinecap="butt" />
                {/* 刻度 */}
                {ticks.map((tk) => {
                  const p1 = arcPoint(tk.v, cx, cy, R + 2);
                  const p2 = arcPoint(tk.v, cx, cy, tk.major ? R + 9 : R + 6);
                  return (
                    <g key={tk.v}>
                      <line x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)} x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke={tk.major ? "#9A9890" : "#C8C7C4"} strokeWidth={tk.major ? 1.8 : 1} />
                      {tk.major && (
                        <text x={arcPoint(tk.v, cx, cy, R + 15).x.toFixed(1)} y={arcPoint(tk.v, cx, cy, R + 15).y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="#9A9890">{tk.v}</text>
                      )}
                    </g>
                  );
                })}
                {/* 目標標線 */}
                <line x1={tgInner.x.toFixed(1)} y1={tgInner.y.toFixed(1)} x2={tgOuter.x.toFixed(1)} y2={tgOuter.y.toFixed(1)} stroke="#1A3A5C" strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={tgInner.x.toFixed(1)} cy={tgInner.y.toFixed(1)} r={2} fill="#1A3A5C" />
                {/* 指針 */}
                <line x1={cx} y1={cy} x2={needle.x.toFixed(1)} y2={needle.y.toFixed(1)} stroke={col.needle} strokeWidth={2.5} strokeLinecap="round" />
                <circle cx={cx} cy={cy} r={5} fill="#2C2C2A" />
                <circle cx={cx} cy={cy} r={3} fill={col.needle} />
                <circle cx={cx} cy={cy} r={1.2} fill="#fff" />
                {/* 中央數值 */}
                <text x={cx} y={cy - 1} textAnchor="middle" fontSize="15" fontWeight="800" fill={col.needle} fontFamily="DM Mono,monospace">{pv}%</text>
                <text x={cx - R + 2} y={cy + 8} textAnchor="middle" fontSize="7" fill="#B4B2A9">0</text>
                <text x={cx + R - 2} y={cy + 8} textAnchor="middle" fontSize="7" fill="#B4B2A9">100</text>
              </svg>
              <div className="flex items-center justify-center gap-2 mt-1 text-[10.5px]">
                <div className="flex items-center gap-1 text-[#5A5955]">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#1A3A5C" }} />
                  目標 {tg}%
                </div>
                <span style={{ color: col.text, fontWeight: 700 }}>
                  {tone === "good" ? "✅ 達標" : `落後 ${Math.max(0, tg - pv)}%`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 5. Layer 3 — 原始數據（design pattern KpiCard horizontal） */}
      <LayerHeader index={3} title="原始數據" subtitle="行為導向的累積數" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="sales-manager-funnel-layer3">
        {[
          { label: "到店人次",       value: m.contacts, unit: "人次", tone: "blue" as const },
          { label: "電子手卡建檔",   value: m.builds,   unit: "筆",   tone: "blue" as const },
          { label: "試乘試駕次數",   value: m.trials,   unit: "次",   tone: "purple" as const },
          { label: "HABC 高意願客",  value: m.habc.H + m.habc.A, unit: "位", tone: "amber" as const },
          { label: "本月有效跟進",   value: Math.round(m.orders * 3.2), unit: "次", tone: "teal" as const },
        ].map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={`${k.value}${k.unit}`}
            tone={k.tone}
            layout="vertical"
            className="hover:shadow-md transition-shadow"
          />
        ))}
      </div>

      {/* 6. 主漏斗視覺（trapezoid SVG，spec 風格，含流失欄） */}
      <FunnelTrapezoidPanel m={m} period={period} onPuls={(stage) => showToast(`PULS 診斷 — Phase 2 規劃中（${stage}）`)} />

      {/* 7. RS 比較表（僅主管視角 + 全店模式） */}
      {role === "manager" && isAll && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden shadow-sm" data-testid="sales-manager-funnel-rs-table">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-gradient-to-r from-[#FDF3E3] to-[#FAFAF8] flex items-center gap-2">
            <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#FDF3E3]">📊</div>
            <div>
              <div className="text-[13px] font-semibold text-[#2C2C2A]">RS 個人績效比較</div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">點 RS 切換為該員工視角</div>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["RS", "到店", "建檔", "試駕", "報價", "訂車", "交車", "成交率", "趨勢"].map((h) => (
                    <th
                      key={h}
                      className="text-[10.5px] font-semibold tracking-wider uppercase text-[#9A9890] px-3 py-2 border-b-2 border-[#EEECE6] text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rsList.map((r, i) => {
                  const closeR = pctN(r.deliveries, r.contacts);
                  const closeT = statusTone(closeR, data.kpiTargets.closeRate);
                  const col = STATUS_COLOR[closeT];
                  return (
                    <tr
                      key={r.key}
                      className="hover:bg-[#FAFAF8] cursor-pointer"
                      onClick={() => setRsKey(r.key)}
                    >
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-semibold text-[#1A3A5C]">{r.name}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.contacts}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.builds}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.trials}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.quotes}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.orders}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] font-mono">{r.deliveries}</td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0]">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold"
                          style={{ background: col.bg, color: col.text, border: `1px solid ${col.border}` }}
                        >
                          {closeR}%
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-[#F4F3F0]" style={{ width: 100 }}>
                        <SparkLine data={seededTrend(r.deliveries || 3, 8, i + 7)} tone={closeT === "alert" ? "red" : closeT === "warn" ? "amber" : "teal"} height={24} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 8. 趨勢迷你圖（spec：近 12 週銷售漏斗變化） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden shadow-sm" data-testid="sales-manager-funnel-trend">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-gradient-to-r from-[#EAF4FB] to-[#FAFAF8] flex items-center gap-2">
          <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#EAF4FB]">📈</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">近 12 週銷售漏斗趨勢</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">demo 模擬 — Phase 2 接 historical 期數</div>
          </div>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "到店人次",       base: m.contacts,   tone: "blue"   as const, seed: 11 },
            { label: "電子手卡建檔",   base: m.builds,     tone: "blue"   as const, seed: 12 },
            { label: "試乘試駕",       base: m.trials,     tone: "purple" as const, seed: 13 },
            { label: "報價單",         base: m.quotes,     tone: "amber"  as const, seed: 14 },
            { label: "訂車",           base: m.orders,     tone: "teal"   as const, seed: 15 },
            { label: "交車",           base: m.deliveries, tone: "red"    as const, seed: 16 },
          ].map((t) => {
            const arr = seededTrend(t.base || 3, 12, t.seed);
            const max = Math.max(...arr, 1);
            return (
              <div key={t.label} className="rounded-md border border-[#EEECE6] bg-[#FAFAF8] px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11.5px] text-[#5A5955] font-medium">{t.label}</span>
                  <span className="text-[11px] text-[#9A9890] font-mono">{arr[arr.length - 1]} / max {max}</span>
                </div>
                <div className="flex items-end gap-[2px] h-[44px]">
                  {arr.map((v, i) => {
                    const h = Math.max(3, Math.round((v / max) * 100));
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: `${h}%`,
                          background: `linear-gradient(180deg, ${TONE_BAR[t.tone].light} 0%, ${TONE_BAR[t.tone].dark} 100%)`,
                        }}
                        title={`W${i + 1}: ${v}`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-[#B4B2A9] font-mono">W1</span>
                  <span className="text-[9px] text-[#B4B2A9] font-mono">W12</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 9. 接口品質指標（spec：電子手卡 / 標籤 / 試駕資料完整度） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden shadow-sm" data-testid="sales-manager-funnel-iface">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-gradient-to-r from-[#E1F5EE] to-[#FAFAF8] flex items-center gap-2">
          <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#E1F5EE]">🔗</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">接口品質指標</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">資料完整度 — 影響漏斗統計準確性</div>
          </div>
        </header>
        <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "手卡建檔率",   value: buildRate,                                  target: 90, suffix: "%" },
            { label: "客戶標籤覆蓋", value: m.contacts > 0 ? Math.min(100, Math.round((m.builds / m.contacts) * 100)) : 0, target: 80, suffix: "%" },
            { label: "試駕資料完整", value: m.trials > 0 ? 85 : 0,                       target: 90, suffix: "%" },
            { label: "報價單關聯率", value: m.trials > 0 ? Math.round((m.quotes / Math.max(1, m.trials)) * 100) : 0, target: 70, suffix: "%" },
          ].map((iface) => {
            const tn = statusTone(iface.value, iface.target);
            const col = STATUS_COLOR[tn];
            return (
              <div
                key={iface.label}
                className="rounded-lg border-[1.5px] px-3 py-3"
                style={{ borderColor: col.border, background: col.bg }}
              >
                <div className="text-[10.5px] text-[#9A9890] mb-0.5">{iface.label}</div>
                <div className="text-[22px] font-bold font-mono leading-none mb-1.5" style={{ color: col.text }}>
                  {iface.value}<span className="text-[12px] font-normal ml-0.5">{iface.suffix}</span>
                </div>
                <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, iface.value)}%`, background: col.stroke }} />
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: col.text, opacity: 0.85 }}>
                  目標 {iface.target}{iface.suffix}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 10. 客群畫像 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden shadow-sm" data-testid="sales-manager-funnel-tags">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-gradient-to-r from-[#EEEDFE] to-[#FAFAF8] flex items-center gap-2">
          <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#EEEDFE]">🎯</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">客群畫像</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">本月潛客標籤分布 × 成交率｜標籤由 RS_M3 主管設定管理</div>
          </div>
        </header>
        <div className="px-4 py-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.tagGroups.map((grp) => {
            const grpTotal = grp.tags.reduce((s, t) => s + t.count, 0);
            const grpClosed = grp.tags.reduce((s, t) => s + t.closed, 0);
            const grpRate = grpTotal > 0 ? Math.round((grpClosed / grpTotal) * 100) : 0;
            const maxCount = Math.max(...grp.tags.map((t) => t.count));
            return (
              <div
                key={grp.key}
                className="rounded-lg p-3.5"
                style={{ background: `linear-gradient(135deg, ${grp.bg} 0%, #FFFFFF 130%)`, border: `1.5px solid ${grp.border}` }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[12.5px] font-bold" style={{ color: grp.color }}>
                    {grp.emoji} {grp.name}
                  </div>
                  <div className="text-right">
                    <span className="text-[18px] font-bold font-mono" style={{ color: grp.color }}>
                      {grpTotal}
                    </span>
                    <span className="text-[10.5px] ml-1" style={{ color: grp.color }}>人次</span>
                    <div className="text-[10.5px]" style={{ color: grp.color, opacity: 0.8 }}>
                      成交率 {grpRate}%
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {grp.tags.map((t) => {
                    const rate = t.count > 0 ? Math.round((t.closed / t.count) * 100) : 0;
                    const barW = maxCount > 0 ? Math.round((t.count / maxCount) * 100) : 0;
                    return (
                      <div key={t.name} className="flex items-center gap-2">
                        <span className="text-[11px] w-[100px] shrink-0" style={{ color: grp.color }}>{t.name}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.5)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barW}%`, background: grp.color, opacity: 0.7 }}
                          />
                        </div>
                        <span className="text-[10.5px] font-mono w-[40px] text-right" style={{ color: grp.color }}>
                          {t.count}
                        </span>
                        <span className="text-[10.5px] font-semibold w-[36px] text-right" style={{ color: grp.color }}>
                          {rate}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 洞察摘要 3 條 */}
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: "💡", title: "最高成交標籤",  val: "已提供型錄", sub: "成交率 44%，建議優先跟進" },
            { icon: "⚠️", title: "流失風險標籤",  val: "預算偏低",   sub: "成交率僅 13%，需加強方案" },
            { icon: "🏆", title: "本月標籤覆蓋率", val: `${m.contacts > 0 ? Math.round((m.builds / m.contacts) * 100) : 0}%`, sub: `有 ${m.builds} 位潛客已被貼標` },
          ].map((ins) => (
            <div key={ins.title} className="rounded-lg border border-[#EEECE6] bg-[#F8F7F4] px-3.5 py-3">
              <div className="text-[13px]">{ins.icon}</div>
              <div className="text-[10.5px] text-[#9A9890] mt-1">{ins.title}</div>
              <div className="text-[15px] font-bold text-[#2C2C2A] my-0.5">{ins.val}</div>
              <div className="text-[10.5px] text-[#7A7A78]">{ins.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 11. Phase 2 規劃 */}
      <section
        className="bg-white border border-dashed border-[#D5D3CB] rounded-lg px-4 py-4"
        data-testid="sales-manager-funnel-phase2"
      >
        <div className="text-[12.5px] font-semibold text-[#5A5955] mb-2">📅 Phase 2 規劃中</div>
        <ul className="text-[11.5px] text-[#9A9890] space-y-1 list-disc list-inside">
          <li>PULS 4 步診斷工作流（點 Layer 2 KPI 展開）</li>
          <li>真實歷史趨勢（接 sales_funnel_metrics period_type=week 視圖）</li>
          <li>HABC 動態分布圖（圓餅 / sankey）</li>
          <li>個人視角 vs 全店平均 對標雷達圖</li>
        </ul>
      </section>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2.5 rounded-lg text-[12.5px] text-white shadow-lg z-50"
          style={{ background: "#1A3A5C" }}
          data-testid="sales-manager-funnel-toast"
        >
          {toast}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </main>
  );
}

// ─── 子元件 ─────────────────────────────────────────────────

function LayerHeader({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-1">
      <span
        className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[11.5px] font-bold text-white"
        style={{ background: "linear-gradient(135deg,#1A3A5C 0%,#2B5680 100%)" }}
      >
        {index}
      </span>
      <div>
        <div className="text-[13px] font-semibold text-[#2C2C2A]">Layer {index} — {title}</div>
        <div className="text-[10.5px] text-[#9A9890]">{subtitle}</div>
      </div>
    </div>
  );
}

// 主漏斗：用 SVG trapezoid（spec 風格），含轉化率欄 + 流失欄 + PULS 按鈕
function FunnelTrapezoidPanel({
  m,
  period,
  onPuls,
}: {
  m: { contacts: number; builds: number; trials: number; quotes: number; orders: number; deliveries: number };
  period: Period;
  onPuls: (stage: string) => void;
}) {
  const stages = [
    { key: "contacts",   lbl: "到店接觸",     n: m.contacts,   color: "#1A3A5C" },
    { key: "builds",     lbl: "電子手卡建檔", n: m.builds,     color: "#185FA5" },
    { key: "trials",     lbl: "試乘試駕",     n: m.trials,     color: "#534AB7" },
    { key: "quotes",     lbl: "開立報價單",   n: m.quotes,     color: "#854F0B" },
    { key: "orders",     lbl: "訂車成交",     n: m.orders,     color: "#C8001A" },
    { key: "deliveries", lbl: "完成交車",     n: m.deliveries, color: "#0F6E56" },
  ];
  const max = Math.max(m.contacts, 1);
  const W = 600, RH = 52, HDR = 28;
  const H = HDR + stages.length * RH;
  const LBL_MID = 90;
  const FNL_L = 175, FNL_R = 425;
  const FNL_CX = (FNL_L + FNL_R) / 2;
  const FNL_HW = (FNL_R - FNL_L) / 2;
  const RATE_X = 460;
  const LOSS_X = 540;

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden shadow-sm" data-testid="sales-manager-funnel-funnel">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-gradient-to-r from-[#EAF4FB] to-[#FAFAF8] flex items-center gap-2">
        <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#EAF4FB]">🔻</div>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">銷售漏斗視覺</div>
          <div className="text-[11px] text-[#9A9890] mt-0.5">六階段轉化 · {PERIOD_LABEL[period]} · 點擊任一層展開 PULS 診斷</div>
        </div>
      </header>
      <div className="px-4 py-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 540, display: "block" }} xmlns="http://www.w3.org/2000/svg">
          {/* 欄標題 */}
          <text x={LBL_MID} y={18} textAnchor="middle" fontSize={11} fill="#9A9890" fontFamily="Noto Sans TC,sans-serif" fontWeight={600}>階段</text>
          <text x={FNL_CX} y={18} textAnchor="middle" fontSize={11} fill="#9A9890" fontFamily="Noto Sans TC,sans-serif" fontWeight={600}>人數 / 漏斗</text>
          <text x={RATE_X} y={18} textAnchor="middle" fontSize={11} fill="#9A9890" fontFamily="Noto Sans TC,sans-serif" fontWeight={600}>轉化率</text>
          <text x={LOSS_X} y={18} textAnchor="middle" fontSize={11} fill="#9A9890" fontFamily="Noto Sans TC,sans-serif" fontWeight={600}>流失</text>
          <line x1={0} y1={HDR} x2={W} y2={HDR} stroke="#EEECE6" strokeWidth={1} />

          {/* 漸層 defs */}
          <defs>
            {stages.map((s, i) => (
              <linearGradient key={i} id={`fnl-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
                <stop offset="50%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.85} />
              </linearGradient>
            ))}
          </defs>

          {stages.map((s, i) => {
            const prev = i > 0 ? stages[i - 1].n : s.n;
            const nextN = i < stages.length - 1 ? stages[i + 1].n : Math.round(s.n * 0.65);
            const rateN = i > 0 ? pctN(s.n, prev) : null;
            const loss = i > 0 ? (prev - s.n) : 0;
            const lossPct = prev > 0 ? Math.round((loss / prev) * 100) : 0;
            const rateColor = rateN === null ? "#B4B2A9" : rateN >= 70 ? "#0F6E56" : rateN >= 50 ? "#E07800" : "#C8001A";
            const lossColor = lossPct >= 30 ? "#C8001A" : lossPct >= 15 ? "#E07800" : "#5A5955";

            const topHW = (s.n / max) * (FNL_HW - 8) + 8;
            const botHW = (nextN / max) * (FNL_HW - 8) + 8;

            const y0 = HDR + i * RH + 2;
            const y1 = HDR + (i + 1) * RH - 2;
            const midY = (y0 + y1) / 2;

            const pts = `${(FNL_CX - topHW).toFixed(1)},${y0} ${(FNL_CX + topHW).toFixed(1)},${y0} ${(FNL_CX + botHW).toFixed(1)},${y1} ${(FNL_CX - botHW).toFixed(1)},${y1}`;
            const hlPts = `${(FNL_CX - topHW).toFixed(1)},${y0} ${(FNL_CX + topHW).toFixed(1)},${y0} ${(FNL_CX + botHW * 0.9).toFixed(1)},${y0 + 10} ${(FNL_CX - botHW * 0.9).toFixed(1)},${y0 + 10}`;

            return (
              <g key={s.key}>
                <polygon
                  points={pts}
                  fill={`url(#fnl-grad-${i})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onPuls(s.lbl)}
                >
                  <title>{`${s.lbl}: ${s.n} (${rateN !== null ? `轉化 ${rateN}%` : "基準"})`}</title>
                </polygon>
                <polygon points={hlPts} fill="rgba(255,255,255,0.18)" style={{ pointerEvents: "none" }} />
                <text x={FNL_CX} y={midY + 5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#fff" fontFamily="DM Mono,monospace" style={{ pointerEvents: "none" }}>{s.n}</text>
                <text x={LBL_MID} y={midY + 5} textAnchor="middle" fontSize={12} fill="#2C2C2A" fontFamily="Noto Sans TC,sans-serif" fontWeight={500}>{s.lbl}</text>
                {rateN === null ? (
                  <text x={RATE_X} y={midY + 4} textAnchor="middle" fontSize={11} fill="#B4B2A9" fontFamily="Noto Sans TC,sans-serif">基準</text>
                ) : (
                  <text x={RATE_X} y={midY + 6} textAnchor="middle" fontSize={16} fontWeight={800} fill={rateColor} fontFamily="DM Mono,monospace">{rateN}%</text>
                )}
                {i > 0 && (
                  <g>
                    <text x={LOSS_X} y={midY} textAnchor="middle" fontSize={13} fontWeight={700} fill={lossColor} fontFamily="DM Mono,monospace">-{loss}</text>
                    <text x={LOSS_X} y={midY + 13} textAnchor="middle" fontSize={10} fill="#B4B2A9" fontFamily="Noto Sans TC,sans-serif">{lossPct}%流失</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="px-4 pb-3 text-[11.5px] text-[#9A9890]">💡 點擊任一層可展開 PULS 診斷工作區（Phase 2 規劃中）</div>
    </section>
  );
}

// ─── 趨勢 bar tone tokens ───────────────────────────────────
const TONE_BAR: Record<"blue" | "teal" | "amber" | "red" | "purple", { light: string; dark: string }> = {
  blue:   { light: "#85B7EB", dark: "#185FA5" },
  teal:   { light: "#5DCAA5", dark: "#0F6E56" },
  amber:  { light: "#F0C97E", dark: "#854F0B" },
  red:    { light: "#F5AEAD", dark: "#C8001A" },
  purple: { light: "#AFA9EC", dark: "#534AB7" },
};
