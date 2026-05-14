"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type { SalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import type {
  Period,
  RsKey,
  RsMetrics,
  ViewRole,
  HabcBreakdown,
} from "@/domain/sales-manager-funnel.constants";
import { PERIOD_LABEL } from "@/domain/sales-manager-funnel.constants";

// 數值工具
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

// 達標狀態色票
function statusFor(actual: number, target: number) {
  if (actual >= target)         return { tone: "good" as const, color: "#0F6E56", bg: "#E1F5EE", border: "#5DCAA5", label: "✅ 達標" };
  if (actual >= target * 0.8)   return { tone: "warn" as const, color: "#854F0B", bg: "#FDF3E3", border: "#F0C97E", label: `落後 ${target - actual}%` };
  return                              { tone: "alert" as const, color: "#C8001A", bg: "#FDECEA", border: "#F5AEAD", label: `落後 ${target - actual}%` };
}

export default function SalesManagerFunnelBoard({ data }: { data: SalesManagerFunnelData }) {
  useSetPageHeader({
    title: "RS_M1 銷售漏斗看板",
    breadcrumb: [{ label: "主管工作台" }, { label: "銷售漏斗" }],
    hideSearch: true,
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

  // 當前顯示的資料：個人視角強制鎖在 lin
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

  const layer2Items = [
    { key: "build", label: "建檔完整率", value: buildRate, target: data.kpiTargets.build },
    { key: "trial", label: "試乘試駕率", value: trialRate, target: data.kpiTargets.trial },
    { key: "quote", label: "報價轉化率", value: quoteRate, target: data.kpiTargets.quote },
    { key: "order", label: "訂車成交率", value: orderRate, target: data.kpiTargets.order },
  ];

  const isAll = effectiveRsKey === "all";

  return (
    <main className="px-6 py-5 space-y-4" data-testid="sales-manager-funnel-page">
      {/* Sub bar：視角 / RS / 期間 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
        {/* 視角切換 */}
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

        {/* RS 下拉 */}
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

        {/* 期間切換 */}
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
        </div>
      </section>

      {/* 視角 banner */}
      <div
        className="rounded-lg px-4 py-2.5 text-[12.5px] border"
        style={
          role === "manager"
            ? { background: "#EAF4FB", borderColor: "#85B7EB", color: "#185FA5" }
            : { background: "#EEEDFE", borderColor: "#AFA9EC", color: "#534AB7" }
        }
      >
        {role === "manager"
          ? <>🏢 <b>主管視角</b>　顯示{isAll ? "全店匯總" : `RS ${m.name}`} · {PERIOD_LABEL[period]} · 可比較跨 RS 績效</>
          : <>👤 <b>個人視角</b>　顯示 {m.name} · {PERIOD_LABEL[period]} · 跟全店平均對標（Phase 2 規劃中）</>
        }
      </div>

      {/* Layer 1 — 結果指標 */}
      <LayerHeader index={1} title="結果指標" subtitle="給主管看的最終成績" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: "本月成交台數", value: m.deliveries, unit: "台", target: data.kpiTargets.deliveries },
          { label: "整體成交率",   value: closeRate, unit: "%", target: data.kpiTargets.closeRate },
          { label: "本月報價單數", value: m.quotes, unit: "張", target: null },
          { label: "本月訂車台數", value: m.orders, unit: "台", target: data.kpiTargets.ordersAbs },
        ].map((k) => {
          const sty = k.target != null ? statusFor(k.value, k.target) : null;
          return (
            <div
              key={k.label}
              className="bg-white border rounded-lg px-3.5 py-3"
              style={{ borderColor: sty?.border ?? "#EEECE6" }}
              data-testid="sales-manager-funnel-layer1-kpi"
            >
              <div className="text-[10.5px] text-[#9A9890] mb-1">{k.label}</div>
              <div
                className="text-[22px] font-bold font-mono leading-none mb-1"
                style={{ color: sty?.color ?? "#1A3A5C" }}
              >
                {k.value}
                <span className="text-[12px] font-normal ml-1 opacity-60">{k.unit}</span>
              </div>
              {k.target != null && sty ? (
                <div className="text-[10.5px] flex items-center gap-1.5">
                  <span className="text-[#9A9890]">目標 {k.target}{k.unit}</span>
                  <span style={{ color: sty.color, fontWeight: 600 }}>{sty.label}</span>
                </div>
              ) : (
                <div className="text-[10.5px] text-[#9A9890]">—</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Layer 2 — 過程指標 */}
      <LayerHeader index={2} title="過程指標" subtitle="給銷售主管看的轉化率（含目標達成）" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {layer2Items.map((it) => {
          const sty = statusFor(it.value, it.target);
          const widthPct = Math.min(100, it.value);
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => showToast(`PULS 診斷 — Phase 2 規劃中（${it.label}）`)}
              className="text-left bg-white border rounded-lg px-3.5 py-3 hover:shadow-md transition-all"
              style={{ borderColor: sty.border, background: sty.bg }}
              data-testid={`sales-manager-funnel-layer2-${it.key}`}
            >
              <div className="text-[11px] font-semibold text-[#5A5955] mb-2">{it.label}</div>
              <div className="flex items-baseline gap-1 mb-2">
                <div className="text-[24px] font-bold font-mono leading-none" style={{ color: sty.color }}>
                  {it.value}
                </div>
                <div className="text-[11px]" style={{ color: sty.color }}>% / 目標 {it.target}%</div>
              </div>
              <div className="h-2 bg-white/70 rounded-full overflow-hidden mb-1.5 relative">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${widthPct}%`, background: sty.color }}
                />
                {/* target 標記線 */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-[#1A3A5C]"
                  style={{ left: `${Math.min(100, it.target)}%` }}
                />
              </div>
              <div className="text-[10.5px]" style={{ color: sty.color, fontWeight: 600 }}>
                {sty.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Layer 3 — 原始數據 */}
      <LayerHeader index={3} title="原始數據" subtitle="行為導向的累積數" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[
          { label: "到店人次", value: m.contacts, unit: "人次" },
          { label: "電子手卡建檔", value: m.builds, unit: "筆" },
          { label: "試乘試駕次數", value: m.trials, unit: "次" },
          { label: "HABC 高意願客", value: m.habc.H + m.habc.A, unit: "位", sub: "H+A 級潛客" },
          { label: "本月有效跟進", value: Math.round(m.orders * 3.2), unit: "次", sub: "電訪+邀約" },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-white border border-[#EEECE6] rounded-lg px-3.5 py-3"
            data-testid="sales-manager-funnel-layer3-kpi"
          >
            <div className="text-[10.5px] text-[#9A9890] mb-1">{k.label}</div>
            <div className="text-[20px] font-bold font-mono text-[#185FA5] leading-none mb-0.5">
              {k.value}
              <span className="text-[11px] font-normal ml-1 opacity-60">{k.unit}</span>
            </div>
            {k.sub && <div className="text-[10.5px] text-[#9A9890]">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* 漏斗視覺 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="sales-manager-funnel-funnel">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#EAF4FB]">🔻</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">銷售漏斗</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">六階段轉化 · {PERIOD_LABEL[period]}</div>
          </div>
        </header>
        <div className="px-4 py-4 space-y-2">
          {data.funnelStages.map((stage, i) => {
            const v = m[stage.key as keyof typeof m] as number;
            const prev = i === 0 ? null : (m[data.funnelStages[i - 1].key as keyof typeof m] as number);
            const rate = prev != null && prev > 0 ? Math.round((v / prev) * 100) : null;
            const widthPct = m.contacts > 0 ? Math.max(8, Math.round((v / m.contacts) * 100)) : 0;
            return (
              <div key={stage.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">{stage.icon}</span>
                    <span className="text-[12.5px] font-semibold text-[#2C2C2A]">{stage.label}</span>
                    {rate != null && (
                      <span
                        className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          background: rate >= 70 ? "#E1F5EE" : rate >= 50 ? "#FDF3E3" : "#FDECEA",
                          color:      rate >= 70 ? "#0F6E56" : rate >= 50 ? "#854F0B" : "#C8001A",
                        }}
                      >
                        ↓ {rate}%
                      </span>
                    )}
                  </div>
                  <span className="text-[14px] font-bold font-mono text-[#2C2C2A]">
                    {v.toLocaleString()}
                  </span>
                </div>
                <div className="relative h-8 bg-[#F8F7F4] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500 flex items-center pl-3"
                    style={{ width: `${widthPct}%`, background: stage.color }}
                  >
                    <span className="text-white text-[11px] font-bold opacity-90 whitespace-nowrap">
                      {v.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* RS 比較表（僅主管視角 + 全店模式） */}
      {role === "manager" && isAll && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="sales-manager-funnel-rs-table">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
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
                  {["RS", "到店", "建檔", "試駕", "報價", "訂車", "交車", "成交率"].map((h) => (
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
                {data.rsList.map((r) => {
                  const closeR = pctN(r.deliveries, r.contacts);
                  const closeSty = statusFor(closeR, data.kpiTargets.closeRate);
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
                          style={{ background: closeSty.bg, color: closeSty.color }}
                        >
                          {closeR}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 客群畫像 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-testid="sales-manager-funnel-tags">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="text-[15px] w-[30px] h-[30px] rounded-md flex items-center justify-center bg-[#EEEDFE]">🎯</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">客群畫像</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">本月潛客標籤分布 × 成交率｜標籤由 RS_M3 主管設定管理</div>
          </div>
        </header>
        <div className="px-4 py-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {data.tagGroups.map((grp) => {
            const grpTotal = grp.tags.reduce((s, t) => s + t.count, 0);
            const grpClosed = grp.tags.reduce((s, t) => s + t.closed, 0);
            const grpRate = grpTotal > 0 ? Math.round((grpClosed / grpTotal) * 100) : 0;
            const maxCount = Math.max(...grp.tags.map((t) => t.count));
            return (
              <div
                key={grp.key}
                className="rounded-lg p-3.5"
                style={{ background: grp.bg, border: `1.5px solid ${grp.border}` }}
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
      </section>

      {/* Phase 2 規劃中區塊 */}
      <section
        className="bg-white border border-dashed border-[#D5D3CB] rounded-lg px-4 py-4"
        data-testid="sales-manager-funnel-phase2"
      >
        <div className="text-[12.5px] font-semibold text-[#5A5955] mb-2">📅 Phase 2 規劃中</div>
        <ul className="text-[11.5px] text-[#9A9890] space-y-1 list-disc list-inside">
          <li>PULS 4 步診斷工作流（點 Layer 2 KPI 展開）</li>
          <li>趨勢圖（近 12 週銷售漏斗變化）</li>
          <li>接口品質指標（電子手卡 / 標籤 / 試駕資料完整度）</li>
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
    </main>
  );
}

function LayerHeader({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-1">
      <span
        className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full text-[11.5px] font-bold text-white"
        style={{ background: "#1A3A5C" }}
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
