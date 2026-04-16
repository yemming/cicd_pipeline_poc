"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { formatNTD } from "@/lib/pos/format";

export default function SalesReportPage() {
  const total = transactions.reduce((a, b) => a + b.total, 0);
  const days = 30;
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(2026, 3, 16 - (days - 1 - i));
    const day = d.getDate();
    const sum = transactions
      .filter((t) => new Date(t.date).getDate() === day && new Date(t.date).getMonth() === d.getMonth())
      .reduce((a, b) => a + b.total, 0);
    return { day: `${d.getMonth() + 1}/${day}`, sum };
  });
  const maxDaily = Math.max(...daily.map((d) => d.sum));

  return (
    <PosPageShell title="銷售報表" subtitle={`近 ${days} 天銷售趨勢`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="期間總營收" value={formatNTD(total)} icon="trending_up" tone="indigo" />
        <KpiCard label="日均營收" value={formatNTD(Math.round(total / days))} icon="functions" tone="emerald" />
        <KpiCard label="最高單日" value={formatNTD(maxDaily)} icon="arrow_upward" tone="amber" />
        <KpiCard label="總交易筆數" value={transactions.length} icon="receipt_long" tone="sky" />
      </div>

      <Card title="每日營收走勢" icon="timeline" className="mb-6">
        <div className="h-48 flex items-end gap-0.5">
          {daily.map((d, i) => (
            <div key={i} className="flex-1 group relative flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-indigo-500 to-indigo-300 rounded-t group-hover:from-indigo-600 group-hover:to-indigo-400 transition-all"
                style={{ height: `${(d.sum / maxDaily) * 100}%` }}
              />
              <div className="absolute -top-8 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                {d.day} · {formatNTD(d.sum)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-2">
          <span>{daily[0].day}</span>
          <span>{daily[Math.floor(days / 2)].day}</span>
          <span>{daily[days - 1].day}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Top 5 銷售車款" icon="star">
          <div className="space-y-2">
            {["Panigale V4 S", "Multistrada V4 S", "Monster", "Streetfighter V4 S", "DesertX"].map((name, i) => (
              <div key={name} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <span className="w-6 h-6 rounded bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span className="flex-1 text-sm">{name}</span>
                <span className="text-xs text-slate-500 tabular-nums">{8 - i} 台</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top 5 精品" icon="shopping_bag">
          <div className="space-y-2">
            {["AGV Pista GP RR", "Termignoni 排氣", "碳纖維搖臂護蓋", "Dainese 皮衣", "Rizoma 端子"].map((name, i) => (
              <div key={name} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <span className="w-6 h-6 rounded bg-pink-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span className="flex-1 text-sm truncate">{name}</span>
                <span className="text-xs text-slate-500 tabular-nums">{18 - i * 3}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top 5 維修項目" icon="build">
          <div className="space-y-2">
            {["機油更換", "煞車來令更換", "大保養 15000km", "輪胎更換", "鏈條保養"].map((name, i) => (
              <div key={name} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <span className="w-6 h-6 rounded bg-sky-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                <span className="flex-1 text-sm truncate">{name}</span>
                <span className="text-xs text-slate-500 tabular-nums">{32 - i * 4}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PosPageShell>
  );
}
