"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const TIME_SLOTS = [
  {
    time: "08:00",
    cells: [
      {
        customer: "張先生",
        model: "Panigale",
        service: "一般維修",
        status: "施工中",
        img: "/bikes/hero/lifestyle-2.jpg",
        statusColor: "bg-blue-100 text-blue-700",
      },
      {
        customer: "李小姐",
        model: "Multistrada",
        service: "定期保養",
        status: "已報到",
        img: "/bikes/thumbs/hypermotard-950-sp.png",
        statusColor: "bg-green-100 text-green-700",
      },
      null,
      {
        customer: "趙先生",
        model: "Monster",
        service: "鈑噴",
        status: "待施工",
        img: "/bikes/hero/hero-1.jpg",
        statusColor: "bg-yellow-100 text-yellow-700",
      },
      null,
      null,
    ],
  },
  {
    time: "09:00",
    cells: [
      null,
      {
        customer: "王先生",
        model: "Diavel",
        service: "快速洗車",
        status: "未到",
        img: "/bikes/hero/lifestyle-2.jpg",
        statusColor: "bg-red-100 text-red-700",
      },
      null,
      null,
      null,
      null,
    ],
  },
];

const TECHNICIANS = [
  { name: "陳技師", load: 90, color: "bg-[#CC0000]" },
  { name: "王技師", load: 60, color: "bg-blue-500" },
  { name: "林技師", load: 45, color: "bg-green-500" },
];

export default function AppointmentsPage() {
  useSetPageHeader({
    title: "預約看板",
    breadcrumb: [
      { label: "維修管理" },
      { label: "預約看板" },
    ],
  });

  return (
    <div className="-m-4 md:-m-8 bg-[#F5F5F5] min-h-[calc(100dvh-4rem)]">
      <div className="p-8 flex gap-8 items-start">
        {/* Main calendar grid */}
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-[#1A1A2E]/8 overflow-hidden">
          {/* Grid header */}
          <div className="grid grid-cols-7 border-b border-[#1A1A2E]/10">
            <div className="px-4 py-3 text-xs font-bold text-[#1A1A2E]/50 bg-[#F5F5F5]">
              時段 / 工作站
            </div>
            {["工作站 1", "工作站 2", "工作站 3", "工作站 4", "工作站 5", "工作站 6"].map((w) => (
              <div
                key={w}
                className="px-3 py-3 text-xs font-bold text-[#1A1A2E] text-center bg-[#F5F5F5] border-l border-[#1A1A2E]/8"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Time rows */}
          <div>
            {TIME_SLOTS.map((row) => (
              <div key={row.time} className="grid grid-cols-7 border-b border-[#1A1A2E]/6 min-h-[90px]">
                {/* Time label */}
                <div className="px-4 py-3 flex items-start">
                  <span className="text-sm font-bold text-[#1A1A2E]">{row.time}</span>
                </div>
                {/* Cells */}
                {row.cells.map((cell, idx) =>
                  cell ? (
                    <div
                      key={idx}
                      className="p-2 border-l border-[#1A1A2E]/6"
                    >
                      <div className="bg-[#F5F5F5] rounded-xl p-2.5 h-full flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cell.img}
                            alt={cell.model}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <span className="text-xs font-bold text-[#1A1A2E] truncate">
                            {cell.customer}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#1A1A2E]/60 truncate">
                          {cell.model} · {cell.service}
                        </p>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full self-start ${cell.statusColor}`}
                        >
                          {cell.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={idx}
                      className="p-2 border-l border-[#1A1A2E]/6 flex items-center justify-center"
                    >
                      <button className="text-[#1A1A2E]/20 hover:text-[#CC0000] transition-colors">
                        <span className="material-symbols-outlined text-lg">add</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}

            {/* 10:00 — meeting row spanning 6 cols */}
            <div className="grid grid-cols-7 border-b border-[#1A1A2E]/6 min-h-[72px]">
              <div className="px-4 py-3 flex items-start">
                <span className="text-sm font-bold text-[#1A1A2E]">10:00</span>
              </div>
              <div className="col-span-6 p-3 border-l border-[#1A1A2E]/6">
                <div className="bg-[#1A1A2E]/5 border border-dashed border-[#1A1A2E]/20 rounded-xl px-4 py-3 h-full flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#1A1A2E]/40 text-base">
                    groups
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#1A1A2E]/60">晨間整備會議時段</p>
                    <p className="text-[10px] text-[#1A1A2E]/40">所有工作站暫停接單 · 10:00 – 10:30</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right aside */}
        <aside className="w-80 flex flex-col gap-4">
          {/* 今日預約總覽 — dark */}
          <div className="bg-[#1A1A2E] rounded-2xl p-6">
            <h4 className="text-white font-bold text-base mb-4">今日預約總覽</h4>
            <div className="text-center mb-4">
              <p className="text-white text-5xl font-black">18</p>
              <p className="text-white/50 text-xs mt-1">台 今日總預約</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "已報到", value: 12, color: "text-green-400" },
                { label: "施工中", value: 8, color: "text-blue-400" },
                { label: "已完工", value: 4, color: "text-[#C9A84C]" },
                { label: "未到", value: 2, color: "text-red-400" },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-white/50 text-[10px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 重要通知 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#1A1A2E]/8">
            <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">重要通知</h4>
            <div className="space-y-2">
              <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                <span className="material-symbols-outlined text-orange-500 text-base mt-0.5 shrink-0">
                  warning
                </span>
                <div>
                  <p className="text-xs font-bold text-orange-800">零件缺件警告</p>
                  <p className="text-[11px] text-orange-600 mt-0.5">
                    Panigale V4 前煞車片庫存不足，WO-99201 可能延誤
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[#FCF8FF] rounded-xl border border-[#CC0000]/10">
                <span className="material-symbols-outlined text-[#CC0000] text-base mt-0.5 shrink-0">
                  star
                </span>
                <div>
                  <p className="text-xs font-bold text-[#1A1A2E]">VIP 到訪提醒</p>
                  <p className="text-[11px] text-[#1A1A2E]/60 mt-0.5">
                    趙先生（Monster）為 VIP 客戶，請優先安排
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 技師人力狀態 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#1A1A2E]/8">
            <h4 className="font-bold text-[#1A1A2E] text-sm mb-3">技師人力狀態</h4>
            <div className="space-y-3">
              {TECHNICIANS.map((t) => (
                <div key={t.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#1A1A2E]">{t.name}</span>
                    <span className="text-xs text-[#1A1A2E]/50">{t.load}%</span>
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
        </aside>
      </div>
    </div>
  );
}
