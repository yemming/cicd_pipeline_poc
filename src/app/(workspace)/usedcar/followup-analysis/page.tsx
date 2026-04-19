"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const ACCENT = "#F43F5E";

const funnelStages = [
  { label: "總線索", count: 7, pct: "100%", color: "#6B7280" },
  { label: "第一次跟進成功", count: 6, pct: "85.7%", color: "#3B82F6" },
  { label: "第二次跟進", count: 4, pct: "57.1%", color: "#8B5CF6" },
  { label: "最終成交", count: 1, pct: "14.3%", color: "#10B981" },
];

const first = {
  total: 7,
  contacted: 7,
  success: 6,
  successRate: "100%",
  byChannel: [
    { label: "前次邀約到店", count: 0 },
    { label: "電話接通", count: 6 },
    { label: "微信留言", count: 0 },
  ],
  pending: 5,
  failed: 1,
  failedReason: "拒絕再談",
  metrics: [
    { label: "首次進店率", value: "0%", ok: false },
    { label: "持續跟進率", value: "85.7%", ok: true },
    { label: "戰敗率", value: "14.3%", ok: false },
  ],
  deal: 1,
};

const second = {
  total: 4,
  success: 2,
  successRate: "50%",
  pending: 5,
  failed: 3,
  failedReasons: [
    { reason: "無法接通", count: 2 },
    { reason: "拒絕再談", count: 1 },
  ],
  metrics: [
    { label: "二次進店率", value: "0%", ok: false },
    { label: "持續跟進率", value: "100%", ok: true },
    { label: "戰敗率", value: "0%", ok: true },
  ],
  deal: 1,
};

const defeatDest = [
  { label: "瑞祥名車", count: 1 },
  { label: "其他品牌經銷商", count: 0 },
  { label: "暫緩購買", count: 0 },
  { label: "未知", count: 0 },
];

const summary = [
  { label: "總線索", value: "7 筆", color: "text-gray-800" },
  { label: "總成交", value: "1 台（14.3%）", color: "text-green-600" },
  { label: "戰敗", value: "1 台（14.3%）", color: "text-red-500" },
  { label: "休眠", value: "0 台", color: "text-gray-400" },
];

export default function FollowupAnalysisPage() {
  useSetPageHeader({ title: "跟進分析" });

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>calendar_month</span>
          <span className="font-medium text-gray-700">2026年4月</span>
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>expand_more</span>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>person</span>
          <span className="font-medium text-gray-700">全部顧問</span>
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>expand_more</span>
        </div>
      </div>

      <div className="flex items-stretch gap-3 mb-4">
        {funnelStages.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3 flex-1">
            <div className="flex-1 bg-white rounded-xl border border-gray-100 p-4 text-center">
              <div className="text-3xl font-bold" style={{ color: s.color }}>{s.count}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              <div className="text-sm font-semibold mt-1" style={{ color: s.color }}>{s.pct}</div>
            </div>
            {i < funnelStages.length - 1 && (
              <span className="material-symbols-outlined text-gray-300" style={{ fontSize: 28 }}>arrow_forward</span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">第一次跟進分析</div>
          <div className="flex items-center gap-2 mb-4">
            <div className="text-2xl font-bold text-green-600">{first.successRate}</div>
            <div className="text-sm text-gray-500">跟進成功率（{first.contacted}/{first.total}）</div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="text-xs text-gray-400 font-medium">成功方式</div>
            {first.byChannel.map((c) => (
              <div key={c.label} className="flex justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-gray-600">{c.label}</span>
                <span className={`font-semibold ${c.count > 0 ? "text-blue-600" : "text-gray-300"}`}>{c.count}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="text-xl font-bold text-yellow-600">{first.pending}</div>
              <div className="text-xs text-yellow-700 mt-0.5">需再跟進</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xl font-bold text-red-500">{first.failed}</div>
              <div className="text-xs text-red-600 mt-0.5">{first.failedReason}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {first.metrics.map((m) => (
              <div key={m.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{m.label}</span>
                <span className={`font-semibold ${m.ok ? "text-green-600" : "text-red-500"}`}>{m.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">成交（月累積）</span>
            <span className="font-bold text-green-600">{first.deal} 台</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">第二次跟進分析</div>
          <div className="flex items-center gap-2 mb-4">
            <div className="text-2xl font-bold text-blue-600">{second.successRate}</div>
            <div className="text-sm text-gray-500">成功率（{second.success}/{second.total}）</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="text-xl font-bold text-yellow-600">{second.pending}</div>
              <div className="text-xs text-yellow-700 mt-0.5">需再跟進</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xl font-bold text-red-500">{second.failed}</div>
              <div className="text-xs text-red-600 mt-0.5">跟進失敗</div>
            </div>
          </div>
          <div className="space-y-2 mb-4">
            <div className="text-xs text-gray-400 font-medium">失敗原因</div>
            {second.failedReasons.map((r) => (
              <div key={r.reason} className="flex justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-gray-600">{r.reason}</span>
                <span className="font-semibold text-red-400">{r.count}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {second.metrics.map((m) => (
              <div key={m.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{m.label}</span>
                <span className={`font-semibold ${m.ok ? "text-green-600" : "text-red-500"}`}>{m.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">成交（月累積）</span>
            <span className="font-bold text-green-600">{second.deal} 台</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">客戶去向分析（戰敗）</div>
          <div className="space-y-3">
            {defeatDest.map((d) => (
              <div key={d.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{d.label}</span>
                  <span className="font-semibold text-gray-700">{d.count} 位</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: d.count > 0 ? "100%" : "0%", backgroundColor: ACCENT }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">月底彙總</div>
          <div className="space-y-3">
            {summary.map((s) => (
              <div key={s.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{s.label}</span>
                <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
