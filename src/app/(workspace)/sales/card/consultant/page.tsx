"use client";

import Link from "next/link";
import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";

const PURCHASE_TIMINGS = ["本月", "次月", "季後", "年後", "未定"] as const;

const COMPETITOR_BRANDS = [
  "BMW Motorrad", "KTM", "Aprilia", "Honda", "Kawasaki",
  "Yamaha", "Triumph", "Harley-Davidson", "Royal Enfield", "其他",
];

const DUCATI_MODELS = [
  "Panigale V4 S", "Multistrada V4", "Monster SP", "Diavel V4",
  "Streetfighter V4", "Hypermotard 950", "DesertX", "Scrambler Icon",
];

const PURCHASE_TYPES = [
  { key: "首購", icon: "star", sub: "首部杜卡迪" },
  { key: "換購", icon: "published_with_changes", sub: "升級/汰舊" },
  { key: "增購", icon: "add_circle", sub: "收藏/不同用途" },
  { key: "重購", icon: "repeat", sub: "品牌忠實客戶" },
] as const;

const GRADE_HINTS = [
  { cond: "購買時機「本月」或「次月」", hint: "→ 建議 A～B 級（高購買意向）", color: "text-orange-600" },
  { cond: "購買時機「季後」或「年後」", hint: "→ 建議 B～C 級（中購買意向）", color: "text-yellow-600" },
  { cond: "客戶有提到競品車型", hint: "→ 建議提升一級（已是 H 級則不變）", color: "text-blue-600" },
  { cond: "客戶未提或拒談競品", hint: "→ 建議維持或降一級（已是 D 級則不變）", color: "text-slate-500" },
  { cond: "購買時機「未定」", hint: "→ 建議 D 級", color: "text-slate-500" },
  { cond: "完成第三階段報價環節", hint: "→ 建議提升一級（已是 H 級則不變）", color: "text-emerald-600" },
  { cond: "未進行報價即結案", hint: "→ 建議維持或降一級（已是 D 級則不變）", color: "text-slate-400" },
];

export default function ConsultantPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "手卡・第二階段" },
    ],
  });

  const [transmission, setTransmission] = useState("往復式");
  const [equipLevel, setEquipLevel] = useState("S");
  const [purchaseType, setPurchaseType] = useState("換購");
  const [tradeInTiming, setTradeInTiming] = useState("本月內");
  const [tradeInDone, setTradeInDone] = useState(true);
  const [intendedModel, setIntendedModel] = useState("Multistrada V4");
  const [paymentMethod, setPaymentMethod] = useState("分期貸款");
  const [grade, setGrade] = useState("A");

  // ④ 新增欄位
  const [purchaseTiming, setPurchaseTiming] = useState("");
  const [hasCompetitor, setHasCompetitor] = useState<boolean | null>(null);
  const [competitorBrand, setCompetitorBrand] = useState("");
  const [competitorModel, setCompetitorModel] = useState("");
  const [competitorNotes, setCompetitorNotes] = useState("");

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex flex-col">
      <CardStepBar currentStep={2} />
      <main className="flex-1 pb-8 px-8">
        <div className="max-w-5xl mx-auto pt-8">

          {/* ── 頁首 ── */}
          <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-3">
            <div>
              <h1 className="text-2xl font-display font-extrabold text-on-surface tracking-tight">
                客戶接待手卡 — 第二階段
              </h1>
              <p className="text-outline text-sm mt-0.5">接待三步法 ‧ 步驟二：需求諮詢與客戶評級</p>
            </div>
            <div className="flex gap-5 text-[0.75rem] font-medium bg-surface-container-low px-5 py-2.5 rounded-full shrink-0">
              <div className="flex gap-2 items-center">
                <span className="text-outline">手卡編號:</span>
                <span className="text-on-surface font-display">DU-20260501-001</span>
              </div>
              <div className="w-px h-4 bg-outline-variant self-center" />
              <div className="flex gap-2 items-center">
                <span className="text-outline">接待人員:</span>
                <span className="text-on-surface font-bold">林佳蓉</span>
              </div>
            </div>
          </div>

          <div className="space-y-8">

            {/* ── 現有車輛資料 ── */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-[0_4px_20px_rgba(26,26,46,0.04)] border border-transparent">
              <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                現有車輛資料
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">品牌</label>
                  <select className="w-full bg-surface-container-low border-0 rounded-lg py-3 px-4 focus:ring-1 focus:ring-tertiary-container/40 transition-all">
                    <option>請選擇品牌</option>
                    <option>DUCATI</option>
                    <option>BMW Motorrad</option>
                    <option>KTM</option>
                    <option>Aprilia</option>
                    <option>Honda</option>
                    <option>Kawasaki</option>
                    <option>Yamaha</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">車型</label>
                  <input className="w-full bg-surface-container-low border-0 rounded-lg py-3 px-4 focus:ring-1 focus:ring-tertiary-container/40 transition-all" placeholder="例如：Monster 821" type="text" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">顏色</label>
                  <input className="w-full bg-surface-container-low border-0 rounded-lg py-3 px-4 focus:ring-1 focus:ring-tertiary-container/40 transition-all" placeholder="輸入車色" type="text" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">排檔/變速系統</label>
                  <div className="flex bg-surface-container-low p-1 rounded-lg">
                    {["往復式", "快排/電子"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTransmission(t)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                          transmission === t ? "bg-white shadow-sm text-on-surface" : "text-on-surface/60 hover:text-on-surface"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">配備等級</label>
                  <div className="flex gap-2">
                    {["Standard", "S", "SP/R"].map((lv) => (
                      <button
                        key={lv}
                        onClick={() => setEquipLevel(lv)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          equipLevel === lv ? "bg-tertiary-container text-white" : "bg-surface-container-high hover:bg-tertiary-container hover:text-white"
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">車齡</label>
                  <div className="flex items-center gap-2 bg-surface-container-low rounded-lg px-4 py-3 focus-within:ring-1 focus-within:ring-tertiary-container/40">
                    <input className="flex-1 bg-transparent border-0 outline-none text-sm min-w-0" type="text" inputMode="numeric" placeholder="0" />
                    <span className="text-on-surface/40 font-medium text-sm shrink-0">年</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">里程</label>
                  <div className="flex items-center gap-2 bg-surface-container-low rounded-lg px-4 py-3 focus-within:ring-1 focus-within:ring-tertiary-container/40">
                    <input className="flex-1 bg-transparent border-0 outline-none text-sm min-w-0" type="text" inputMode="numeric" placeholder="0" />
                    <span className="text-on-surface/40 font-medium text-sm shrink-0">公里</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 初步分析 ── */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-[0_4px_20px_rgba(26,26,46,0.04)] border border-transparent">
              <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                初步分析
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                {PURCHASE_TYPES.map((pt) => (
                  <button
                    key={pt.key}
                    onClick={() => setPurchaseType(pt.key)}
                    className={`group p-6 rounded-xl border-2 transition-all text-left ${
                      purchaseType === pt.key
                        ? "bg-primary-container border-tertiary-container"
                        : "bg-surface-container-low border-transparent hover:border-tertiary-container"
                    }`}
                  >
                    <span className={`material-symbols-outlined text-3xl mb-4 ${purchaseType === pt.key ? "text-[#C9A84C]" : "text-tertiary-container"}`}>
                      {pt.icon}
                    </span>
                    <div className={`font-bold ${purchaseType === pt.key ? "text-white" : "text-on-surface"}`}>{pt.key}</div>
                    <div className={`text-xs mt-1 ${purchaseType === pt.key ? "text-[#F5F2FF]/60" : "text-on-surface/60"}`}>{pt.sub}</div>
                  </button>
                ))}
              </div>

              <div className="bg-surface-container-low/50 rounded-lg p-6 flex flex-col md:flex-row gap-10 border-l-4 border-tertiary-container">
                <div className="space-y-4">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">置換時機</label>
                  <div className="flex gap-3">
                    {["本月內", "次月", "未定"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTradeInTiming(t)}
                        className={`px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                          tradeInTiming === t ? "bg-tertiary-container text-white" : "bg-surface-container-high hover:bg-tertiary-container/10"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 跳轉置換評估 — 先於 toggle 出現 */}
                <div className="space-y-4">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">跳轉置換評估</label>
                  <Link
                    href="/usedcar/evaluation"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-md hover:bg-amber-600 active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">swap_horiz</span>
                    前往置換評估頁面
                  </Link>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">現場完成估價？</label>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${!tradeInDone ? "font-bold" : "text-on-surface/60"}`}>否</span>
                    <button
                      onClick={() => setTradeInDone(!tradeInDone)}
                      className={`relative w-14 h-8 rounded-full p-1 transition-colors ${tradeInDone ? "bg-tertiary-container" : "bg-surface-container-high"}`}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-200 ${tradeInDone ? "translate-x-6" : "translate-x-0"}`} />
                    </button>
                    <span className={`text-sm ${tradeInDone ? "font-bold" : "text-on-surface/60"}`}>是</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── ④ 購買時機與競品資訊（新增）── */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-[0_4px_20px_rgba(26,26,46,0.04)] border border-transparent">
              <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                購買時機與競品資訊
              </h2>
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">購買時機</label>
                  <div className="flex flex-wrap gap-3">
                    {PURCHASE_TIMINGS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setPurchaseTiming(purchaseTiming === t ? "" : t)}
                        className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                          purchaseTiming === t
                            ? "bg-primary-container text-white ring-2 ring-tertiary-container/40"
                            : "bg-surface-container-high hover:bg-tertiary-container/10"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">有無考慮競品車型？</label>
                  <div className="flex gap-3">
                    {([true, false] as const).map((v) => (
                      <button
                        key={String(v)}
                        onClick={() => setHasCompetitor(v)}
                        className={`px-8 py-2 rounded-full text-sm font-medium transition-all ${
                          hasCompetitor === v ? "bg-primary-container text-white" : "bg-surface-container-high hover:bg-tertiary-container/10"
                        }`}
                      >
                        {v ? "是" : "否"}
                      </button>
                    ))}
                  </div>
                </div>

                {hasCompetitor && (
                  <div className="space-y-6 border-l-2 border-tertiary-container/40 pl-6">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">競品品牌</label>
                      <div className="flex flex-wrap gap-2">
                        {COMPETITOR_BRANDS.map((b) => (
                          <button
                            key={b}
                            onClick={() => setCompetitorBrand(competitorBrand === b ? "" : b)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                              competitorBrand === b
                                ? "bg-primary-container text-white ring-2 ring-tertiary-container/40"
                                : "bg-surface-container-high hover:bg-tertiary-container/10"
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">競品車型</label>
                        <input
                          value={competitorModel}
                          onChange={(e) => setCompetitorModel(e.target.value)}
                          className="w-full bg-surface-container-low border-0 rounded-lg py-3 px-4 focus:ring-1 focus:ring-tertiary-container/40 transition-all"
                          placeholder="手動輸入，例如：S 1000 RR"
                          type="text"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">競商名稱</label>
                        <input
                          value={competitorNotes}
                          onChange={(e) => setCompetitorNotes(e.target.value)}
                          className="w-full bg-surface-container-low border-0 rounded-lg py-3 px-4 focus:ring-1 focus:ring-tertiary-container/40 transition-all"
                          placeholder="手動輸入競品經銷商名稱"
                          type="text"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ── 意向與級別 ── */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-[0_4px_20px_rgba(26,26,46,0.04)] border border-transparent">
              <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                意向與級別
              </h2>
              <div className="space-y-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">意向車型</label>
                  <div className="flex flex-wrap gap-2">
                    {DUCATI_MODELS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setIntendedModel(m)}
                        className={`px-6 py-3 rounded-lg text-sm font-bold border-2 transition-all ${
                          intendedModel === m
                            ? "bg-primary-container text-white border-tertiary-container shadow-lg shadow-tertiary-container/10"
                            : "border-outline-variant/30 hover:border-tertiary-container hover:text-tertiary-container"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">付款方式</label>
                  <div className="flex gap-4">
                    {["全額現金", "分期貸款", "租賃/企業"].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPaymentMethod(p)}
                        className={`px-8 py-2 rounded-full text-sm font-medium transition-colors ${
                          paymentMethod === p ? "bg-tertiary-container text-white" : "bg-surface-container-high hover:bg-tertiary-container/10"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">客戶級別</label>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: "H", sub: "HOT", cls: "bg-red-700 text-white",                             onCls: "ring-4 ring-red-600/60 scale-110 shadow-xl" },
                      { key: "A", sub: "",    cls: "bg-red-500 text-white",                              onCls: "ring-4 ring-red-400/60 scale-110 shadow-xl" },
                      { key: "B", sub: "",    cls: "bg-orange-500 text-white",                           onCls: "ring-4 ring-orange-400/60 scale-110 shadow-xl" },
                      { key: "C", sub: "",    cls: "bg-yellow-400 text-on-surface",                      onCls: "ring-4 ring-yellow-300/80 scale-110 shadow-xl" },
                      { key: "D", sub: "",    cls: "bg-secondary-container text-on-secondary-container", onCls: "ring-4 ring-slate-400/60 scale-110 shadow-xl" },
                    ].map((g) => (
                      <button
                        key={g.key}
                        onClick={() => setGrade(g.key)}
                        className={`w-20 h-20 rounded-xl ${g.cls} flex flex-col items-center justify-center shadow-md transition-all duration-200 px-2 ${
                          grade === g.key ? g.onCls : "hover:scale-105"
                        }`}
                      >
                        <span className="text-2xl font-black leading-none">{g.key}</span>
                        {g.sub && <span className="text-[10px] opacity-80 mt-0.5">{g.sub}</span>}
                      </button>
                    ))}
                  </div>

                  {/* A 級即時提示 */}
                  {grade === "A" && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                      <span className="material-symbols-outlined text-amber-600 text-xl mt-0.5">warning</span>
                      <div>
                        <p className="text-sm font-bold text-amber-800">建議降為 B 級</p>
                        <p className="text-xs text-amber-700 mt-0.5">A 級代表「明確購買意向，尚需試駕確認」。若尚未安排試駕，建議先評為 B 級，試駕後視情況再提升。</p>
                      </div>
                    </div>
                  )}

                  {/* ⑤ 級別判斷提示說明 */}
                  <div className="bg-surface-container-low rounded-lg p-4 space-y-2">
                    <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-tertiary-container">info</span>
                      級別判斷參考
                    </div>
                    {GRADE_HINTS.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-on-surface/30 mt-0.5 shrink-0">•</span>
                        <span>
                          <span className="font-medium text-on-surface/80">{h.cond}</span>
                          <span className={`ml-1 font-bold ${h.color}`}>{h.hint}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-[#1A1A2E]/10 px-12 py-4 flex justify-between items-center mt-8">
        <Link
          href="/sales/card/counter"
          className="flex items-center gap-2 text-[#47464C] font-bold hover:text-[#00000b] transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span> 上一步
        </Link>
        <Link
          href="/sales/card/closing"
          className="bg-gradient-to-br from-[#00000B] to-[#1A1A2E] text-white px-10 py-4 rounded-xl font-bold flex items-center gap-3 shadow-xl hover:opacity-90 active:scale-95 transition-all duration-300"
        >
          下一步：試騎與報價 <span className="material-symbols-outlined">arrow_forward</span>
        </Link>
      </footer>
    </div>
  );
}
