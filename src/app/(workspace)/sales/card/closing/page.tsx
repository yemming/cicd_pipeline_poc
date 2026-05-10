"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";

export default function ClosingPage() {
  const router = useRouter();
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "手卡・第三階段" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex flex-col">
      <CardStepBar currentStep={3} />

      {/* ── 主要內容 ── */}
      <main className="flex-1 py-8 px-6">
        <div className="max-w-5xl mx-auto">
        {/* ── 頁首 ── */}
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-display font-extrabold text-on-surface tracking-tight">
              客戶接待手卡 — 第三階段
            </h1>
            <p className="text-outline text-sm mt-0.5">接待三步法 ‧ 步驟三：試駕體驗與成交確認</p>
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

        <div className="grid grid-cols-12 gap-6">
          {/* ── Section 1：試乘試駕 (col-span-8) ── */}
          <section className="col-span-8 bg-white p-8 rounded-xl shadow-sm border border-[#1A1A2E]/5 space-y-6">
            <div className="flex items-center justify-between border-b border-[#EFECFF] pb-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#755b00]">sports_motorsports</span>
                <h2 className="text-xl font-bold">1. 試乘試駕</h2>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <span className="mr-3 text-sm font-medium text-[#47464C]">是否安排試駕？</span>
                <input defaultChecked className="sr-only peer" type="checkbox" readOnly />
                <div className="relative w-11 h-6 bg-[#E2E0FC] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C9A84C]" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase tracking-wider">車型選擇</label>
                  <select className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 text-[#1A1A2E] focus:ring-1 focus:ring-[#C9A84C]/40">
                    <option>Ducati Panigale V4 S</option>
                    <option>Ducati Multistrada V4 Pikes Peak</option>
                    <option>Ducati Streetfighter V4 SP2</option>
                    <option>Ducati DesertX</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase tracking-wider">試駕車輛車牌</label>
                    <div className="bg-[#F5F2FF] rounded-lg p-3 font-mono font-bold text-[#1A1A2E]">MOTO-8899</div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase tracking-wider">出發時間</label>
                    <div className="bg-[#F5F2FF] rounded-lg p-3 font-medium text-[#1A1A2E]">14:32</div>
                  </div>
                </div>
              </div>

              {/* 計時器卡片 */}
              <div className="bg-[#1A1A2E] rounded-xl p-6 text-white flex flex-col justify-center items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-3xl -mr-16 -mt-16" />
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] tracking-[0.2em] font-bold text-red-400 uppercase">Ride in progress</span>
                </div>
                <div className="text-5xl font-extrabold tracking-tighter">00:23:45</div>
                <button className="bg-red-600 text-white px-8 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-red-700 transition-colors">
                  <span className="material-symbols-outlined text-sm">stop</span> 結束試駕
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button className="px-4 py-2 rounded-full bg-[#E2E0FC] text-[#47464C] text-sm font-medium hover:bg-[#C6C4DF] transition-colors">市區路線(15min)</button>
              <button className="px-4 py-2 rounded-full bg-[#E2E0FC] text-[#47464C] text-sm font-medium hover:bg-[#C6C4DF] transition-colors">山道彎路體驗(30min)</button>
              <button className="px-4 py-2 rounded-full border border-[#C9A84C] bg-[#C9A84C]/10 text-[#755b00] text-sm font-bold">自由路線</button>
            </div>
          </section>

          {/* ── Section 2：報價紀錄 (col-span-4) ── */}
          <section className="col-span-4 bg-white p-8 rounded-xl shadow-sm border border-[#1A1A2E]/5 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-[#EFECFF] pb-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#755b00]">request_quote</span>
                <h2 className="text-xl font-bold">2. 報價紀錄</h2>
              </div>
              <input defaultChecked className="w-5 h-5 accent-[#C9A84C]" type="checkbox" readOnly />
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">試算報價 (NTD)</label>
                <div className="relative">
                  <input
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 pl-10 text-lg font-bold text-[#00000b] focus:ring-1 focus:ring-[#C9A84C]/40"
                    type="text"
                    defaultValue="1,688,000"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#47464C] font-medium">$</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">改裝配件摘要</label>
                <div className="p-3 bg-[#F5F2FF] rounded-lg text-sm text-[#1A1A2E] leading-relaxed">
                  Akrapovič 全段鈦合金排氣管、碳纖維乾式離合器外蓋、Ducati Performance 端子鏡組。
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">報價備註</label>
                <textarea
                  className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 text-sm focus:ring-1 focus:ring-[#C9A84C]/40 h-20 resize-none"
                  placeholder="輸入報價相關調整內容..."
                />
              </div>
            </div>
          </section>

          {/* ── Section 3：訂單狀態 (col-span-6) ── */}
          <section className="col-span-6 bg-white p-8 rounded-xl shadow-sm border border-[#1A1A2E]/5 space-y-6">
            <div className="flex items-center justify-between border-b border-[#EFECFF] pb-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#755b00]">contract</span>
                <h2 className="text-xl font-bold">3. 訂單狀態</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#47464C]">是否成交？</span>
                <input defaultChecked className="w-5 h-5 accent-[#C9A84C]" type="checkbox" readOnly />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">成交單號</label>
                  <div className="bg-[#F5F2FF] p-3 rounded-lg font-mono text-[#755b00] font-bold">DUC-20260411-012</div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">訂金金額</label>
                  <input
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 font-bold focus:ring-1 focus:ring-[#C9A84C]/40"
                    type="text"
                    defaultValue="100,000"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">預計交車日期</label>
                  <input
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 text-[#1A1A2E] focus:ring-1 focus:ring-[#C9A84C]/40"
                    type="date"
                    defaultValue="2026-05-20"
                  />
                </div>
                <div className="flex items-start gap-2 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  <span className="material-symbols-outlined text-yellow-700 text-sm mt-0.5">warning</span>
                  <p className="text-[10px] text-yellow-800 leading-tight">
                    提醒：此為限量車型，義大利原廠船期可能變動，請務必與客戶溝通。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 4：結案記錄 (col-span-6) ── */}
          <section className="col-span-6 bg-white p-8 rounded-xl shadow-sm border border-[#1A1A2E]/5 space-y-6">
            <div className="flex items-center justify-between border-b border-[#EFECFF] pb-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#755b00]">task_alt</span>
                <h2 className="text-xl font-bold">4. 結案記錄</h2>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-[#47464C] uppercase">離店時間</label>
                <input
                  className="bg-[#F5F2FF] border-none rounded-md px-2 py-1 text-sm"
                  type="time"
                  defaultValue="16:45"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">客戶關鍵顧慮</label>
                  <textarea
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 text-xs focus:ring-1 focus:ring-[#C9A84C]/40 h-16 resize-none"
                    placeholder="如：引擎熱度問題、後勤保養週期..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#47464C] mb-1 uppercase">後續追蹤事項</label>
                  <textarea
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-3 text-xs focus:ring-1 focus:ring-[#C9A84C]/40 h-16 resize-none"
                    placeholder="如：確認改裝品到貨時間..."
                  />
                </div>
              </div>
              <div className="bg-[#F5F2FF] rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-black text-[#1A1A2E] tracking-widest uppercase text-center border-b border-[#1A1A2E]/10 pb-2">今日接待總結</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                  <div className="flex items-center gap-2 text-xs text-[#47464C]">
                    <span className="material-symbols-outlined text-green-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>已試乘</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#47464C]">
                    <span className="material-symbols-outlined text-green-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>已報價</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#47464C]">
                    <span className="material-symbols-outlined text-green-600 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>已成交</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[#47464C]">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    <span>時長: 2h 15m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#47464C]">客戶級別:</span>
                    <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">A+</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[#47464C]">
                    <span className="material-symbols-outlined text-sm">event</span>
                    <span className="font-bold">04/15 追蹤</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        </div>
      </main>

      {/* ── Footer 操作列（非 fixed，跟著 layout 走）── */}
      <footer className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-[#1A1A2E]/10 px-12 py-4 flex justify-between items-center mt-8">
        <Link href="/sales/card/consultant" className="flex items-center gap-2 text-[#47464C] font-bold hover:text-[#00000b] transition-colors">
          <span className="material-symbols-outlined">arrow_back</span> 上一步
        </Link>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-[10px] text-[#47464C] font-bold uppercase tracking-widest">Current Status</p>
            <p className="text-sm font-bold text-[#755b00] italic">Ready for Final Submission</p>
          </div>
          <button
            onClick={() => router.push('/sales/card/record')}
            className="bg-green-600 text-white px-10 py-4 rounded-xl font-bold flex items-center gap-3 shadow-xl hover:bg-green-700 hover:scale-[1.02] transition-all duration-300"
          >
            完成手卡並前往結案 <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
