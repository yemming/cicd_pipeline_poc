"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const TABS = [
  { label: "首次離店電訪", count: 12 },
  { label: "成交電訪", count: 5 },
  { label: "休眠電訪", count: 8 },
  { label: "準戰敗電訪", count: 3 },
];

const CUSTOMERS = [
  {
    name: "林志誠",
    grade: "A",
    model: "Panigale V4 S",
    status: "待電訪",
    statusColor: "bg-orange-100 text-orange-700",
    avatar: "林",
    avatarBg: "bg-[#CC0000]/10 text-[#CC0000]",
  },
  {
    name: "王曉婷",
    grade: "B",
    model: "Monster SP",
    status: "已完成",
    statusColor: "bg-green-100 text-green-700",
    avatar: "王",
    avatarBg: "bg-[#F5F2FF] text-[#1A1A2E]",
  },
  {
    name: "張永康",
    grade: "C",
    model: "Multistrada V4 S",
    status: "無法聯繫",
    statusColor: "bg-slate-100 text-slate-500",
    avatar: "張",
    avatarBg: "bg-[#F5F2FF] text-[#1A1A2E]",
  },
  {
    name: "周美玲",
    grade: "A",
    model: "Diavel V4",
    status: "待電訪",
    statusColor: "bg-orange-100 text-orange-700",
    avatar: "周",
    avatarBg: "bg-[#CC0000]/10 text-[#CC0000]",
  },
];

export default function CrmPage() {
  useSetPageHeader({
    title: "CRM 電訪",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "CRM 電訪" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)]">
      {/* Top tabs */}
      <div className="px-8 pt-6 pb-0 flex gap-2 border-b border-[#1A1A2E]/10 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t.label}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-sm whitespace-nowrap transition-colors border-b-2 ${
              i === 0
                ? "border-[#CC0000] text-[#CC0000] bg-white"
                : "border-transparent text-[#1A1A2E]/50 hover:text-[#1A1A2E]"
            }`}
          >
            {t.label}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                i === 0 ? "bg-[#CC0000] text-white" : "bg-[#1A1A2E]/10 text-[#1A1A2E]/60"
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main grid */}
      <div className="p-8 grid grid-cols-12 gap-6 min-h-0">
        {/* Left: Customer list (col-4) */}
        <div className="col-span-4 flex flex-col gap-3">
          {CUSTOMERS.map((c) => (
            <div
              key={c.name}
              className={`bg-white rounded-2xl p-4 shadow-sm border cursor-pointer transition-all ${
                c.name === "林志誠"
                  ? "border-[#CC0000]/40 ring-1 ring-[#CC0000]/20"
                  : "border-[#1A1A2E]/8 hover:border-[#CC0000]/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${c.avatarBg}`}
                >
                  {c.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#1A1A2E] text-sm">{c.name}</p>
                    <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-1.5 py-0.5 rounded">
                      Grade {c.grade}
                    </span>
                  </div>
                  <p className="text-xs text-[#1A1A2E]/50 truncate mt-0.5">{c.model}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.statusColor}`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Customer detail (col-8) */}
        <div className="col-span-8 flex flex-col gap-4">
          {/* Header card — dark navy */}
          <div className="bg-[#1A1A2E] rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#CC0000]/20 flex items-center justify-center text-white font-bold text-xl">
                  林
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-bold text-xl">林志誠</h3>
                    <span className="text-[10px] font-bold text-[#C9A84C] bg-[#C9A84C]/20 px-2 py-0.5 rounded">
                      Grade A
                    </span>
                  </div>
                  <p className="text-white/60 text-sm mt-0.5">Panigale V4 S · 首次離店電訪</p>
                  <p className="text-white/40 text-xs mt-1">上次到店：2026-04-12 · 試乘 Panigale V4 S</p>
                </div>
              </div>
              <div className="text-right">
                <button className="inline-flex items-center gap-2 bg-[#CC0000] hover:bg-[#AA0000] text-white px-4 py-2 rounded-full font-bold text-sm transition-colors">
                  <span className="material-symbols-outlined text-base">phone</span>
                  撥打電話
                </button>
              </div>
            </div>
          </div>

          {/* Survey Form */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1A1A2E]/8">
            <h4 className="font-bold text-[#1A1A2E] text-base mb-5">電訪問卷</h4>
            <div className="space-y-6">
              {/* Q1: Star rating */}
              <div>
                <p className="text-sm font-bold text-[#1A1A2E] mb-2">
                  Q1. 對本次展廳參觀體驗的整體滿意度？
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className="material-symbols-outlined text-2xl text-[#C9A84C]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                  <span className="text-sm text-[#1A1A2E]/50 ml-2 self-center">5 / 5</span>
                </div>
              </div>

              {/* Q2: Star rating */}
              <div>
                <p className="text-sm font-bold text-[#1A1A2E] mb-2">
                  Q2. 銷售顧問的服務態度與專業度評分？
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((s) => (
                    <span
                      key={s}
                      className="material-symbols-outlined text-2xl text-[#C9A84C]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                  <span className="material-symbols-outlined text-2xl text-slate-300">star</span>
                  <span className="text-sm text-[#1A1A2E]/50 ml-2 self-center">4 / 5</span>
                </div>
              </div>

              {/* Q3: Radio */}
              <div>
                <p className="text-sm font-bold text-[#1A1A2E] mb-2">Q3. 您目前購車意願為？</p>
                <div className="flex flex-wrap gap-3">
                  {["非常強烈，近期就要購買", "有意願，還在考慮中", "暫時觀望", "短期內不考慮"].map(
                    (opt, i) => (
                      <label
                        key={opt}
                        className="flex items-center gap-2 text-sm text-[#1A1A2E] cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="q3"
                          defaultChecked={i === 1}
                          className="accent-[#CC0000]"
                        />
                        {opt}
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* Q4: Multi-choice buttons */}
              <div>
                <p className="text-sm font-bold text-[#1A1A2E] mb-2">
                  Q4. 影響您購車決策的主要因素？（可複選）
                </p>
                <div className="flex flex-wrap gap-2">
                  {["車款外觀", "性能規格", "品牌聲譽", "價格/貸款方案", "試駕感受", "售後服務"].map(
                    (opt, i) => (
                      <button
                        key={opt}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          i < 3
                            ? "bg-[#CC0000] text-white border-[#CC0000]"
                            : "bg-white text-[#1A1A2E]/60 border-[#1A1A2E]/15 hover:border-[#CC0000]/40"
                        }`}
                      >
                        {opt}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Q5: Textarea */}
              <div>
                <p className="text-sm font-bold text-[#1A1A2E] mb-2">Q5. 其他意見或建議？</p>
                <textarea
                  defaultValue="希望能提供更多 Panigale V4 S 的顏色選擇，以及詳細的分期方案試算。"
                  rows={3}
                  className="w-full border border-[#1A1A2E]/15 rounded-xl px-4 py-3 text-sm text-[#1A1A2E] focus:outline-none focus:border-[#CC0000] resize-none"
                />
              </div>
            </div>
          </div>

          {/* 電訪結果 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1A1A2E]/8">
            <h4 className="font-bold text-[#1A1A2E] text-base mb-4">電訪結果</h4>
            <div className="flex flex-wrap gap-4 mb-4">
              {["已完成電訪", "無法聯繫", "客戶拒接", "已成交確認"].map((opt, i) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-sm text-[#1A1A2E] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="crm_result"
                    defaultChecked={i === 0}
                    className="accent-[#CC0000]"
                  />
                  {opt}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1A1A2E]/60 mb-1">下次跟進日期</label>
                <input
                  type="date"
                  defaultValue="2026-04-18"
                  className="border border-[#1A1A2E]/15 rounded-xl px-4 py-2 text-sm text-[#1A1A2E] focus:outline-none focus:border-[#CC0000]"
                />
              </div>
            </div>
          </div>

          {/* Save button */}
          <button className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white font-bold py-3.5 rounded-2xl transition-colors text-base flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">save</span>
            儲存電訪記錄
          </button>
        </div>
      </div>
    </div>
  );
}
