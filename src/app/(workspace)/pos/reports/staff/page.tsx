"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { formatNTD } from "@/lib/pos/format";

export default function StaffReportPage() {
  const stats = Array.from(new Set(transactions.map((t) => t.clerk))).map((clerk) => {
    const mine = transactions.filter((t) => t.clerk === clerk);
    return {
      clerk,
      count: mine.length,
      total: mine.reduce((a, b) => a + b.total, 0),
      margin: mine.reduce((a, b) => a + (b.margin ?? 0), 0),
    };
  }).sort((a, b) => b.total - a.total);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <PosPageShell title="員工業績" subtitle="本月排行榜 · Gamify">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="活躍員工" value={stats.length} icon="groups" tone="indigo" />
        <KpiCard label="人均業績" value={formatNTD(Math.round(stats.reduce((a, b) => a + b.total, 0) / stats.length))} icon="functions" tone="emerald" />
        <KpiCard label="冠軍業績" value={formatNTD(stats[0].total)} icon="military_tech" tone="amber" />
        <KpiCard label="本月目標達成" value={`${stats.filter(s => s.total > 500000).length}/${stats.length}`} icon="flag" tone="sky" />
      </div>

      <Card title="本月業績榜" icon="leaderboard">
        <div className="space-y-3">
          {stats.map((s, i) => (
            <div
              key={s.clerk}
              className={`flex items-center gap-4 p-4 rounded-xl ${
                i === 0 ? "bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300" :
                i === 1 ? "bg-slate-50 border border-slate-300" :
                i === 2 ? "bg-orange-50 border border-orange-200" :
                "bg-white border border-slate-200"
              }`}
            >
              <div className="text-3xl">
                {medals[i] ?? <span className="text-lg text-slate-400">#{i + 1}</span>}
              </div>
              <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm">
                {s.clerk.slice(-2)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900">{s.clerk}</p>
                <p className="text-xs text-slate-500">{s.count} 筆交易 · 毛利 {formatNTD(s.margin)}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-extrabold tabular-nums text-indigo-600">
                  {formatNTD(s.total)}
                </p>
                <div className="flex gap-1 mt-1 justify-end">
                  {s.total > 800000 && <Badge tone="success">旗艦級</Badge>}
                  {s.total > 500000 && s.total <= 800000 && <Badge tone="brand">達標</Badge>}
                  {s.count >= 10 && <Badge tone="warning">高頻</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PosPageShell>
  );
}
