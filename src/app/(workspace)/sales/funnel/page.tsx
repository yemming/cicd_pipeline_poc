"use client";

import { useState, useMemo } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

const CONSULTANTS = ["全部", "陳建志", "林佳蓉", "王俊傑", "黃雅婷", "劉明宏", "張惠如"];
const MODELS = ["全部車系", "Panigale V4", "Multistrada V4", "Monster", "Diavel V4", "DesertX", "Scrambler", "Streetfighter V4"];
const DATE_RANGES = ["今日", "本週", "本月", "上月"] as const;
type DateRange = typeof DATE_RANGES[number];
type ViewTab = "reception" | "manager" | "personal";

interface FunnelStage {
  stage: string;
  icon: string;
  count: number;
  prev?: number;
  rate?: number;
}

const MOCK: Record<ViewTab, Record<DateRange, FunnelStage[]>> = {
  reception: {
    "今日": [
      { stage: "來店客戶", icon: "person_add", count: 12 },
      { stage: "需求確認", icon: "fact_check", count: 9,  prev: 12, rate: 75 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 7,  prev: 9,  rate: 78 },
      { stage: "報價提案", icon: "request_quote", count: 5,  prev: 7,  rate: 71 },
      { stage: "確認成交", icon: "handshake", count: 2,  prev: 5,  rate: 40 },
    ],
    "本週": [
      { stage: "來店客戶", icon: "person_add", count: 58 },
      { stage: "需求確認", icon: "fact_check", count: 44, prev: 58, rate: 76 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 31, prev: 44, rate: 70 },
      { stage: "報價提案", icon: "request_quote", count: 22, prev: 31, rate: 71 },
      { stage: "確認成交", icon: "handshake", count: 9,  prev: 22, rate: 41 },
    ],
    "本月": [
      { stage: "來店客戶", icon: "person_add", count: 215 },
      { stage: "需求確認", icon: "fact_check", count: 162, prev: 215, rate: 75 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 114, prev: 162, rate: 70 },
      { stage: "報價提案", icon: "request_quote", count: 77,  prev: 114, rate: 68 },
      { stage: "確認成交", icon: "handshake", count: 28,  prev: 77,  rate: 36 },
    ],
    "上月": [
      { stage: "來店客戶", icon: "person_add", count: 198 },
      { stage: "需求確認", icon: "fact_check", count: 147, prev: 198, rate: 74 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 103, prev: 147, rate: 70 },
      { stage: "報價提案", icon: "request_quote", count: 72,  prev: 103, rate: 70 },
      { stage: "確認成交", icon: "handshake", count: 24,  prev: 72,  rate: 33 },
    ],
  },
  manager: {
    "今日": [
      { stage: "來店客戶", icon: "person_add", count: 12 },
      { stage: "需求確認", icon: "fact_check", count: 9,  prev: 12, rate: 75 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 6,  prev: 9,  rate: 67 },
      { stage: "報價提案", icon: "request_quote", count: 4,  prev: 6,  rate: 67 },
      { stage: "確認成交", icon: "handshake", count: 1,  prev: 4,  rate: 25 },
    ],
    "本週": [
      { stage: "來店客戶", icon: "person_add", count: 58 },
      { stage: "需求確認", icon: "fact_check", count: 43, prev: 58, rate: 74 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 29, prev: 43, rate: 67 },
      { stage: "報價提案", icon: "request_quote", count: 19, prev: 29, rate: 66 },
      { stage: "確認成交", icon: "handshake", count: 7,  prev: 19, rate: 37 },
    ],
    "本月": [
      { stage: "來店客戶", icon: "person_add", count: 287 },
      { stage: "需求確認", icon: "fact_check", count: 215, prev: 287, rate: 75 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 156, prev: 215, rate: 73 },
      { stage: "報價提案", icon: "request_quote", count: 98,  prev: 156, rate: 63 },
      { stage: "確認成交", icon: "handshake", count: 34,  prev: 98,  rate: 35 },
    ],
    "上月": [
      { stage: "來店客戶", icon: "person_add", count: 263 },
      { stage: "需求確認", icon: "fact_check", count: 197, prev: 263, rate: 75 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 141, prev: 197, rate: 72 },
      { stage: "報價提案", icon: "request_quote", count: 89,  prev: 141, rate: 63 },
      { stage: "確認成交", icon: "handshake", count: 29,  prev: 89,  rate: 33 },
    ],
  },
  personal: {
    "今日": [
      { stage: "來店客戶", icon: "person_add", count: 3 },
      { stage: "需求確認", icon: "fact_check", count: 3,  prev: 3,  rate: 100 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 2,  prev: 3,  rate: 67 },
      { stage: "報價提案", icon: "request_quote", count: 2,  prev: 2,  rate: 100 },
      { stage: "確認成交", icon: "handshake", count: 1,  prev: 2,  rate: 50 },
    ],
    "本週": [
      { stage: "來店客戶", icon: "person_add", count: 14 },
      { stage: "需求確認", icon: "fact_check", count: 12, prev: 14, rate: 86 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 9,  prev: 12, rate: 75 },
      { stage: "報價提案", icon: "request_quote", count: 7,  prev: 9,  rate: 78 },
      { stage: "確認成交", icon: "handshake", count: 3,  prev: 7,  rate: 43 },
    ],
    "本月": [
      { stage: "來店客戶", icon: "person_add", count: 42 },
      { stage: "需求確認", icon: "fact_check", count: 35, prev: 42, rate: 83 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 28, prev: 35, rate: 80 },
      { stage: "報價提案", icon: "request_quote", count: 19, prev: 28, rate: 68 },
      { stage: "確認成交", icon: "handshake", count: 7,  prev: 19, rate: 37 },
    ],
    "上月": [
      { stage: "來店客戶", icon: "person_add", count: 38 },
      { stage: "需求確認", icon: "fact_check", count: 31, prev: 38, rate: 82 },
      { stage: "試駕安排", icon: "sports_motorsports", count: 24, prev: 31, rate: 77 },
      { stage: "報價提案", icon: "request_quote", count: 16, prev: 24, rate: 67 },
      { stage: "確認成交", icon: "handshake", count: 5,  prev: 16, rate: 31 },
    ],
  },
};

const RANKINGS = [
  { name: "陳建志", visits: 54, testDrives: 38, quotes: 24, deals: 9,  rate: 16.7 },
  { name: "林佳蓉", visits: 47, testDrives: 42, quotes: 18, deals: 7,  rate: 14.9 },
  { name: "王俊傑", visits: 62, testDrives: 44, quotes: 29, deals: 8,  rate: 12.9 },
  { name: "黃雅婷", visits: 39, testDrives: 29, quotes: 14, deals: 5,  rate: 12.8 },
  { name: "劉明宏", visits: 51, testDrives: 21, quotes: 8,  deals: 3,  rate: 5.9  },
  { name: "張惠如", visits: 34, testDrives: 28, quotes: 5,  deals: 2,  rate: 5.9  },
];

const VIEW_TABS = [
  { key: "reception" as ViewTab, label: "展廳接待", icon: "storefront" },
  { key: "manager"   as ViewTab, label: "主管總覽", icon: "supervisor_account" },
  { key: "personal"  as ViewTab, label: "個人表現", icon: "person" },
];

const BAR_COLORS = [
  "bg-[#1A1A2E]", "bg-[#2D2D4E]", "bg-[#CC0000]", "bg-[#FF5555]", "bg-green-600",
];

export default function FunnelPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "銷售漏斗" },
    ],
  });

  const [view, setView]       = useState<ViewTab>("manager");
  const [dateRange, setDateRange] = useState<DateRange>("本月");
  const [consultant, setConsultant] = useState("全部");
  const [model, setModel]     = useState("全部車系");

  const data = useMemo(() => MOCK[view][dateRange], [view, dateRange]);

  const totalVisits = data[0]?.count ?? 1;
  const totalDeals  = data[data.length - 1]?.count ?? 0;
  const testDrives  = data[2]?.count ?? 0;
  const overallRate = ((totalDeals / totalVisits) * 100).toFixed(1);
  const testDriveRate = ((testDrives / totalVisits) * 100).toFixed(1);
  const maxCount = data[0]?.count ?? 1;

  const kpis = [
    { label: "來店客戶", value: totalVisits, unit: "組", icon: "groups",              color: "text-blue-600",   bg: "bg-blue-50"   },
    { label: "成交數",   value: totalDeals,  unit: "台", icon: "handshake",            color: "text-green-600",  bg: "bg-green-50"  },
    { label: "整體成交率", value: `${overallRate}%`, unit: "", icon: "trending_up",   color: "text-purple-600", bg: "bg-purple-50" },
    { label: "試駕率",   value: `${testDriveRate}%`, unit: "", icon: "sports_motorsports", color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F9FC] min-h-[calc(100dvh-4rem)]">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* View Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-[#E8E4FF] w-fit">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                view === tab.key
                  ? "bg-[#1A1A2E] text-white shadow-md"
                  : "text-[#47464C] hover:bg-[#F5F2FF]"
              }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1 bg-white rounded-lg border border-[#E8E4FF] p-1 shadow-sm">
            {DATE_RANGES.map(d => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  dateRange === d ? "bg-[#CC0000] text-white shadow-sm" : "text-[#47464C] hover:bg-[#F5F2FF]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {view !== "personal" && (
            <select
              value={consultant}
              onChange={e => setConsultant(e.target.value)}
              className="bg-white border border-[#E8E4FF] rounded-lg px-4 py-2 text-sm text-[#1A1A2E] shadow-sm focus:ring-1 focus:ring-[#CC0000]/30 outline-none"
            >
              {CONSULTANTS.map(c => <option key={c}>{c}</option>)}
            </select>
          )}

          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-white border border-[#E8E4FF] rounded-lg px-4 py-2 text-sm text-[#1A1A2E] shadow-sm focus:ring-1 focus:ring-[#CC0000]/30 outline-none"
          >
            {MODELS.map(m => <option key={m}>{m}</option>)}
          </select>

          <span className="text-xs text-[#47464C] bg-white px-3 py-2 rounded-lg border border-[#E8E4FF] shadow-sm">
            {dateRange} · {view === "personal" ? "林佳蓉" : consultant === "全部" ? "全體顧問" : consultant} · {model}
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E4FF]">
              <div className={`w-10 h-10 ${kpi.bg} rounded-lg flex items-center justify-center mb-3`}>
                <span className={`material-symbols-outlined text-xl ${kpi.color}`}>{kpi.icon}</span>
              </div>
              <div className="text-3xl font-extrabold text-[#1A1A2E] tracking-tight">
                {typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value}
                {kpi.unit && <span className="text-base font-medium ml-0.5">{kpi.unit}</span>}
              </div>
              <div className="text-sm font-bold text-[#47464C] mt-0.5">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-12 gap-5">

          {/* Funnel Chart */}
          <div className="col-span-12 md:col-span-7 bg-white rounded-xl p-8 shadow-sm border border-[#E8E4FF]">
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#CC0000]">filter_alt</span>
              銷售漏斗
              <span className="ml-2 text-xs font-medium text-[#47464C]/50 bg-[#F5F2FF] px-2 py-0.5 rounded-full">{dateRange}</span>
            </h2>

            <div className="space-y-4">
              {data.map((stage, i) => {
                const pct = Math.round((stage.count / maxCount) * 100);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-[#47464C]">{stage.icon}</span>
                        <span className="text-sm font-bold text-[#1A1A2E]">{stage.stage}</span>
                        {stage.rate !== undefined && (
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            stage.rate >= 70 ? "bg-green-100 text-green-700" :
                            stage.rate >= 50 ? "bg-amber-100 text-amber-700" :
                                              "bg-red-100 text-red-600"
                          }`}>
                            ↓ {stage.rate}%
                          </span>
                        )}
                      </div>
                      <span className="text-lg font-extrabold text-[#1A1A2E]">{stage.count.toLocaleString()}</span>
                    </div>
                    <div className="relative h-9 bg-[#F5F2FF] rounded-lg overflow-hidden">
                      <div
                        className={`h-full ${BAR_COLORS[i]} rounded-lg transition-all duration-500 flex items-center pl-4`}
                        style={{ width: `${pct}%` }}
                      >
                        <span className="text-white text-xs font-bold opacity-80 whitespace-nowrap">
                          {stage.count.toLocaleString()} 組
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-[#E8E4FF] flex items-center justify-between">
              <span className="text-sm text-[#47464C]/60">整體轉換率（來店 → 成交）</span>
              <span className="text-2xl font-extrabold text-green-600">{overallRate}%</span>
            </div>
          </div>

          {/* Right Panel */}
          <div className="col-span-12 md:col-span-5 space-y-4">

            {/* Stage conversion detail */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E8E4FF]">
              <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-[#47464C]">analytics</span>
                各階段轉換率
              </h3>
              <div className="space-y-3">
                {data.slice(1).map((stage, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-[#47464C] w-36 shrink-0">
                      {data[i].stage} → {stage.stage}
                    </span>
                    <div className="flex-1 bg-[#F5F2FF] rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          (stage.rate ?? 0) >= 70 ? "bg-green-500" :
                          (stage.rate ?? 0) >= 50 ? "bg-amber-500" :
                                                    "bg-red-500"
                        }`}
                        style={{ width: `${stage.rate ?? 0}%` }}
                      />
                    </div>
                    <span className={`text-sm font-extrabold w-10 text-right shrink-0 ${
                      (stage.rate ?? 0) >= 70 ? "text-green-600" :
                      (stage.rate ?? 0) >= 50 ? "text-amber-600" :
                                                "text-red-600"
                    }`}>
                      {stage.rate}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Manager: consultant rankings */}
            {view === "manager" && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E8E4FF]">
                <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#CC0000]">leaderboard</span>
                  顧問成交排行 · {dateRange}
                </h3>
                <div className="space-y-2">
                  {RANKINGS.map((c, i) => (
                    <div
                      key={c.name}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        i === 0 ? "bg-amber-50 border border-amber-200" : "hover:bg-[#F5F2FF]"
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        i === 0 ? "bg-amber-400 text-white" :
                        i === 1 ? "bg-gray-300 text-gray-600" :
                        i === 2 ? "bg-amber-700 text-white" :
                                  "bg-[#F5F2FF] text-[#47464C]"
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-sm font-bold text-[#1A1A2E] flex-1">{c.name}</span>
                      <span className="text-sm font-extrabold text-[#1A1A2E]">{c.deals} 台</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        c.rate >= 15 ? "bg-green-100 text-green-700" :
                        c.rate >= 10 ? "bg-amber-100 text-amber-700" :
                                      "bg-red-100 text-red-600"
                      }`}>
                        {c.rate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Personal: summary cards */}
            {view === "personal" && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E8E4FF]">
                <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#CC0000]">person_pin</span>
                  林佳蓉 · {dateRange}成績
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "責任來客", value: data[0].count, unit: "組" },
                    { label: "已試駕",   value: data[2].count, unit: "組" },
                    { label: "已報價",   value: data[3].count, unit: "組" },
                    { label: "成交",     value: data[4].count, unit: "台" },
                  ].map(item => (
                    <div key={item.label} className="bg-[#F8F9FC] rounded-lg p-3 text-center">
                      <div className="text-2xl font-extrabold text-[#1A1A2E]">
                        {item.value}
                        <span className="text-sm font-medium ml-0.5">{item.unit}</span>
                      </div>
                      <div className="text-xs text-[#47464C]/60 mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200 flex items-start gap-2">
                  <span className="material-symbols-outlined text-green-600 text-sm mt-0.5">emoji_events</span>
                  <p className="text-xs text-green-800">
                    {dateRange}成交率 <strong>{overallRate}%</strong>，高於團隊平均（11.8%）🎉
                  </p>
                </div>
              </div>
            )}

            {/* Reception: quick tips */}
            {view === "reception" && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E8E4FF]">
                <h3 className="text-sm font-bold text-[#1A1A2E] mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-amber-500">tips_and_updates</span>
                  {dateRange}接待建議
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-xs p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="material-symbols-outlined text-red-600 text-sm mt-0.5">priority_high</span>
                    <p className="text-[#47464C]">
                      報價→成交轉換率 <strong className="text-red-600">{data[4].rate}%</strong>，
                      尚有 {(data[3].count - data[4].count)} 組報價未成交，建議追蹤跟進。
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-xs p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">schedule</span>
                    <p className="text-[#47464C]">
                      試駕率 <strong className="text-amber-700">{testDriveRate}%</strong>，
                      可再提升試駕安排比例以提高成交機率。
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-xs p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="material-symbols-outlined text-green-600 text-sm mt-0.5">check_circle</span>
                    <p className="text-[#47464C]">
                      {dateRange}已完成 <strong className="text-green-600">{totalDeals}</strong> 台成交，
                      整體成交率 {overallRate}%。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
