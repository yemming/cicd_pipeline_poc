"use client";

import Link from "next/link";
import { useMemo } from "react";

import type {
  AbcClass,
  AbcStructureChangeRow,
  AbcStructurePageData,
  AbcStructurePareto,
  AbcStructurePeriodCompare,
  AbcOverview,
} from "@/domain/analytics";

const CLASS_COLOR: Record<AbcClass, string> = {
  A: "#185FA5", // navy (規格的 A 用藍)
  B: "#EF9F27", // amber
  C: "#9A9890", // gray
};

const CLASS_CHIP: Record<AbcClass, string> = {
  A: "bg-[#EBF3FF] text-[#1A3A5C]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#F2F2F2] text-[#6B6A68]",
};

function fmtNT(n: number): string {
  return `NT$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtNTCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `NT$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `NT$${(n / 10_000).toFixed(1)} 萬`;
  return fmtNT(n);
}

export function AbcStructureBoard({ data }: { data: AbcStructurePageData }) {
  const { overview, pareto, changes, period_compare } = data;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">ABC 結構圖</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          §12.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          帕雷托曲線 · 銷售額圓環 · 分類變動記錄
          {overview.config?.last_recalc_at
            ? ` ・ 上次重跑 ${new Date(overview.config.last_recalc_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`
            : " ・ 尚未重跑"}
        </span>
      </header>

      {/* 2. KPI tiles — A/B/C */}
      <KpiBlock overview={overview} />

      {/* 3. Pareto + Donut */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ParetoCard pareto={pareto} />
        <DonutCard overview={overview} />
      </div>

      {/* 4. Period compare + Changes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PeriodCompareCard pc={period_compare} />
        <ChangesCard changes={changes} />
      </div>

      {/* 5. Footer pills */}
      <div className="flex gap-2 flex-wrap pt-1">
        <FooterPill href="/parts/analytics/turnover" label="→ 庫存周轉率" />
        <FooterPill href="/parts/analytics/stale" label="→ 呆滯庫存佔比" />
        <FooterPill href="/parts/analytics/abc-settings" label="→ ABC 分類設定" />
        <FooterPill href="/parts/analytics/abc" label="→ ABC 分類總覽" />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// KPI Block — 3 顆 tile（A / B / C）
// ──────────────────────────────────────────────────────────────────────────

function KpiBlock({ overview }: { overview: AbcOverview }) {
  const { kpi } = overview;
  const total = kpi.total.count || 1;
  const tiles: {
    cls: AbcClass;
    accent: string;
    label: string;
    count: number;
    amountPct: number;
    pctOfTypes: number;
    color: string;
  }[] = [
    {
      cls: "A",
      accent: "#185FA5",
      label: "A 類 · 料號數 / 銷售額佔比",
      count: kpi.a.count,
      amountPct: kpi.a.pctOfAmount,
      pctOfTypes: (kpi.a.count / total) * 100,
      color: "#185FA5",
    },
    {
      cls: "B",
      accent: "#EF9F27",
      label: "B 類 · 料號數 / 銷售額佔比",
      count: kpi.b.count,
      amountPct: kpi.b.pctOfAmount,
      pctOfTypes: (kpi.b.count / total) * 100,
      color: "#854F0B",
    },
    {
      cls: "C",
      accent: "#9A9890",
      label: "C 類 · 料號數 / 銷售額佔比",
      count: kpi.c.count,
      amountPct: kpi.c.pctOfAmount,
      pctOfTypes: (kpi.c.count / total) * 100,
      color: "#5A5955",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div
          key={t.cls}
          className="bg-white border border-[#EEECE6] rounded-lg p-3"
          style={{ borderLeft: `3px solid ${t.accent}` }}
        >
          <div className="text-[11px] text-[#9A9890]">{t.label}</div>
          <div className="text-[18px] font-bold mt-1" style={{ color: t.color }}>
            {`${t.count.toLocaleString()} 料號 · ${t.amountPct.toFixed(1)}%`}
          </div>
          <div className="text-[11px] text-[#9A9890]">
            {`佔總 SKU ${t.pctOfTypes.toFixed(0)}% → 貢獻銷售額 ${t.amountPct.toFixed(0)}%`}
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Pareto Card — SVG curve
// ──────────────────────────────────────────────────────────────────────────

function ParetoCard({ pareto }: { pareto: AbcStructurePareto }) {
  // viewBox 寬 400 / 高 150；x ∈ [0..400] = [0..100%]；y ∈ [0..150] = [100%..0%]
  const W = 400;
  const H = 150;
  const px = (v: number) => (v / 100) * W;
  const py = (v: number) => H - (v / 100) * H;

  const curvePath = useMemo(() => {
    if (pareto.curve.length === 0) return null;
    const cmds = pareto.curve
      .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
      .join(" ");
    return cmds;
  }, [pareto.curve]);

  const fillPath = useMemo(() => {
    if (!curvePath) return null;
    return `${curvePath} L${W},${H} L0,${H} Z`;
  }, [curvePath]);

  const empty = pareto.curve.length === 0;

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          帕雷托曲線（料號累計 % vs 銷售額累計 %）
        </span>
      </header>
      <div className="px-4 py-4">
        {empty ? (
          <div className="h-[150px] flex items-center justify-center text-[12px] text-[#9A9890]">
            尚無 ABC 分類資料 — 請先到「ABC 分類」執行重跑
          </div>
        ) : (
          <>
            <div
              style={{
                position: "relative",
                height: H,
                borderLeft: "1px solid #D5D3CB",
                borderBottom: "1px solid #D5D3CB",
              }}
            >
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                height="100%"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="abcStructGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#185FA5" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#185FA5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* fill under curve */}
                {fillPath ? <path d={fillPath} fill="url(#abcStructGrad)" /> : null}
                {/* uniform reference line (diagonal) */}
                <path
                  d={`M0,${H} L${W},0`}
                  fill="none"
                  stroke="#D5D3CB"
                  strokeWidth="1"
                  strokeDasharray="4,3"
                />
                {/* curve */}
                {curvePath ? (
                  <path
                    d={curvePath}
                    fill="none"
                    stroke="#185FA5"
                    strokeWidth="2"
                  />
                ) : null}
                {/* A cut */}
                {pareto.cut_a ? (
                  <>
                    <line
                      x1={px(pareto.cut_a.x)}
                      y1={0}
                      x2={px(pareto.cut_a.x)}
                      y2={H}
                      stroke="#185FA5"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                    />
                    <circle
                      cx={px(pareto.cut_a.x)}
                      cy={py(pareto.cut_a.y)}
                      r="3"
                      fill="#185FA5"
                    />
                    <text
                      x={px(pareto.cut_a.x) + 4}
                      y={py(pareto.cut_a.y) - 4}
                      fontSize="9"
                      fill="#185FA5"
                    >
                      {`A: ${pareto.cut_a.x.toFixed(0)}%→${pareto.cut_a.y.toFixed(0)}%`}
                    </text>
                  </>
                ) : null}
                {/* B cut */}
                {pareto.cut_b ? (
                  <>
                    <line
                      x1={px(pareto.cut_b.x)}
                      y1={0}
                      x2={px(pareto.cut_b.x)}
                      y2={H}
                      stroke="#EF9F27"
                      strokeWidth="1"
                      strokeDasharray="3,3"
                    />
                    <circle
                      cx={px(pareto.cut_b.x)}
                      cy={py(pareto.cut_b.y)}
                      r="3"
                      fill="#EF9F27"
                    />
                    <text
                      x={px(pareto.cut_b.x) + 4}
                      y={py(pareto.cut_b.y) - 4}
                      fontSize="9"
                      fill="#854F0B"
                    >
                      {`B: ${pareto.cut_b.x.toFixed(0)}%→${pareto.cut_b.y.toFixed(0)}%`}
                    </text>
                  </>
                ) : null}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] text-[#9A9890] mt-1">
              <span>0%</span>
              <span>料號累計佔比 →</span>
              <span>100%</span>
            </div>
            <div className="mt-2 flex gap-3 text-[11px]">
              <LegendDash color="#185FA5" label="帕雷托曲線" solid />
              <LegendDash color="#9A9890" label="均勻分佈線" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function LegendDash({ color, label, solid }: { color: string; label: string; solid?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#5A5955]">
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 0,
          borderTop: `${solid ? "2px solid" : "1px dashed"} ${color}`,
        }}
      />
      {label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Donut Card — A/B/C 金額結構（conic CSS pie，跟 abc-board 一致）
// ──────────────────────────────────────────────────────────────────────────

function DonutCard({ overview }: { overview: AbcOverview }) {
  const { pct, amounts, kpi } = overview;
  const a = pct.A;
  const b = a + pct.B;
  const pieBg = `conic-gradient(${CLASS_COLOR.A} 0% ${a.toFixed(2)}%, ${CLASS_COLOR.B} ${a.toFixed(2)}% ${b.toFixed(2)}%, ${CLASS_COLOR.C} ${b.toFixed(2)}% 100%)`;
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          銷售額結構（A / B / C 金額佔比）
        </span>
      </header>
      <div className="px-4 py-4 flex items-center gap-5 flex-wrap">
        {amounts.total > 0 ? (
          <div className="relative shrink-0">
            <div
              className="w-[120px] h-[120px] rounded-full"
              style={{ background: pieBg }}
            />
            {/* donut hole */}
            <div
              className="absolute inset-0 m-auto w-[60px] h-[60px] rounded-full bg-white border border-[#EEECE6] flex items-center justify-center"
              style={{ top: 30, left: 30 }}
            >
              <div className="text-center">
                <div className="text-[10px] text-[#9A9890]">總料號</div>
                <div className="text-[13px] font-semibold text-[#2C2C2A]">
                  {kpi.total.count.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-[120px] h-[120px] rounded-full shrink-0 bg-[#F2F2F2] flex items-center justify-center text-[11px] text-[#9A9890]">
            尚無資料
          </div>
        )}

        <div className="flex-1 flex flex-col gap-2 min-w-[140px]">
          <DonutLegend cls="A" pct={pct.A} amount={amounts.A} />
          <DonutLegend cls="B" pct={pct.B} amount={amounts.B} />
          <DonutLegend cls="C" pct={pct.C} amount={amounts.C} />
          <div className="text-[11px] text-[#9A9890] mt-1">
            {`總計：${fmtNTCompact(amounts.total)}`}
          </div>
        </div>
      </div>
    </section>
  );
}

function DonutLegend({ cls, pct, amount }: { cls: AbcClass; pct: number; amount: number }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: CLASS_COLOR[cls] }}
      />
      <div className="flex-1">
        <div className="font-semibold text-[#2C2C2A]">
          {`${cls} 類 ${pct.toFixed(1)}%`}
        </div>
        <div className="text-[11px] text-[#9A9890]">{fmtNT(amount)}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Period Compare — 本期 vs 上次（用 prev_class）
// ──────────────────────────────────────────────────────────────────────────

function PeriodCompareCard({ pc }: { pc: AbcStructurePeriodCompare }) {
  const curTotal = pc.current.A + pc.current.B + pc.current.C;
  const prevTotal = pc.prev.A + pc.prev.B + pc.prev.C;
  // unclassified 不算進「上期 stacked」分母，避免視覺被空白格洗掉
  const pairs: {
    label: string;
    total: number;
    A: number;
    B: number;
    C: number;
  }[] = [
    { label: "上次重跑", total: prevTotal, A: pc.prev.A, B: pc.prev.B, C: pc.prev.C },
    { label: "本期", total: curTotal, A: pc.current.A, B: pc.current.B, C: pc.current.C },
  ];
  const maxTotal = Math.max(curTotal, prevTotal, 1);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          ABC 結構：本期 vs 上次重跑
        </span>
        <span className="text-[11px] text-[#9A9890]">
          {pc.prev.unclassified > 0 ? `上次未分類 ${pc.prev.unclassified}` : null}
        </span>
      </header>
      <div className="px-4 py-4 space-y-3">
        {prevTotal === 0 && curTotal === 0 ? (
          <div className="text-[12px] text-[#9A9890] text-center py-6">
            尚無資料
          </div>
        ) : (
          <>
            <div className="flex items-end gap-4 h-[110px]">
              {pairs.map((p) => (
                <div key={p.label} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full flex flex-col-reverse rounded overflow-hidden border border-[#EEECE6]"
                    style={{ height: `${(p.total / maxTotal) * 100}%`, minHeight: 4 }}
                  >
                    {/* 由下往上：A → B → C；視覺上 A 在底 */}
                    {p.A > 0 ? (
                      <div
                        title={`A: ${p.A}`}
                        style={{
                          flex: p.A,
                          background: CLASS_COLOR.A,
                        }}
                      />
                    ) : null}
                    {p.B > 0 ? (
                      <div
                        title={`B: ${p.B}`}
                        style={{
                          flex: p.B,
                          background: CLASS_COLOR.B,
                        }}
                      />
                    ) : null}
                    {p.C > 0 ? (
                      <div
                        title={`C: ${p.C}`}
                        style={{
                          flex: p.C,
                          background: CLASS_COLOR.C,
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="text-[11px] text-[#5A5955]">{p.label}</div>
                  <div className="text-[10px] text-[#9A9890]">{`${p.total} 料號`}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 text-[11px] text-[#5A5955]">
              <LegendBox cls="A" /> <LegendBox cls="B" /> <LegendBox cls="C" />
            </div>
            <div className="text-[10.5px] text-[#9A9890]">
              v1：兩期比較（本次 vs 上次重跑）。近 6 個月月度趨勢待 ABC 月度快照表落地後啟用。
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function LegendBox({ cls }: { cls: AbcClass }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-sm"
        style={{ background: CLASS_COLOR[cls] }}
      />
      {`${cls} 類`}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Changes — prev != cur diff 列表
// ──────────────────────────────────────────────────────────────────────────

function ChangesCard({ changes }: { changes: AbcStructureChangeRow[] }) {
  const top = changes.slice(0, 20);
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          本次分類變動記錄
        </span>
        <span className="text-[11px] text-[#9A9890]">
          {`${changes.length} 件變動`}
          {changes.length > top.length ? `（顯示前 ${top.length}）` : null}
        </span>
      </header>
      <div className="overflow-x-auto">
        {top.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-[#9A9890]">
            本次重跑無分類變動
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F7F4]">
              <tr className="text-[11px] text-[#9A9890]">
                <th className="text-left font-medium px-3 py-2 border-b border-[#EEECE6]">料號</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#EEECE6]">品名</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#EEECE6]">原分類</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#EEECE6]">新分類</th>
                <th className="text-left font-medium px-3 py-2 border-b border-[#EEECE6]">變動方向</th>
                <th className="text-right font-medium px-3 py-2 border-b border-[#EEECE6]">12M 金額</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <tr key={c.item_id} className="border-b border-[#EEECE6] last:border-b-0 hover:bg-[#F8F7F4]">
                  <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">{c.item_code}</td>
                  <td className="px-3 py-2 text-[#2C2C2A]">{c.item_name}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${CLASS_CHIP[c.prev_class]}`}>
                      {c.prev_class}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${CLASS_CHIP[c.abc_class]}`}>
                      {c.abc_class}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {c.direction === "up" ? (
                      <span className="text-[#3B6D11]">▲ 銷量提升</span>
                    ) : (
                      <span className="text-[#CC0000]">▼ 銷量下降</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#2C2C2A]">
                    {fmtNT(c.output_amount_12m)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Footer pills
// ──────────────────────────────────────────────────────────────────────────

function FooterPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
    >
      {label}
    </Link>
  );
}
