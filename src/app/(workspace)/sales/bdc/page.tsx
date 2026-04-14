"use client";

import { useSetPageHeader } from "@/components/page-header-context";

export default function BdcPage() {
  useSetPageHeader({
    title: "電銷工作台",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "電銷工作台" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex">
      {/* Left: Call Queue */}
      <div className="w-[30%] bg-[#F5F2FF] flex flex-col border-r border-[#1A1A2E]/10">
        <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]/10">
          <h2 className="text-[#1A1A2E] font-bold text-base">來電佇列</h2>
          <p className="text-[#1A1A2E]/50 text-xs mt-0.5">3 筆待處理</p>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-1 px-3">
          {/* Contact 1 — urgent / active */}
          <div className="bg-white rounded-xl p-4 border border-red-200 shadow-sm cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/bikes/hero/hero-1.jpg"
                  alt="李小姐"
                  className="w-10 h-10 rounded-full object-cover"
                />
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1A1A2E] text-sm">李小姐</p>
                <p className="text-xs text-[#1A1A2E]/50 truncate">Panigale V4 S 意向客</p>
              </div>
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full shrink-0">
                緊急
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-[#1A1A2E]/40">schedule</span>
              <span className="text-xs text-[#1A1A2E]/50">等待 8 分鐘</span>
            </div>
          </div>

          {/* Contact 2 */}
          <div className="bg-white rounded-xl p-4 border border-[#1A1A2E]/10 shadow-sm cursor-pointer hover:border-yellow-300 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-[#F5F2FF] flex items-center justify-center">
                  <span className="text-[#1A1A2E] font-bold text-sm">張</span>
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-400 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1A1A2E] text-sm">張先生</p>
                <p className="text-xs text-[#1A1A2E]/50 truncate">Monster SP 詢價</p>
              </div>
              <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full shrink-0">
                一般
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-[#1A1A2E]/40">schedule</span>
              <span className="text-xs text-[#1A1A2E]/50">等待 3 分鐘</span>
            </div>
          </div>

          {/* Contact 3 */}
          <div className="bg-white rounded-xl p-4 border border-[#1A1A2E]/10 shadow-sm cursor-pointer hover:border-yellow-300 transition-colors">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-[#F5F2FF] flex items-center justify-center">
                  <span className="text-[#1A1A2E] font-bold text-sm">林</span>
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-400 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1A1A2E] text-sm">林小姐</p>
                <p className="text-xs text-[#1A1A2E]/50 truncate">Diavel V4 試駕預約</p>
              </div>
              <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full shrink-0">
                一般
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-[#1A1A2E]/40">schedule</span>
              <span className="text-xs text-[#1A1A2E]/50">等待 1 分鐘</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Active Call UI + Form */}
      <div className="flex-1 bg-white flex flex-col overflow-y-auto">
        {/* Active Call Header — dark navy */}
        <div className="bg-[#1A1A2E] px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/bikes/hero/hero-1.jpg"
                alt="李小姐"
                className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-xl">李小姐</h3>
                  <span className="text-[10px] font-bold text-red-300 bg-red-900/50 px-2 py-0.5 rounded-full">
                    通話中
                  </span>
                </div>
                <p className="text-white/60 text-sm mt-0.5">Panigale V4 S 意向客 · 0912-345-678</p>
                <p className="text-white/40 text-xs mt-1">首次接觸 · Grade A 潛在客戶</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white/50 text-xs mb-1">通話時長</p>
              <p className="text-white font-mono text-3xl font-bold tracking-widest">00:02:34</p>
              <button className="mt-3 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-full font-bold text-sm transition-colors">
                <span className="material-symbols-outlined text-base">call_end</span>
                結束通話
              </button>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 px-8 py-6 space-y-6">
          {/* 跟進結果 */}
          <div>
            <label className="block text-[#1A1A2E] font-bold text-sm mb-3">跟進結果</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["有意向", "約到店", "需再跟進", "暫無意向"].map((opt, i) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 border border-[#1A1A2E]/15 rounded-xl p-3 cursor-pointer hover:border-[#CC0000]/40 hover:bg-[#FCF8FF] transition-colors"
                >
                  <input
                    type="radio"
                    name="followup_result"
                    defaultChecked={i === 0}
                    className="accent-[#CC0000]"
                  />
                  <span className="text-sm text-[#1A1A2E]">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 預約到店日期 */}
          <div>
            <label className="block text-[#1A1A2E] font-bold text-sm mb-2">預約到店日期</label>
            <input
              type="date"
              defaultValue="2026-04-20"
              className="border border-[#1A1A2E]/15 rounded-xl px-4 py-2.5 text-sm text-[#1A1A2E] w-full max-w-xs focus:outline-none focus:border-[#CC0000]"
            />
          </div>

          {/* 分配銷售顧問 */}
          <div>
            <label className="block text-[#1A1A2E] font-bold text-sm mb-2">分配銷售顧問</label>
            <select
              defaultValue="陳志明"
              className="border border-[#1A1A2E]/15 rounded-xl px-4 py-2.5 text-sm text-[#1A1A2E] w-full max-w-xs focus:outline-none focus:border-[#CC0000] bg-white"
            >
              <option>陳志明</option>
              <option>王美華</option>
              <option>林俊宏</option>
              <option>黃怡君</option>
            </select>
          </div>

          {/* 跟進備註 */}
          <div>
            <label className="block text-[#1A1A2E] font-bold text-sm mb-2">跟進備註</label>
            <textarea
              defaultValue="客戶對 Panigale V4 S 紅色版本非常感興趣，詢問是否有現車。已告知目前庫存 2 輛，建議本週末到店試駕。"
              rows={3}
              className="border border-[#1A1A2E]/15 rounded-xl px-4 py-3 text-sm text-[#1A1A2E] w-full focus:outline-none focus:border-[#CC0000] resize-none"
            />
          </div>

          {/* 下次跟進日期 */}
          <div>
            <label className="block text-[#1A1A2E] font-bold text-sm mb-2">下次跟進日期</label>
            <input
              type="date"
              defaultValue="2026-04-17"
              className="border border-[#1A1A2E]/15 rounded-xl px-4 py-2.5 text-sm text-[#1A1A2E] w-full max-w-xs focus:outline-none focus:border-[#CC0000]"
            />
          </div>

          {/* Save */}
          <button className="bg-[#CC0000] hover:bg-[#AA0000] text-white font-bold px-8 py-3 rounded-full transition-colors inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-base">save</span>
            儲存跟進記錄
          </button>

          {/* Bottom 2-col: history + recent calls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#1A1A2E]/8">
            {/* 歷史意向 */}
            <div>
              <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">歷史意向</h4>
              <div className="space-y-2">
                {[
                  { date: "2026-03-28", note: "詢問 Panigale V4 S 價格", tag: "詢價" },
                  { date: "2026-04-05", note: "要求寄送產品型錄", tag: "資料" },
                  { date: "2026-04-10", note: "主動來電確認試駕時間", tag: "試駕" },
                ].map((h) => (
                  <div key={h.date} className="flex items-start gap-3 p-3 bg-[#F5F2FF] rounded-xl">
                    <span className="text-[10px] font-bold text-[#1A1A2E]/40 mt-0.5 shrink-0">
                      {h.date}
                    </span>
                    <p className="text-xs text-[#1A1A2E]/80 flex-1">{h.note}</p>
                    <span className="text-[10px] bg-[#CC0000]/10 text-[#CC0000] font-bold px-2 py-0.5 rounded-full shrink-0">
                      {h.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 最近通話摘要 */}
            <div>
              <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">最近通話摘要</h4>
              <div className="space-y-2">
                {[
                  { date: "2026-04-10", duration: "4:22", result: "約到店", advisor: "陳志明" },
                  { date: "2026-04-07", duration: "2:05", result: "需再跟進", advisor: "王美華" },
                  { date: "2026-04-02", duration: "6:14", result: "有意向", advisor: "陳志明" },
                ].map((c) => (
                  <div key={c.date} className="flex items-center gap-3 p-3 bg-[#F5F2FF] rounded-xl">
                    <span className="material-symbols-outlined text-sm text-[#1A1A2E]/40">
                      phone_in_talk
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#1A1A2E]">
                        {c.date} · {c.duration}
                      </p>
                      <p className="text-xs text-[#1A1A2E]/50">{c.advisor}</p>
                    </div>
                    <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                      {c.result}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
