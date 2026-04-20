"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

type SubTab = "3d" | "7d" | "reception" | "visit" | "maintain" | "lost";

type Prospect = {
  id: number;
  source: string;
  phone: string;
  ownedBrand: string;
  ownedModel: string;
  ownedMileage: string;
  carStatus: string;
  intendedModel: string;
  listPrice: number;
  budget: number;
  contactJudgement: string;
  memo: string;
  subStage: SubTab;
};

const PROSPECTS: Prospect[] = [
  { id: 1, source: "電商平台",    phone: "18692277327", ownedBrand: "別克", ownedModel: "凱越", ownedMileage: "13萬公里", carStatus: "在途",  intendedModel: "ES200",  listPrice: 288000,  budget: 250000,  contactJudgement: "有意向來店", memo: "", subStage: "3d" },
  { id: 2, source: "展廳",        phone: "13611206780", ownedBrand: "",     ownedModel: "",     ownedMileage: "",         carStatus: "在途",  intendedModel: "ES200",  listPrice: 288000,  budget: 200000,  contactJudgement: "有意向來店", memo: "", subStage: "3d" },
  { id: 3, source: "微信朋友圈",  phone: "18974985546", ownedBrand: "",     ownedModel: "",     ownedMileage: "",         carStatus: "整備中", intendedModel: "NX200T", listPrice: 288800,  budget: 250000,  contactJudgement: "有意向來店", memo: "", subStage: "3d" },
  { id: 4, source: "微信朋友圈",  phone: "13908480787", ownedBrand: "丰田", ownedModel: "花冠", ownedMileage: "8萬公里",  carStatus: "在途",  intendedModel: "ES200",  listPrice: 246800,  budget: 225000,  contactJudgement: "外地線索",   memo: "", subStage: "3d" },
  { id: 5, source: "老客戶轉介紹", phone: "13755061833", ownedBrand: "",    ownedModel: "",     ownedMileage: "",         carStatus: "在途",  intendedModel: "LX570",  listPrice: 1280000, budget: 1180000, contactJudgement: "有意向來店", memo: "", subStage: "3d" },
  { id: 6, source: "微信朋友圈",  phone: "13948568977", ownedBrand: "",     ownedModel: "",     ownedMileage: "",         carStatus: "在途",  intendedModel: "NX200T", listPrice: 288800,  budget: 200000,  contactJudgement: "無效線索",   memo: "", subStage: "3d" },
  { id: 7, source: "微信朋友圈",  phone: "13974956999", ownedBrand: "",     ownedModel: "",     ownedMileage: "",         carStatus: "在途",  intendedModel: "ES200",  listPrice: 288000,  budget: 285000,  contactJudgement: "線索直接成交", memo: "", subStage: "3d" },
  { id: 8, source: "電商平台",    phone: "13812345678", ownedBrand: "本田", ownedModel: "雅閣", ownedMileage: "5萬公里",  carStatus: "在途",  intendedModel: "ES300h", listPrice: 388000,  budget: 350000,  contactJudgement: "有意向來店", memo: "", subStage: "7d" },
  { id: 9, source: "展廳",        phone: "15987654321", ownedBrand: "BMW",  ownedModel: "3系",  ownedMileage: "10萬公里", carStatus: "整備中", intendedModel: "NX300",  listPrice: 348000,  budget: 320000,  contactJudgement: "外地線索",   memo: "", subStage: "7d" },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早安";
  if (h < 18) return "午安";
  return "晚安";
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}年 ${String(d.getMonth() + 1).padStart(2, "0")}月 ${String(d.getDate()).padStart(2, "0")}日`;
}

const sourceColor: Record<string, string> = {
  "電商平台":    "bg-teal-100 text-teal-700",
  "展廳":        "bg-indigo-100 text-indigo-700",
  "老客戶轉介紹": "bg-violet-100 text-violet-700",
  "微信朋友圈":  "bg-sky-100 text-sky-700",
};

const judgeColor: Record<string, string> = {
  "有意向來店":   "text-emerald-700",
  "外地線索":     "text-amber-600",
  "無效線索":     "text-gray-400",
  "線索直接成交": "text-blue-700 font-semibold",
};

const carStatusColor: Record<string, string> = {
  "在途":  "bg-blue-50 text-blue-600",
  "整備中": "bg-amber-50 text-amber-600",
};

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "3d",        label: "第一次聯繫（3D）" },
  { key: "7d",        label: "第二次聯繫（7D）" },
  { key: "reception", label: "接待銷售" },
  { key: "visit",     label: "進店管道" },
  { key: "maintain",  label: "可保持聯繫" },
  { key: "lost",      label: "已戰敗" },
];

export default function UsedCarProspectsPage() {
  useSetPageHeader({ title: "潛客跟進", hideSearch: true });

  const [subTab, setSubTab]   = useState<SubTab>("3d");
  const [search, setSearch]   = useState("");
  const [memos, setMemos]     = useState<Record<number, string>>({});

  const todayStr  = formatDate(new Date());
  const greeting  = getGreeting();

  const todayCount  = 7;
  const firstCount  = 5;
  const secondCount = 2;
  const stockCount  = 150;

  const visible = PROSPECTS.filter(
    (p) => p.subStage === subTab && (search === "" || p.phone.includes(search) || p.intendedModel.includes(search) || p.source.includes(search))
  );

  const subCounts = SUB_TABS.reduce<Record<SubTab, number>>((acc, t) => {
    acc[t.key] = PROSPECTS.filter((p) => p.subStage === t.key).length;
    return acc;
  }, { "3d": 0, "7d": 0, "reception": 0, "visit": 0, "maintain": 0, "lost": 0 });

  return (
    <div className="space-y-3 pb-10">

      {/* ── 頂部「今日工作」Hero ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="text-xl font-bold text-gray-900 mb-1">今日工作</div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 flex-none">
            {todayStr}
            <div className="mt-0.5 font-semibold text-gray-700">Hi Russell，{greeting}</div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋"
            className="flex-1 max-w-xs h-8 px-3 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button className="h-8 px-5 text-sm font-semibold bg-blue-400 text-white rounded hover:bg-blue-500 transition-colors">篩選</button>
          <button className="h-8 px-5 text-sm font-semibold bg-blue-400 text-white rounded hover:bg-blue-500 transition-colors">顯示全部</button>
        </div>
      </div>

      {/* ── 統計 chips ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-4 py-2 rounded border-2 border-red-500 bg-red-500 text-white text-sm font-bold">
          今日應聯繫 {todayCount}
        </div>
        <div className="px-4 py-2 rounded border-2 border-yellow-400 bg-white text-yellow-700 text-sm font-bold">
          第一次跟進 {firstCount}
        </div>
        <div className="px-4 py-2 rounded border-2 border-yellow-400 bg-white text-yellow-700 text-sm font-bold">
          第二次跟進 {secondCount}
        </div>
        <div className="px-4 py-2 rounded border-2 border-sky-300 bg-white text-sky-700 text-sm font-bold">
          庫存審查 {stockCount}
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              subTab === t.key
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {t.label}
            {subCounts[t.key] > 0 && (
              <span className={`ml-1.5 text-xs ${subTab === t.key ? "text-white/60" : "text-gray-400"}`}>
                {subCounts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 資料表 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="material-symbols-outlined text-[48px] mb-3">inbox</span>
            <div className="text-sm">此分類目前沒有資料</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: "1200px", width: "100%" }}>
              <thead>
                {/* ── 第一排：合併欄位標題 ── */}
                <tr className="bg-gray-100 border-b border-gray-200 text-center text-[11px] font-semibold text-gray-700">
                  <th className="border border-gray-200 px-2 py-1.5 text-left" rowSpan={2}>線索來源</th>
                  {/* 現有車輛信息 跨 5 欄 */}
                  <th className="border border-gray-200 px-2 py-1.5" colSpan={5}>現有車輛信息</th>
                  {/* 意向購買信息 跨 4 欄 */}
                  <th className="border border-gray-200 px-2 py-1.5" colSpan={4}>意向購買信息</th>
                  <th className="border border-gray-200 px-2 py-1.5" rowSpan={2}>接觸判別</th>
                  <th className="border border-gray-200 px-2 py-1.5 min-w-[120px]" rowSpan={2}>接觸備忘錄<br/><span className="font-normal text-gray-500">（文字輸入）</span></th>
                  <th className="border border-gray-200 px-2 py-1.5" rowSpan={2}>電話</th>
                </tr>
                {/* ── 第二排：子欄標題 ── */}
                <tr className="bg-gray-50 border-b border-gray-200 text-center text-[11px] text-gray-600">
                  <th className="border border-gray-200 px-2 py-1.5">聯系電話</th>
                  <th className="border border-gray-200 px-2 py-1.5">品牌</th>
                  <th className="border border-gray-200 px-2 py-1.5">車型</th>
                  <th className="border border-gray-200 px-2 py-1.5">行駛里程</th>
                  <th className="border border-gray-200 px-2 py-1.5">車源現況</th>
                  <th className="border border-gray-200 px-2 py-1.5">車型</th>
                  <th className="border border-gray-200 px-2 py-1.5">線上報價<br/>（定價）</th>
                  <th className="border border-gray-200 px-2 py-1.5">購買預算</th>
                  <th className="border border-gray-200 px-2 py-1.5">期望匹配</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const diff = p.budget - p.listPrice;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                      {/* 線索來源 */}
                      <td className="border border-gray-100 px-2 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${sourceColor[p.source] ?? "bg-gray-100 text-gray-600"}`}>
                          {p.source}
                        </span>
                      </td>
                      {/* 現有車輛信息 */}
                      <td className="border border-gray-100 px-2 py-2 font-mono">{p.phone}</td>
                      <td className="border border-gray-100 px-2 py-2 text-center">{p.ownedBrand || <span className="text-gray-300">—</span>}</td>
                      <td className="border border-gray-100 px-2 py-2 text-center">{p.ownedModel || <span className="text-gray-300">—</span>}</td>
                      <td className="border border-gray-100 px-2 py-2 text-center whitespace-nowrap">{p.ownedMileage || <span className="text-gray-300">—</span>}</td>
                      <td className="border border-gray-100 px-2 py-2 text-center">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${carStatusColor[p.carStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          {p.carStatus}
                        </span>
                      </td>
                      {/* 意向購買信息 */}
                      <td className="border border-gray-100 px-2 py-2 text-center font-semibold text-gray-800">{p.intendedModel}</td>
                      <td className="border border-gray-100 px-2 py-2 text-right text-gray-700">{p.listPrice.toLocaleString()}</td>
                      <td className="border border-gray-100 px-2 py-2 text-right text-gray-700">{p.budget.toLocaleString()}</td>
                      <td className={`border border-gray-100 px-2 py-2 text-right font-semibold ${diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {diff >= 0 ? "+" : ""}{diff.toLocaleString()}
                      </td>
                      {/* 接觸判別 */}
                      <td className={`border border-gray-100 px-2 py-2 text-center text-[11px] ${judgeColor[p.contactJudgement] ?? "text-gray-600"}`}>
                        {p.contactJudgement}
                      </td>
                      {/* 備忘錄 */}
                      <td className="border border-gray-100 px-2 py-2">
                        <input
                          value={memos[p.id] ?? p.memo}
                          onChange={(e) => setMemos((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="輸入備注..."
                          className="w-full text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                      </td>
                      {/* 操作圖示 */}
                      <td className="border border-gray-100 px-2 py-2">
                        <div className="flex flex-col gap-1 items-center">
                          <button className="p-1 rounded hover:bg-gray-100 transition-colors" title="電話">
                            <span className="material-symbols-outlined text-[16px] text-blue-500">phone</span>
                          </button>
                          <button className="p-1 rounded hover:bg-gray-100 transition-colors" title="訊息">
                            <span className="material-symbols-outlined text-[16px] text-green-500">chat</span>
                          </button>
                          <button className="p-1 rounded hover:bg-gray-100 transition-colors" title="圖片">
                            <span className="material-symbols-outlined text-[16px] text-gray-400">image</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
