"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const ACCENT = "#F43F5E";

const sources = [
  { label: "微信朋友圈", count: 4, pct: 57 },
  { label: "老客戶轉介紹", count: 2, pct: 29 },
  { label: "展廳到訪", count: 1, pct: 14 },
];

const purchaseTypes = [
  { label: "首購", value: 0 },
  { label: "增購", value: 6 },
  { label: "換購", value: 1 },
];

const contactTypes = [
  { label: "有意向來店", count: 4, color: "#10B981" },
  { label: "線索直接成交", count: 1, color: "#3B82F6" },
  { label: "無效線索", count: 1, color: "#EF4444" },
  { label: "外地線索", count: 1, color: "#A78BFA" },
];

const stockStatus = [
  { label: "在庫", count: 0, bg: "bg-green-50", text: "text-green-700" },
  { label: "整備中", count: 1, bg: "bg-yellow-50", text: "text-yellow-700" },
  { label: "在途", count: 6, bg: "bg-blue-50", text: "text-blue-700" },
  { label: "外採上訂", count: 0, bg: "bg-gray-50", text: "text-gray-500" },
];

const budgetSegments = [
  { label: "預算偏低 (<NT$50萬)", count: 3, pct: 43, color: "#EF4444" },
  { label: "符合期望", count: 4, pct: 57, color: "#10B981" },
  { label: "預算偏高", count: 0, pct: 0, color: "#6B7280" },
];

export default function LeadAnalysisPage() {
  useSetPageHeader({ title: "線索分析" });

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>calendar_month</span>
          <span className="font-medium text-gray-700">2026年4月</span>
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>expand_more</span>
        </div>
        <span className="text-sm text-gray-500">共 <span className="font-semibold text-gray-800">7</span> 筆線索</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">線索來源分佈</div>
          <div className="space-y-3">
            {sources.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{s.label}</span>
                  <span className="font-semibold text-gray-800">{s.count} 筆</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${s.pct}%`, backgroundColor: ACCENT }}
                  />
                </div>
                <div className="text-right text-xs text-gray-400 mt-0.5">{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">購買方式分佈</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {purchaseTypes.map((t) => (
              <div key={t.label} className="text-center">
                <div className="text-3xl font-bold text-gray-800">{t.value}</div>
                <div className="text-xs text-gray-500 mt-1">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-rose-50 rounded-lg px-3 py-2 text-center">
            <span className="text-xs text-rose-600 font-medium">增購為主（佔 85.7%）</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">付款形式</div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            {[
              { label: "現金", count: 7, pct: 100, color: "#10B981" },
              { label: "分期", count: 0, pct: 0, color: "#6B7280" },
            ].map((p) => (
              <div key={p.label} className="flex flex-col items-center">
                <div
                  className="w-20 h-20 rounded-full flex flex-col items-center justify-center border-4"
                  style={{ borderColor: p.color }}
                >
                  <span className="text-xl font-bold" style={{ color: p.color }}>{p.pct}%</span>
                  <span className="text-xs text-gray-500">{p.count} 筆</span>
                </div>
                <div className="text-sm font-medium text-gray-700 mt-2">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">接觸情況分析</div>
          <div className="space-y-2">
            {contactTypes.map((c) => (
              <div key={c.label} className="flex items-center gap-3 py-2 border-l-4 pl-3 rounded-r-lg bg-gray-50" style={{ borderColor: c.color }}>
                <div className="flex-1 text-sm text-gray-700">{c.label}</div>
                <div className="text-base font-bold" style={{ color: c.color }}>{c.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">車源現況</div>
          <div className="grid grid-cols-2 gap-3">
            {stockStatus.map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
                <div className={`text-3xl font-bold ${s.text}`}>{s.count}</div>
                <div className={`text-xs mt-1 ${s.text}`}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">期望匹配（預算）</div>
          <div className="space-y-4">
            {budgetSegments.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{b.label}</span>
                  <span className="font-semibold" style={{ color: b.color }}>{b.count} 筆</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">本月線索追蹤彙總</div>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: "線索總量", value: "7 筆" },
                { label: "已跟進", value: "7 筆", className: "text-green-600 font-semibold" },
                { label: "尚未跟進", value: "0 筆", className: "text-gray-400" },
                { label: "現有車輛統計", value: "2 筆" },
              ].map((row) => (
                <tr key={row.label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 text-gray-600">{row.label}</td>
                  <td className={`py-2.5 text-right font-medium ${row.className ?? "text-gray-800"}`}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">轉推薦情況</div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            {[
              { label: "需要轉推薦", count: 0, color: "#EF4444", bg: "bg-red-50" },
              { label: "不需要轉推薦", count: 7, color: "#10B981", bg: "bg-green-50" },
            ].map((r) => (
              <div key={r.label} className={`${r.bg} rounded-xl p-5 text-center`}>
                <div className="text-4xl font-bold" style={{ color: r.color }}>{r.count}</div>
                <div className="text-xs text-gray-600 mt-2">{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
