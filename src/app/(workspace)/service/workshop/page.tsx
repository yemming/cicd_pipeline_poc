"use client";

import { useSetPageHeader } from "@/components/page-header-context";

type KanbanCard = {
  customer: string;
  model: string;
  wo: string;
  service: string;
  duration?: string;
  technician?: string;
  progress?: number;
  urgent?: boolean;
  passCount?: string;
  completedAt?: string;
  action?: { label: string; color: string };
  extra?: React.ReactNode;
};

type KanbanCol = {
  title: string;
  count: number;
  color: string;
  headerBg: string;
  cards: KanbanCard[];
};

const COLUMNS: KanbanCol[] = [
  {
    title: "待派工",
    count: 4,
    color: "text-orange-700",
    headerBg: "bg-orange-50 border-orange-200",
    cards: [
      {
        customer: "林曉明",
        model: "Panigale V4",
        wo: "WO-99201",
        service: "Desmo 大保養",
        duration: "4.5h",
        urgent: true,
        action: { label: "派工", color: "bg-[#CC0000] hover:bg-[#AA0000] text-white" },
      },
      {
        customer: "王小華",
        model: "Monster SP",
        wo: "WO-99205",
        service: "快排校準",
        duration: "1.0h",
        action: { label: "派工", color: "bg-[#CC0000] hover:bg-[#AA0000] text-white" },
      },
    ],
  },
  {
    title: "施工中",
    count: 6,
    color: "text-blue-700",
    headerBg: "bg-blue-50 border-blue-200",
    cards: [
      {
        customer: "陳建國",
        model: "Multistrada V4",
        wo: "WO-99180",
        service: "全車保養",
        duration: "01:45",
        technician: "李技師",
        progress: 45,
        action: { label: "更新進度", color: "bg-blue-600 hover:bg-blue-700 text-white" },
      },
    ],
  },
  {
    title: "待檢查",
    count: 2,
    color: "text-yellow-700",
    headerBg: "bg-yellow-50 border-yellow-200",
    cards: [
      {
        customer: "張大為",
        model: "Diavel V4",
        wo: "WO-99175",
        service: "前叉整備",
        action: { label: "開始檢查", color: "bg-yellow-600 hover:bg-yellow-700 text-white" },
      },
    ],
  },
  {
    title: "品管中",
    count: 1,
    color: "text-purple-700",
    headerBg: "bg-purple-50 border-purple-200",
    cards: [
      {
        customer: "周杰倫",
        model: "Streetfighter V4",
        wo: "WO-99162",
        service: "品管抽查",
        passCount: "5/6 項目通過",
        action: { label: "返工", color: "bg-orange-500 hover:bg-orange-600 text-white" },
      },
    ],
  },
  {
    title: "已完工",
    count: 3,
    color: "text-green-700",
    headerBg: "bg-green-50 border-green-200",
    cards: [
      {
        customer: "蔡依林",
        model: "DesertX",
        wo: "WO-99150",
        service: "定期保養",
        completedAt: "完成 14:30",
        action: { label: "送結算", color: "bg-green-600 hover:bg-green-700 text-white" },
      },
    ],
  },
];

const TECHNICIANS = [
  { name: "李技師", load: 90, jobs: 3, color: "bg-[#CC0000]" },
  { name: "張技師", load: 70, jobs: 2, color: "bg-blue-500" },
  { name: "王技師", load: 50, jobs: 2, color: "bg-yellow-500" },
  { name: "陳技師", load: 30, jobs: 1, color: "bg-green-500" },
];

export default function WorkshopPage() {
  useSetPageHeader({
    title: "技師派工",
    breadcrumb: [
      { label: "維修管理" },
      { label: "技師派工" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#F5F5F5] min-h-[calc(100dvh-4rem)] flex">
      {/* Main kanban area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filter bar */}
        <div className="bg-white border-b border-[#1A1A2E]/8 px-6 py-3 flex items-center gap-4 flex-wrap">
          <input
            type="date"
            defaultValue="2026-04-14"
            className="border border-[#1A1A2E]/15 rounded-xl px-3 py-2 text-sm text-[#1A1A2E] focus:outline-none focus:border-[#CC0000]"
          />
          <select
            defaultValue="all"
            className="border border-[#1A1A2E]/15 rounded-xl px-3 py-2 text-sm text-[#1A1A2E] bg-white focus:outline-none focus:border-[#CC0000]"
          >
            <option value="all">所有技師</option>
            <option>李技師</option>
            <option>張技師</option>
            <option>王技師</option>
            <option>陳技師</option>
          </select>
          <select
            defaultValue="all"
            className="border border-[#1A1A2E]/15 rounded-xl px-3 py-2 text-sm text-[#1A1A2E] bg-white focus:outline-none focus:border-[#CC0000]"
          >
            <option value="all">所有車型</option>
            <option>Panigale</option>
            <option>Monster</option>
            <option>Multistrada</option>
            <option>Diavel</option>
            <option>Streetfighter</option>
            <option>DesertX</option>
          </select>
          <div className="ml-auto">
            <button className="bg-[#CC0000] hover:bg-[#AA0000] text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">add</span>
              新增派工
            </button>
          </div>
        </div>

        {/* Kanban columns */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full" style={{ minWidth: "1000px" }}>
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col w-56 shrink-0">
                {/* Column header */}
                <div
                  className={`rounded-xl px-3 py-2.5 mb-3 border flex items-center justify-between ${col.headerBg}`}
                >
                  <span className={`font-bold text-sm ${col.color}`}>{col.title}</span>
                  <span
                    className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${col.color} bg-white/80`}
                  >
                    {col.count}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-3 flex-1">
                  {col.cards.map((card) => (
                    <div
                      key={card.wo}
                      className={`bg-white rounded-2xl p-4 shadow-sm border transition-shadow hover:shadow-md ${
                        card.urgent ? "border-[#CC0000]/40" : "border-[#1A1A2E]/8"
                      }`}
                    >
                      {/* Urgent badge */}
                      {card.urgent && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#CC0000] bg-[#CC0000]/10 px-2 py-0.5 rounded-full mb-2">
                          <span className="material-symbols-outlined text-xs">priority_high</span>
                          URGENT
                        </span>
                      )}

                      {/* WO + customer */}
                      <p className="text-[10px] text-[#1A1A2E]/40 font-mono">{card.wo}</p>
                      <p className="font-bold text-[#1A1A2E] text-sm mt-0.5">{card.customer}</p>
                      <p className="text-xs text-[#1A1A2E]/60 mt-0.5">{card.model}</p>

                      {/* Service */}
                      <div className="mt-2 pt-2 border-t border-[#1A1A2E]/6">
                        <p className="text-xs text-[#1A1A2E]/80">{card.service}</p>
                        {card.duration && !card.technician && (
                          <p className="text-xs text-[#1A1A2E]/50 mt-0.5">
                            <span className="material-symbols-outlined text-xs align-middle mr-0.5">
                              schedule
                            </span>
                            預估 {card.duration}
                          </p>
                        )}
                      </div>

                      {/* Progress (施工中) */}
                      {card.progress !== undefined && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[#1A1A2E]/50">{card.technician}</span>
                            <span className="text-[#1A1A2E]/50">
                              <span className="material-symbols-outlined text-xs align-middle">
                                timer
                              </span>
                              {card.duration}
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#F5F5F5] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${card.progress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-[#1A1A2E]/40 mt-0.5 text-right">
                            {card.progress}%
                          </p>
                        </div>
                      )}

                      {/* 品管 */}
                      {card.passCount && (
                        <div className="mt-2 text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg">
                          {card.passCount}
                        </div>
                      )}

                      {/* Completed */}
                      {card.completedAt && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-green-700">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          {card.completedAt}
                        </div>
                      )}

                      {/* Action button */}
                      {card.action && (
                        <button
                          className={`mt-3 w-full py-1.5 rounded-xl text-xs font-bold transition-colors ${card.action.color}`}
                        >
                          {card.action.label}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right aside */}
      <aside className="w-80 bg-white border-l border-[#1A1A2E]/8 flex flex-col p-5 gap-5 overflow-y-auto">
        {/* 技師狀態 */}
        <div>
          <h4 className="font-bold text-[#1A1A2E] text-sm mb-4">技師狀態</h4>
          <div className="space-y-4">
            {TECHNICIANS.map((t) => (
              <div key={t.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${t.color}`}>
                      {t.name[0]}
                    </div>
                    <span className="text-sm font-bold text-[#1A1A2E]">{t.name}</span>
                  </div>
                  <span className="text-xs text-[#1A1A2E]/50">{t.jobs} 件 · {t.load}%</span>
                </div>
                <div className="h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${t.color}`}
                    style={{ width: `${t.load}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 今日總利用率 */}
        <div className="bg-[#1A1A2E] rounded-2xl p-5 mt-auto">
          <p className="text-white/50 text-xs font-bold mb-1">今日總利用率</p>
          <p className="text-white text-5xl font-black">74.5%</p>
          <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: "74.5%" }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="bg-white/5 rounded-xl p-2">
              <p className="text-white text-xl font-black">16</p>
              <p className="text-white/40 text-[10px]">進行中工單</p>
            </div>
            <div className="bg-white/5 rounded-xl p-2">
              <p className="text-[#C9A84C] text-xl font-black">3</p>
              <p className="text-white/40 text-[10px]">已完工今日</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
