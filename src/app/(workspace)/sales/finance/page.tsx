"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const GOLD = "#C9A84C";
const NAVY = "#1A1A2E";
const GREEN = "#1B6D30";

interface Plan {
  id: string;
  name: string;
  subtitle: string;
  rateMin: number;
  rateMax: number;
  terms: number[];
  activeTerm?: number;
  img: string;
}

const plans: Plan[] = [
  {
    id: "horun",
    name: "和潤企業",
    subtitle: "專屬豪華重機融資專案",
    rateMin: 2.5,
    rateMax: 3.5,
    terms: [24, 36, 48, 60],
    activeTerm: 48,
    img: "/bikes/hero/lifestyle-2.jpg",
  },
  {
    id: "yulon",
    name: "裕融企業",
    subtitle: "彈性還款優惠計畫",
    rateMin: 2.8,
    rateMax: 3.8,
    terms: [36, 48, 60],
    img: "/bikes/hero/hero-4.jpg",
  },
  {
    id: "taishin",
    name: "台新銀行",
    subtitle: "銀行信用貸款專案",
    rateMin: 2.6,
    rateMax: 3.6,
    terms: [24, 36, 48],
    img: "/bikes/hero/hero-2.jpg",
  },
];

export default function FinancePage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "金融服務" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#F5F2FF] min-h-[calc(100dvh-4rem)] p-6 md:p-10">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── Left: Plan Selection ── */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold font-display" style={{ color: NAVY }}>
              金融方案選擇
            </h2>
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${GOLD}1A`, color: GOLD }}
            >
              3 個可用方案
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {plans.map((plan, i) => {
              const isSelected = i === 0;
              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-2xl p-6 transition-all duration-200 ${
                    isSelected
                      ? "ring-2 shadow-xl"
                      : "hover:shadow-md hover:-translate-y-0.5 cursor-pointer border border-slate-100"
                  }`}
                  style={isSelected ? { boxShadow: `0 0 0 2px ${GOLD}, 0 8px 32px ${GOLD}22` } : {}}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                        <img
                          src={plan.img}
                          alt={plan.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <h3 className="font-bold text-base font-display" style={{ color: NAVY }}>
                          {plan.name}
                        </h3>
                        <p className="text-xs text-slate-500">{plan.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 mb-0.5">利率範圍</div>
                      <div className="text-sm font-bold" style={{ color: GOLD }}>
                        {plan.rateMin}% ~ {plan.rateMax}%
                      </div>
                    </div>
                  </div>

                  {/* Terms */}
                  <div className="flex items-center gap-2 mb-5">
                    {plan.terms.map((t) => {
                      const isActive = t === plan.activeTerm;
                      return (
                        <span
                          key={t}
                          className="text-[11px] px-2.5 py-1 rounded-lg font-medium"
                          style={
                            isActive
                              ? { backgroundColor: NAVY, color: "white" }
                              : { backgroundColor: "#EFECFF", color: "#47464C" }
                          }
                        >
                          {t}期
                        </span>
                      );
                    })}
                  </div>

                  {/* CTA */}
                  <button
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={
                      isSelected
                        ? { backgroundColor: NAVY, color: "white" }
                        : { backgroundColor: "#EFECFF", color: NAVY }
                    }
                  >
                    {isSelected ? "✓ 已選擇此方案" : "選擇此方案"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Right: Calculator Result ── */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          <h2 className="text-xl font-bold font-display" style={{ color: NAVY }}>
            試算結果
          </h2>

          {/* Result card */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
            {/* Dark header */}
            <div
              className="p-8"
              style={{
                background: `linear-gradient(135deg, ${NAVY} 0%, #0F0F2E 100%)`,
                color: "white",
              }}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span
                    className="text-[10px] font-bold tracking-widest uppercase block mb-1.5"
                    style={{ color: GOLD }}
                  >
                    Selected Plan
                  </span>
                  <h3 className="text-2xl font-bold font-display leading-tight">
                    和潤企業 － 豪華車融資
                  </h3>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <span className="text-xs text-slate-400 block mb-1">月付金額</span>
                  <span
                    className="text-4xl font-extrabold font-display"
                    style={{ color: GOLD }}
                  >
                    NT$&nbsp;36,458
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-5 border-t border-white/10">
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">利率（固定）</p>
                  <p className="text-2xl font-bold font-display">2.8%</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400 mb-1">總利息支出</p>
                  <p className="text-2xl font-bold font-display">NT$ 100,984</p>
                </div>
              </div>
            </div>

            {/* Inputs */}
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    貸款金額
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                      NT$
                    </span>
                    <input
                      className="w-full pl-11 pr-4 py-3 bg-[#F5F2FF] rounded-xl text-base font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 transition-all"
                      style={{ "--tw-ring-color": GOLD } as React.CSSProperties}
                      defaultValue="1,650,000"
                      type="text"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    期數（月）
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-[#F5F2FF] rounded-xl text-base font-bold text-[#1A1A2E] focus:outline-none focus:ring-2 appearance-none cursor-pointer"
                    style={{ "--tw-ring-color": GOLD } as React.CSSProperties}
                    defaultValue="48"
                  >
                    {[24, 36, 48, 60].map((m) => (
                      <option key={m} value={m}>
                        {m} 期
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dealer rebate */}
              <div
                className="flex items-center justify-between p-4 rounded-xl border-l-4"
                style={{
                  backgroundColor: `${GOLD}0D`,
                  borderLeftColor: GOLD,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="material-symbols-outlined text-lg"
                    style={{
                      color: GOLD,
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    lock
                  </span>
                  <span className="text-sm font-medium" style={{ color: GOLD }}>
                    經銷商專用資訊
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: NAVY }}>
                  經銷商退佣：NT$ 15,000
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 pt-2">
                <button
                  className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: GREEN }}
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  確認方案
                </button>
                <button className="flex-1 py-3.5 rounded-xl text-sm font-bold text-[#1A1A2E] flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-base">refresh</span>
                  重新試算
                </button>
              </div>
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-100">
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: GOLD, fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  徵信建議
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                王先生具備優質信用評等，建議可嘗試爭取更低首付方案以增加成交機率。
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100">
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: GOLD, fontVariationSettings: "'FILL' 1" }}
                >
                  receipt_long
                </span>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  稅金參考
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                Panigale V4 S 年繳牌照稅 NT$ 11,230，燃料費 NT$ 6,210，合計 NT$ 17,440。
              </p>
            </div>
          </div>

          {/* Amortization preview */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">
            <h4 className="text-sm font-bold font-display mb-4" style={{ color: NAVY }}>
              分期攤還預覽
            </h4>
            <div className="grid grid-cols-4 gap-3">
              {[
                { period: "第 1 期", principal: "28,840", interest: "7,618", total: "36,458" },
                { period: "第 12 期", principal: "29,488", interest: "6,970", total: "36,458" },
                { period: "第 24 期", principal: "30,306", interest: "6,152", total: "36,458" },
                { period: "第 48 期", principal: "36,288", interest: "170", total: "36,458" },
              ].map((row) => (
                <div key={row.period} className="bg-[#F5F2FF] rounded-xl p-4 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">{row.period}</p>
                  <p className="text-base font-extrabold font-display" style={{ color: NAVY }}>
                    {row.total}
                  </p>
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[10px] text-slate-400">本金 {row.principal}</p>
                    <p className="text-[10px] text-slate-400">利息 {row.interest}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
