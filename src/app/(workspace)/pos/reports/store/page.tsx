"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { todayTransactions, transactions } from "@/lib/pos/pos-mock-transactions";
import { formatNTD, formatTime } from "@/lib/pos/format";

export default function StoreReportPage() {
  const store = "tpe-flagship";
  const storeTx = transactions.filter((t) => t.store === store);
  const today = todayTransactions().filter((t) => t.store === store);
  const total = storeTx.reduce((a, b) => a + b.total, 0);

  const hourly = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 9;
    const hits = today.filter((t) => new Date(t.date).getHours() === hour);
    return { hour, count: hits.length, total: hits.reduce((a, b) => a + b.total, 0) };
  });
  const maxCount = Math.max(...hourly.map((h) => h.count), 1);

  return (
    <PosPageShell title="門市報表" subtitle="Ducati 台北旗艦 · 本月績效">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月營收" value={formatNTD(total)} icon="store" tone="indigo" />
        <KpiCard label="今日交易" value={today.length} icon="today" tone="emerald" />
        <KpiCard label="達成率" value="112%" icon="flag" tone="amber" delta="超標 NT$580k" deltaTone="positive" />
        <KpiCard label="客流轉換率" value="31%" icon="trending_up" tone="sky" />
      </div>

      <Card title="今日時段熱度" icon="schedule" className="mb-6">
        <div className="flex items-end gap-1 h-40">
          {hourly.map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-2">
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-indigo-500 to-indigo-400 transition-all"
                  style={{ height: `${(h.count / maxCount) * 100}%`, minHeight: h.count > 0 ? "10%" : "0" }}
                  title={`${h.count} 筆 · ${formatNTD(h.total)}`}
                />
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums">{String(h.hour).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="維修 vs 精品 vs 車輛" icon="pie_chart">
          <div className="space-y-3">
            {(["vehicle", "service", "retail"] as const).map((m) => {
              const count = storeTx.filter((t) => t.mode === m).length;
              const sum = storeTx.filter((t) => t.mode === m).reduce((a, b) => a + b.total, 0);
              const label = { vehicle: "車輛銷售", service: "維修保養", retail: "精品零售" }[m];
              const color = { vehicle: "#4F46E5", service: "#0EA5E9", retail: "#EC4899" }[m];
              return (
                <div key={m}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{label}</span>
                    <span className="font-bold tabular-nums">{formatNTD(sum)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full" style={{ width: `${(sum / total) * 100}%`, backgroundColor: color }} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{count} 筆 · 平均 {formatNTD(Math.round(sum / Math.max(1, count)))}</p>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="最新成交" icon="receipt">
          <div className="space-y-2">
            {storeTx.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium truncate">{t.lines[0]?.name}</p>
                  <p className="text-[10px] text-slate-500">{t.clerk} · {formatTime(t.date)}</p>
                </div>
                <span className="font-bold tabular-nums text-sm">{formatNTD(t.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PosPageShell>
  );
}
