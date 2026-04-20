"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

type MainTab = "today" | "first" | "second" | "review";
type SubTab = "3d" | "7d" | "third" | "dormant" | "done";

type Prospect = {
  id: number;
  source: string;
  firstContactDate: string;
  advisor: string;
  name: string;
  phone: string;
  ownedBrand: string;
  ownedModel: string;
  ownedYear: number;
  ownedMileage: string;
  intendedModel: string;
  budgetLow: string;
  budgetHigh: string;
  purchaseMethod: string;
  paymentForm: string;
  contactJudgement: string;
  followup1Status: string;
  followup1Date: string;
  followup1Reaction: string;
  followupResult: string;
  followup2Status: string;
  followup2Date: string;
  finalResult: string;
  stage: "first" | "second" | "dormant" | "done";
  needsActionToday: boolean;
  subStage: SubTab;
};

const ALL_PROSPECTS: Prospect[] = [
  {
    id: 1, source: "微信朋友圈", firstContactDate: "2026-04-01",
    advisor: "陳志偉", name: "王大明", phone: "0912****3892",
    ownedBrand: "Yamaha", ownedModel: "MT-07", ownedYear: 2021, ownedMileage: "18,000km",
    intendedModel: "Monster", budgetLow: "35萬", budgetHigh: "40萬",
    purchaseMethod: "增購", paymentForm: "現金", contactJudgement: "有意向來店",
    followup1Status: "電話接通", followup1Date: "2026-04-03", followup1Reaction: "Yes-考慮中",
    followupResult: "持續跟進", followup2Status: "電話接通", followup2Date: "2026-04-10",
    finalResult: "", stage: "second", needsActionToday: true, subStage: "7d",
  },
  {
    id: 2, source: "展廳", firstContactDate: "2026-04-02",
    advisor: "林佳蓉", name: "李小華", phone: "0933****7741",
    ownedBrand: "Honda", ownedModel: "CB500", ownedYear: 2019, ownedMileage: "32,000km",
    intendedModel: "Scrambler", budgetLow: "28萬", budgetHigh: "32萬",
    purchaseMethod: "換購", paymentForm: "分期", contactJudgement: "線索直接成交",
    followup1Status: "前次邀約到店", followup1Date: "2026-04-04", followup1Reaction: "Yes-預約進店",
    followupResult: "確認成交", followup2Status: "", followup2Date: "",
    finalResult: "Scrambler 1100 Pro", stage: "done", needsActionToday: false, subStage: "done",
  },
  {
    id: 3, source: "老客戶轉介紹", firstContactDate: "2026-04-03",
    advisor: "陳志偉", name: "陳建志", phone: "0955****5513",
    ownedBrand: "Kawasaki", ownedModel: "Z650", ownedYear: 2020, ownedMileage: "25,000km",
    intendedModel: "Streetfighter V4", budgetLow: "65萬", budgetHigh: "75萬",
    purchaseMethod: "首購", paymentForm: "現金", contactJudgement: "無意向來店",
    followup1Status: "電話接通", followup1Date: "2026-04-05", followup1Reaction: "No-",
    followupResult: "確認戰敗", followup2Status: "", followup2Date: "",
    finalResult: "競品車商", stage: "done", needsActionToday: false, subStage: "done",
  },
  {
    id: 4, source: "微信朋友圈", firstContactDate: "2026-04-05",
    advisor: "林佳蓉", name: "林美玲", phone: "0978****0028",
    ownedBrand: "Suzuki", ownedModel: "GSX-S750", ownedYear: 2020, ownedMileage: "22,000km",
    intendedModel: "Diavel V4", budgetLow: "90萬", budgetHigh: "105萬",
    purchaseMethod: "增購", paymentForm: "分期", contactJudgement: "有意向來店",
    followup1Status: "微信留言", followup1Date: "2026-04-07", followup1Reaction: "Try-",
    followupResult: "持續跟進", followup2Status: "電話接通", followup2Date: "2026-04-14",
    finalResult: "", stage: "second", needsActionToday: true, subStage: "7d",
  },
  {
    id: 5, source: "老客戶轉介紹", firstContactDate: "2026-04-06",
    advisor: "陳志偉", name: "張偉平", phone: "0966****6604",
    ownedBrand: "BMW", ownedModel: "F800GS", ownedYear: 2018, ownedMileage: "48,000km",
    intendedModel: "Multistrada V4", budgetLow: "70萬", budgetHigh: "85萬",
    purchaseMethod: "換購", paymentForm: "現金", contactJudgement: "有意向來店",
    followup1Status: "前次邀約到店", followup1Date: "2026-04-09", followup1Reaction: "Yes-考慮中",
    followupResult: "持續跟進", followup2Status: "電話接通", followup2Date: "2026-04-16",
    finalResult: "", stage: "second", needsActionToday: false, subStage: "7d",
  },
  {
    id: 6, source: "微信朋友圈", firstContactDate: "2026-04-07",
    advisor: "林佳蓉", name: "黃建國", phone: "0921****4417",
    ownedBrand: "KTM", ownedModel: "Duke 390", ownedYear: 2022, ownedMileage: "8,000km",
    intendedModel: "Hypermotard", budgetLow: "48萬", budgetHigh: "55萬",
    purchaseMethod: "首購", paymentForm: "分期", contactJudgement: "外地線索",
    followup1Status: "無法接通", followup1Date: "2026-04-09", followup1Reaction: "Try-",
    followupResult: "休眠狀態", followup2Status: "微信留言", followup2Date: "2026-04-15",
    finalResult: "", stage: "dormant", needsActionToday: false, subStage: "dormant",
  },
  {
    id: 7, source: "老客戶轉介紹", firstContactDate: "2026-04-10",
    advisor: "陳志偉", name: "劉雅婷", phone: "0943****8835",
    ownedBrand: "Ducati", ownedModel: "Monster 797", ownedYear: 2017, ownedMileage: "36,000km",
    intendedModel: "Panigale V4", budgetLow: "95萬", budgetHigh: "110萬",
    purchaseMethod: "換購", paymentForm: "現金", contactJudgement: "有意向來店",
    followup1Status: "", followup1Date: "", followup1Reaction: "",
    followupResult: "待跟進", followup2Status: "", followup2Date: "",
    finalResult: "", stage: "first", needsActionToday: true, subStage: "3d",
  },
];

const sourceChipColor: Record<string, string> = {
  "微信朋友圈": "bg-sky-100 text-sky-700",
  "展廳": "bg-indigo-100 text-indigo-700",
  "老客戶轉介紹": "bg-violet-100 text-violet-700",
  "電商平台": "bg-teal-100 text-teal-700",
};

const resultChipColor: Record<string, string> = {
  "確認成交": "bg-emerald-100 text-emerald-700",
  "持續跟進": "bg-blue-100 text-blue-700",
  "確認戰敗": "bg-red-100 text-red-700",
  "休眠狀態": "bg-gray-100 text-gray-500",
  "待跟進": "bg-amber-100 text-amber-700",
};

const reactionChipColor: Record<string, string> = {
  "Yes-預約進店": "bg-emerald-100 text-emerald-700",
  "Yes-考慮中": "bg-blue-100 text-blue-700",
  "No-": "bg-red-100 text-red-600",
  "Try-": "bg-amber-100 text-amber-700",
  "Fin-": "bg-gray-100 text-gray-500",
};

const SUB_TAB_ORDER: SubTab[] = ["3d", "7d", "third", "dormant", "done"];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早安";
  if (h < 18) return "午安";
  return "晚安";
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}年 ${String(d.getMonth() + 1).padStart(2, "0")}月 ${String(d.getDate()).padStart(2, "0")}日`;
}

function getMainFiltered(tab: MainTab) {
  return ALL_PROSPECTS.filter((p) => {
    switch (tab) {
      case "today":  return p.needsActionToday;
      case "first":  return p.stage === "first";
      case "second": return p.stage === "second";
      case "review": return p.stage === "done" || p.stage === "dormant";
    }
  });
}

export default function UsedCarProspectsPage() {
  useSetPageHeader({ title: "潛客跟進", hideSearch: false });

  const [mainTab, setMainTab] = useState<MainTab>("today");
  const [subTab, setSubTab] = useState<SubTab>("3d");

  const todayStr = formatDate(new Date());
  const greeting = getGreeting();

  const todayCount  = ALL_PROSPECTS.filter((p) => p.needsActionToday).length;
  const firstCount  = ALL_PROSPECTS.filter((p) => p.stage === "first").length;
  const secondCount = ALL_PROSPECTS.filter((p) => p.stage === "second").length;
  const reviewCount = ALL_PROSPECTS.filter((p) => p.stage === "done" || p.stage === "dormant").length;

  const mainFiltered = getMainFiltered(mainTab);

  const subCounts = SUB_TAB_ORDER.reduce<Record<SubTab, number>>((acc, st) => {
    acc[st] = mainFiltered.filter((p) => p.subStage === st).length;
    return acc;
  }, { "3d": 0, "7d": 0, "third": 0, "dormant": 0, "done": 0 });

  const filtered = mainFiltered.filter((p) => p.subStage === subTab);

  function switchMainTab(tab: MainTab) {
    setMainTab(tab);
    const next = getMainFiltered(tab);
    const first = SUB_TAB_ORDER.find((st) => next.some((p) => p.subStage === st));
    setSubTab(first ?? "3d");
  }

  const mainTabs = [
    { key: "today"  as MainTab, label: "今日跟聯？",  count: todayCount },
    { key: "first"  as MainTab, label: "第一次跟進", count: firstCount },
    { key: "second" as MainTab, label: "第二次跟進", count: secondCount },
    { key: "review" as MainTab, label: "客享審查",   count: reviewCount },
  ];

  const subTabs = [
    { key: "3d"      as SubTab, label: "第一次聯繫（3D）" },
    { key: "7d"      as SubTab, label: "第二次聯繫（7D）" },
    { key: "third"   as SubTab, label: "第三次聯繫" },
    { key: "dormant" as SubTab, label: "可洗待點名" },
    { key: "done"    as SubTab, label: "已動點" },
  ];

  return (
    <div className="space-y-3 pb-10">
      {/* 今日工作 Hero */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
        <div className="flex-none">
          <div className="text-[11px] text-gray-400 mb-0.5">{todayStr}</div>
          <div className="text-base font-bold text-gray-800">今日工作</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold text-gray-700">Hi Russell，{greeting}</div>
          <div className="text-xs text-gray-400 mt-0.5">今天有 <span className="font-bold text-rose-600">{todayCount}</span> 位潛客需要跟進</div>
        </div>
        <div className="flex gap-2 flex-none">
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined text-[15px]">phone</span>
            聯絡
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
            <span className="material-symbols-outlined text-[15px]">payments</span>
            簽字金額
          </button>
        </div>
      </div>

      {/* 主 Tabs + 新增按鈕 */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
        {mainTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchMainTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mainTab === tab.key ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
            }`}
            style={mainTab === tab.key ? { backgroundColor: "#CC0000" } : {}}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                mainTab === tab.key ? "bg-white/30 text-white" : "bg-rose-100 text-rose-700"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#CC0000" }}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            新增潛客
          </button>
        </div>
      </div>

      {/* 子 Tabs */}
      <div className="flex items-center gap-2 px-1 flex-wrap">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              subTab === tab.key
                ? "bg-gray-800 text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >
            {tab.label}
            {subCounts[tab.key] > 0 && (
              <span className={`text-[10px] font-bold ${subTab === tab.key ? "text-white/60" : "text-gray-400"}`}>
                {subCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 資料表 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="material-symbols-outlined text-[48px] mb-3">inbox</span>
            <div className="text-sm">此分類目前沒有潛客</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ minWidth: "1700px", width: "100%" }}>
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-3 py-3 text-left font-medium w-8">#</th>
                  <th className="px-3 py-3 text-left font-medium">線索來源</th>
                  <th className="px-3 py-3 text-left font-medium">首次來電</th>
                  <th className="px-3 py-3 text-left font-medium">銷售顧問</th>
                  <th className="px-3 py-3 text-left font-medium">客戶姓名</th>
                  <th className="px-3 py-3 text-left font-medium">聯繫電話</th>
                  <th className="px-3 py-3 text-left font-medium">現有車輛</th>
                  <th className="px-3 py-3 text-left font-medium">意向車型</th>
                  <th className="px-3 py-3 text-left font-medium">預算</th>
                  <th className="px-3 py-3 text-left font-medium">購買方式</th>
                  <th className="px-3 py-3 text-left font-medium">付款</th>
                  <th className="px-3 py-3 text-left font-medium">接觸判別</th>
                  <th className="px-3 py-3 text-left font-medium">第1跟進</th>
                  <th className="px-3 py-3 text-left font-medium">客戶反映</th>
                  <th className="px-3 py-3 text-left font-medium">跟進結果</th>
                  <th className="px-3 py-3 text-left font-medium">第2跟進</th>
                  <th className="px-3 py-3 text-left font-medium">最終結果</th>
                  <th className="px-3 py-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-rose-50/40 transition-colors">
                    <td className="px-3 py-3 text-gray-400 text-xs">{p.id}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sourceChipColor[p.source] ?? "bg-gray-100 text-gray-600"}`}>
                        {p.source}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{p.firstContactDate}</td>
                    <td className="px-3 py-3 text-gray-700 text-xs">{p.advisor}</td>
                    <td className="px-3 py-3 font-semibold text-gray-800">{p.name}</td>
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs">{p.phone}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      <span className="font-medium">{p.ownedBrand}</span> {p.ownedModel}
                      <br />
                      <span className="text-gray-400">{p.ownedYear}・{p.ownedMileage}</span>
                    </td>
                    <td className="px-3 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">{p.intendedModel}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{p.budgetLow} – {p.budgetHigh}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{p.purchaseMethod}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{p.paymentForm}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{p.contactJudgement}</td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {p.followup1Date ? (
                        <>
                          <div className="text-gray-600">{p.followup1Status}</div>
                          <div className="text-gray-400">{p.followup1Date}</div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.followup1Reaction ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${reactionChipColor[p.followup1Reaction] ?? "bg-gray-100 text-gray-500"}`}>
                          {p.followup1Reaction}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${resultChipColor[p.followupResult] ?? "bg-gray-100 text-gray-500"}`}>
                        {p.followupResult}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {p.followup2Date ? (
                        <>
                          <div className="text-gray-600">{p.followup2Status}</div>
                          <div className="text-gray-400">{p.followup2Date}</div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {p.finalResult || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "#CC0000" }}
                      >
                        跟進
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
