"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

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
};

const prospects: Prospect[] = [
  {
    id: 1,
    source: "微信朋友圈",
    firstContactDate: "2026-04-01",
    advisor: "陳志偉",
    name: "王大明",
    phone: "0912****3892",
    ownedBrand: "Yamaha",
    ownedModel: "MT-07",
    ownedYear: 2021,
    ownedMileage: "18,000km",
    intendedModel: "Monster",
    budgetLow: "35萬",
    budgetHigh: "40萬",
    purchaseMethod: "增購",
    paymentForm: "現金",
    contactJudgement: "有意向來店",
    followup1Status: "電話接通",
    followup1Date: "2026-04-03",
    followup1Reaction: "Yes-考慮中",
    followupResult: "持續跟進",
    followup2Status: "電話接通",
    followup2Date: "2026-04-10",
    finalResult: "",
  },
  {
    id: 2,
    source: "展廳",
    firstContactDate: "2026-04-02",
    advisor: "林佳蓉",
    name: "李小華",
    phone: "0933****7741",
    ownedBrand: "Honda",
    ownedModel: "CB500",
    ownedYear: 2019,
    ownedMileage: "32,000km",
    intendedModel: "Scrambler",
    budgetLow: "28萬",
    budgetHigh: "32萬",
    purchaseMethod: "換購",
    paymentForm: "分期",
    contactJudgement: "線索直接成交",
    followup1Status: "前次邀約到店",
    followup1Date: "2026-04-04",
    followup1Reaction: "Yes-預約進店",
    followupResult: "確認成交",
    followup2Status: "",
    followup2Date: "",
    finalResult: "Scrambler 1100 Pro",
  },
  {
    id: 3,
    source: "老客戶轉介紹",
    firstContactDate: "2026-04-03",
    advisor: "陳志偉",
    name: "陳建志",
    phone: "0955****5513",
    ownedBrand: "Kawasaki",
    ownedModel: "Z650",
    ownedYear: 2020,
    ownedMileage: "25,000km",
    intendedModel: "Streetfighter V4",
    budgetLow: "65萬",
    budgetHigh: "75萬",
    purchaseMethod: "首購",
    paymentForm: "現金",
    contactJudgement: "無意向來店",
    followup1Status: "電話接通",
    followup1Date: "2026-04-05",
    followup1Reaction: "No-",
    followupResult: "確認戰敗",
    followup2Status: "",
    followup2Date: "",
    finalResult: "競品車商",
  },
  {
    id: 4,
    source: "微信朋友圈",
    firstContactDate: "2026-04-05",
    advisor: "林佳蓉",
    name: "林美玲",
    phone: "0978****0028",
    ownedBrand: "Suzuki",
    ownedModel: "GSX-S750",
    ownedYear: 2020,
    ownedMileage: "22,000km",
    intendedModel: "Diavel V4",
    budgetLow: "90萬",
    budgetHigh: "105萬",
    purchaseMethod: "增購",
    paymentForm: "分期",
    contactJudgement: "有意向來店",
    followup1Status: "微信留言",
    followup1Date: "2026-04-07",
    followup1Reaction: "Try-",
    followupResult: "持續跟進",
    followup2Status: "電話接通",
    followup2Date: "2026-04-14",
    finalResult: "",
  },
  {
    id: 5,
    source: "老客戶轉介紹",
    firstContactDate: "2026-04-06",
    advisor: "陳志偉",
    name: "張偉平",
    phone: "0966****6604",
    ownedBrand: "BMW",
    ownedModel: "F800GS",
    ownedYear: 2018,
    ownedMileage: "48,000km",
    intendedModel: "Multistrada V4",
    budgetLow: "70萬",
    budgetHigh: "85萬",
    purchaseMethod: "換購",
    paymentForm: "現金",
    contactJudgement: "有意向來店",
    followup1Status: "前次邀約到店",
    followup1Date: "2026-04-09",
    followup1Reaction: "Yes-考慮中",
    followupResult: "持續跟進",
    followup2Status: "電話接通",
    followup2Date: "2026-04-16",
    finalResult: "",
  },
  {
    id: 6,
    source: "微信朋友圈",
    firstContactDate: "2026-04-07",
    advisor: "林佳蓉",
    name: "黃建國",
    phone: "0921****4417",
    ownedBrand: "KTM",
    ownedModel: "Duke 390",
    ownedYear: 2022,
    ownedMileage: "8,000km",
    intendedModel: "Hypermotard",
    budgetLow: "48萬",
    budgetHigh: "55萬",
    purchaseMethod: "首購",
    paymentForm: "分期",
    contactJudgement: "外地線索",
    followup1Status: "無法接通",
    followup1Date: "2026-04-09",
    followup1Reaction: "Try-",
    followupResult: "休眠狀態",
    followup2Status: "微信留言",
    followup2Date: "2026-04-15",
    finalResult: "",
  },
  {
    id: 7,
    source: "老客戶轉介紹",
    firstContactDate: "2026-04-10",
    advisor: "陳志偉",
    name: "劉雅婷",
    phone: "0943****8835",
    ownedBrand: "Ducati",
    ownedModel: "Monster 797",
    ownedYear: 2017,
    ownedMileage: "36,000km",
    intendedModel: "Panigale V4",
    budgetLow: "95萬",
    budgetHigh: "110萬",
    purchaseMethod: "換購",
    paymentForm: "現金",
    contactJudgement: "有意向來店",
    followup1Status: "",
    followup1Date: "",
    followup1Reaction: "",
    followupResult: "待跟進",
    followup2Status: "",
    followup2Date: "",
    finalResult: "",
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

export default function UsedCarProspectsPage() {
  useSetPageHeader({
    title: "潛客跟進表",
    hideSearch: false,
  });

  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [filterAdvisor, setFilterAdvisor] = useState("");

  const filtered = prospects.filter((p) => {
    if (search && !p.name.includes(search) && !p.intendedModel.includes(search)) return false;
    if (filterSource && p.source !== filterSource) return false;
    if (filterResult && p.followupResult !== filterResult) return false;
    if (filterAdvisor && p.advisor !== filterAdvisor) return false;
    return true;
  });

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
          <input
            type="text"
            placeholder="搜尋客戶 / 車型"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/40 w-44"
          />
        </div>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/40"
        >
          <option value="">所有來源</option>
          <option>微信朋友圈</option>
          <option>展廳</option>
          <option>老客戶轉介紹</option>
          <option>電商平台</option>
        </select>
        <select
          value={filterResult}
          onChange={(e) => setFilterResult(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/40"
        >
          <option value="">跟進結果</option>
          <option>確認成交</option>
          <option>持續跟進</option>
          <option>確認戰敗</option>
          <option>休眠狀態</option>
          <option>待跟進</option>
        </select>
        <select
          value={filterAdvisor}
          onChange={(e) => setFilterAdvisor(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-rose-400/40"
        >
          <option value="">銷售顧問</option>
          <option>陳志偉</option>
          <option>林佳蓉</option>
        </select>
        <div className="ml-auto">
          <button
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#F43F5E" }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增潛客
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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
                  <td className="px-3 py-3 text-xs text-gray-500">{p.finalResult || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-3">
                    <button
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "#F43F5E" }}
                    >
                      跟進
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
