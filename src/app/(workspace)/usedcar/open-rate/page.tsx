"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const ACCENT = "#F43F5E";
const TARGET_OPEN_RATE = 10;

const kpis = [
  { label: "本月新車進店（有效）", value: "1,181", unit: "人", color: "#6B7280", ok: null },
  { label: "已開口介紹中古", value: "99", unit: "人", color: "#3B82F6", ok: null },
  { label: "開口率", value: "8.4%", unit: "", color: "#EF4444", ok: false, target: "目標 10%" },
  { label: "已評估", value: "99", unit: "台", color: "#8B5CF6", ok: null },
  { label: "已置換成交", value: "8", unit: "台", color: "#10B981", ok: null },
  { label: "評估→成交轉換率", value: "8.1%", unit: "", color: "#F59E0B", ok: null },
];

const funnelLevels = [
  { label: "新車有效進店", count: "1,181 人", pct: null, width: "100%" },
  { label: "開口介紹中古", count: "99 人", pct: "8.4%", width: "8.4%" },
  { label: "本品評估", count: "99 台", pct: "100%", width: "8.4%" },
  { label: "確認置換", count: "8 台", pct: "8.1%", width: "0.7%" },
];

const advisors = [
  { name: "陳志明", visits: 260, opens: 28, openRate: 10.8, evals: 28, deals: 3, achievePct: 108, achieved: true },
  { name: "王美惠", visits: 220, opens: 15, openRate: 6.8, evals: 15, deals: 1, achievePct: 68, achieved: false },
  { name: "林建宏", visits: 198, opens: 19, openRate: 9.6, evals: 19, deals: 2, achievePct: 96, achieved: false },
  { name: "張雅琴", visits: 180, opens: 12, openRate: 6.7, evals: 12, deals: 1, achievePct: 67, achieved: false },
  { name: "劉佳欣", visits: 175, opens: 14, openRate: 8.0, evals: 14, deals: 1, achievePct: 80, achieved: false },
  { name: "黃俊豪", visits: 148, opens: 11, openRate: 7.4, evals: 11, deals: 0, achievePct: 74, achieved: false },
];

const monthlyTrend = [
  { month: "1月", openRate: 7.5, evalRate: 100, tradeRate: 6.8 },
  { month: "2月", openRate: 7.2, evalRate: 100, tradeRate: 0.9 },
  { month: "3月", openRate: 10.8, evalRate: 100, tradeRate: 8.9 },
  { month: "4月", openRate: 8.4, evalRate: 100, tradeRate: 8.1 },
  { month: "5月", openRate: 9.4, evalRate: 100, tradeRate: 9.5 },
  { month: "6月", openRate: 9.2, evalRate: 100, tradeRate: 8.3 },
];

export default function OpenRatePage() {
  useSetPageHeader({ title: "開口率管理" });

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="text-sm text-gray-500 mb-5">追蹤新車客戶中推銷中古車的開口率及轉換效果</div>

      <div className="grid grid-cols-6 gap-3 mb-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`bg-white rounded-xl border p-4 ${k.ok === false ? "border-red-200" : "border-gray-100"}`}
          >
            <div className="text-xs text-gray-500 mb-1 leading-tight">{k.label}</div>
            <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
            {k.unit && <div className="text-xs text-gray-400">{k.unit}</div>}
            {k.target && (
              <div className="mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-red-400" style={{ fontSize: 14 }}>arrow_downward</span>
                <span className="text-xs text-red-400">{k.target}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-4 mb-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">客戶漏斗視覺化</div>
          <div className="space-y-2">
            {funnelLevels.map((level, i) => (
              <div key={level.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{level.label}</span>
                  <div className="flex items-center gap-2">
                    {level.pct && (
                      <span
                        className={`font-semibold ${parseFloat(level.pct) >= TARGET_OPEN_RATE ? "text-green-600" : "text-red-500"}`}
                      >
                        {level.pct}
                      </span>
                    )}
                    <span className="font-semibold text-gray-700">{level.count}</span>
                  </div>
                </div>
                <div className="relative h-8 bg-gray-50 rounded-lg overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full rounded-lg flex items-center pl-2"
                    style={{
                      width: level.width,
                      minWidth: i === 0 ? "100%" : "12%",
                      backgroundColor: i === 0 ? "#F3F4F6" : i === funnelLevels.length - 1 ? "#10B981" : ACCENT,
                      opacity: i === 0 ? 1 : 0.85,
                    }}
                  >
                    {i === 0 && (
                      <span className="text-xs font-medium text-gray-600 ml-1">{level.count}</span>
                    )}
                  </div>
                  {i > 0 && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-white">
                      {level.count}
                    </span>
                  )}
                </div>
                {i < funnelLevels.length - 1 && (
                  <div className="flex justify-center mt-1">
                    <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 16 }}>arrow_downward</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">銷售顧問開口率排行</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["顧問", "進店客戶", "開口次數", "開口率", "評估台", "成交台", "目標達成"].map((h) => (
                  <th key={h} className="py-2 text-xs font-semibold text-gray-400 text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {advisors.map((a) => (
                <tr key={a.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 font-medium text-gray-800">{a.name}</td>
                  <td className="py-2.5 text-right text-gray-600 tabular-nums">{a.visits}</td>
                  <td className="py-2.5 text-right text-gray-600 tabular-nums">{a.opens}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className={`font-semibold ${a.openRate >= TARGET_OPEN_RATE ? "text-green-600" : "text-red-500"}`}>
                      {a.openRate}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-gray-600 tabular-nums">{a.evals}</td>
                  <td className="py-2.5 text-right text-gray-600 tabular-nums">{a.deals}</td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        a.achieved
                          ? "bg-green-100 text-green-700"
                          : a.achievePct >= 90
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {a.achieved && (
                        <span className="material-symbols-outlined mr-0.5" style={{ fontSize: 12 }}>check</span>
                      )}
                      {a.achievePct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 達標 ≥100%</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 接近 90-99%</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 未達 &lt;90%</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">月度趨勢（%）</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 text-xs font-semibold text-gray-400 text-left w-20">月份</th>
                {monthlyTrend.map((r) => (
                  <th key={r.month} className="py-2 text-center text-xs font-semibold text-gray-500">{r.month}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: "開口率",
                  values: monthlyTrend.map((r) => r.openRate),
                  target: TARGET_OPEN_RATE,
                  color: ACCENT,
                },
                {
                  label: "評估率",
                  values: monthlyTrend.map((r) => r.evalRate),
                  target: 80,
                  color: "#8B5CF6",
                },
                {
                  label: "置換率",
                  values: monthlyTrend.map((r) => r.tradeRate),
                  target: 8,
                  color: "#10B981",
                },
              ].map((row) => (
                <tr key={row.label} className="border-b border-gray-50">
                  <td className="py-3 text-xs font-medium text-gray-600">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="py-3 text-center">
                      <div className={`text-sm font-bold ${v >= row.target ? "text-green-600" : "text-red-500"}`}>
                        {v}%
                      </div>
                      <div className="mt-1 mx-auto w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(v / row.target * 100, 100)}%`,
                            backgroundColor: v >= row.target ? "#10B981" : row.color,
                          }}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
