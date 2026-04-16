"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { stores } from "@/lib/pos/pos-mock-customers";
import { formatNTD } from "@/lib/pos/format";

export default function ManagementReportPage() {
  const total = transactions.reduce((a, b) => a + b.total, 0);
  const margin = transactions.reduce((a, b) => a + (b.margin ?? 0), 0);
  const byStore = stores.map((s) => {
    const list = transactions.filter((t) => t.store === s.code);
    return {
      ...s,
      count: list.length,
      total: list.reduce((a, b) => a + b.total, 0),
      margin: list.reduce((a, b) => a + (b.margin ?? 0), 0),
    };
  });
  const maxTotal = Math.max(...byStore.map((s) => s.total));

  return (
    <PosPageShell title="管理報表" subtitle="集團層級 · 本月營運總覽">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月總營業額" value={formatNTD(total)} icon="monetization_on" tone="indigo" delta="+22%" deltaTone="positive" />
        <KpiCard label="本月毛利" value={formatNTD(margin)} icon="trending_up" tone="emerald" delta={`毛利率 ${Math.round((margin / total) * 100)}%`} deltaTone="neutral" />
        <KpiCard label="總交易筆數" value={transactions.length} icon="receipt_long" tone="sky" />
        <KpiCard label="平均客單價" value={formatNTD(Math.round(total / transactions.length))} icon="person" tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="各門店營收排行" icon="leaderboard">
          <div className="space-y-3">
            {byStore.sort((a, b) => b.total - a.total).map((s, i) => (
              <div key={s.code}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="inline-flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-300 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {i + 1}
                    </span>
                    <span className="font-medium">{s.name}</span>
                  </span>
                  <span className="font-display font-bold tabular-nums">{formatNTD(s.total)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600" style={{ width: `${(s.total / maxTotal) * 100}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>{s.count} 筆交易 · {s.city}</span>
                  <span>毛利 {formatNTD(s.margin)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="關鍵指標" icon="analytics">
          <div className="space-y-4">
            <Metric label="日均客流" value="42 人" sub="vs 上月 +8" />
            <Metric label="成交轉化率" value="28.4%" sub="展廳進場→開單" />
            <Metric label="維修回廠率" value="82%" sub="一年內" />
            <Metric label="客戶終身價值 (LTV)" value={formatNTD(486000)} sub="持車 5 年平均" />
            <Metric label="NPS 淨推薦分數" value="72" sub="業界平均 +24" />
          </div>
        </Card>
      </div>
    </PosPageShell>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
      </div>
      <span className="font-display font-extrabold text-lg tabular-nums text-indigo-600">{value}</span>
    </div>
  );
}
