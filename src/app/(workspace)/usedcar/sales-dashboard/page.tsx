"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const ACCENT = "#F43F5E";

const kpis = [
  { label: "本月線索", value: "7", unit: "筆", sub: null, borderColor: "#F43F5E" },
  { label: "已跟進", value: "7", unit: "筆", sub: "100%", borderColor: "#10B981" },
  { label: "待跟進", value: "0", unit: "筆", sub: null, borderColor: "#6B7280" },
  { label: "成交台數", value: "1", unit: "台", sub: "成交率 14.3%", borderColor: "#3B82F6" },
  { label: "戰敗台數", value: "1", unit: "台", sub: "戰敗率 14.3%", borderColor: "#EF4444" },
  { label: "休眠中", value: "0", unit: "台", sub: null, borderColor: "#A78BFA" },
];

const sources = [
  { label: "微信朋友圈", count: 4, max: 4 },
  { label: "老客戶轉介紹", count: 2, max: 4 },
  { label: "展廳", count: 1, max: 4 },
];

const followupResults = [
  { label: "確認成交", count: 1, color: "#10B981" },
  { label: "持續跟進", count: 4, color: "#3B82F6" },
  { label: "確認戰敗", count: 1, color: "#EF4444" },
  { label: "休眠狀態", count: 0, color: "#9CA3AF" },
  { label: "待跟進", count: 1, color: "#F59E0B" },
];

const tasks = [
  {
    name: "王大明",
    phone: "****3892",
    ownedModel: "Yamaha MT-07",
    intendedModel: "Monster",
    followupRound: "第 2 次",
    nextDate: "2026-04-22",
    status: "持續跟進",
    statusColor: "bg-blue-100 text-blue-700",
  },
  {
    name: "林美玲",
    phone: "****7741",
    ownedModel: "Suzuki GSX",
    intendedModel: "Diavel V4",
    followupRound: "第 1 次",
    nextDate: "2026-04-23",
    status: "持續跟進",
    statusColor: "bg-blue-100 text-blue-700",
  },
  {
    name: "張偉平",
    phone: "****5513",
    ownedModel: "BMW F800",
    intendedModel: "Multistrada V4",
    followupRound: "第 2 次",
    nextDate: "2026-04-25",
    status: "持續跟進",
    statusColor: "bg-blue-100 text-blue-700",
  },
  {
    name: "劉雅婷",
    phone: "****0028",
    ownedModel: "Ducati Monster 797",
    intendedModel: "Panigale V4",
    followupRound: "第 1 次",
    nextDate: "2026-04-26",
    status: "待跟進",
    statusColor: "bg-amber-100 text-amber-700",
  },
  {
    name: "黃建國",
    phone: "****6604",
    ownedModel: "KTM Duke 390",
    intendedModel: "Hypermotard",
    followupRound: "第 2 次",
    nextDate: "2026-04-28",
    status: "休眠狀態",
    statusColor: "bg-gray-100 text-gray-600",
  },
];

const purchaseMethods = [
  { label: "換購", count: 3 },
  { label: "增購", count: 2 },
  { label: "首購", count: 2 },
];

const contactJudgements = [
  { label: "有意向來店", count: 3 },
  { label: "線索直接成交", count: 1 },
  { label: "無意向來店", count: 1 },
  { label: "外地線索", count: 1 },
  { label: "僅交換微信", count: 1 },
];

export default function UsedCarSalesDashboardPage() {
  useSetPageHeader({ title: "中古銷售看板", hideSearch: false });

  return (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            style={{ borderLeft: `4px solid ${k.borderColor}` }}
          >
            <p className="text-xs text-gray-500 font-medium mb-1">{k.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-gray-800">{k.value}</span>
              <span className="text-sm text-gray-400">{k.unit}</span>
            </div>
            {k.sub && <p className="text-xs mt-1 font-medium" style={{ color: k.borderColor }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">線索來源分佈</h3>
          <div className="space-y-3">
            {sources.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-24 shrink-0">{s.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2"
                    style={{
                      width: `${(s.count / s.max) * 100}%`,
                      backgroundColor: ACCENT,
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700 w-4 text-right">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">跟進結果彙整</h3>
          <div className="grid grid-cols-5 gap-2">
            {followupResults.map((r) => (
              <div key={r.label} className="flex flex-col items-center gap-1">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: r.color }}
                >
                  {r.count}
                </div>
                <span className="text-xs text-gray-500 text-center leading-tight">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">近期跟進任務</h3>
          <span className="text-xs text-gray-400">{tasks.length} 筆</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-3 text-left font-medium">客戶姓名</th>
                <th className="px-4 py-3 text-left font-medium">聯繫電話</th>
                <th className="px-4 py-3 text-left font-medium">現有車型</th>
                <th className="px-4 py-3 text-left font-medium">意向車型</th>
                <th className="px-4 py-3 text-left font-medium">跟進輪次</th>
                <th className="px-4 py-3 text-left font-medium">下次跟進</th>
                <th className="px-4 py-3 text-left font-medium">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tasks.map((t) => (
                <tr key={t.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono">{t.phone}</td>
                  <td className="px-4 py-3 text-gray-600">{t.ownedModel}</td>
                  <td className="px-4 py-3 text-gray-600">{t.intendedModel}</td>
                  <td className="px-4 py-3 text-gray-600">{t.followupRound}</td>
                  <td className="px-4 py-3 text-gray-600">{t.nextDate}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.statusColor}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">購買方式分佈</h3>
          <div className="space-y-3">
            {purchaseMethods.map((p) => (
              <div key={p.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-10 shrink-0">{p.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(p.count / 7) * 100}%`, backgroundColor: "#8B5CF6" }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700 w-4 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">接觸情況統計</h3>
          <div className="space-y-2">
            {contactJudgements.map((c) => (
              <div key={c.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{c.label}</span>
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {c.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
