"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { formatNTD, formatTime } from "@/lib/pos/format";

type Event = {
  id: string;
  time: string;
  staff: string;
  reason: "sale" | "change" | "refund" | "manual" | "shift-open" | "shift-close";
  delta: number;
  note?: string;
  suspicious?: boolean;
};

const events: Event[] = [
  { id: "e1", time: "2026-04-16T09:00:00+08:00", staff: "王雅雯", reason: "shift-open", delta: 10000, note: "開班底金" },
  { id: "e2", time: "2026-04-16T09:42:00+08:00", staff: "王雅雯", reason: "sale", delta: 3400, note: "維修-機油更換" },
  { id: "e3", time: "2026-04-16T10:15:00+08:00", staff: "王雅雯", reason: "change", delta: -1600, note: "找零 (POS-20260416-0012)" },
  { id: "e4", time: "2026-04-16T11:05:00+08:00", staff: "王雅雯", reason: "sale", delta: 2800, note: "精品銷售" },
  { id: "e5", time: "2026-04-16T13:20:00+08:00", staff: "王雅雯", reason: "manual", delta: -500, note: "購買辦公用品", suspicious: false },
  { id: "e6", time: "2026-04-16T14:48:00+08:00", staff: "王雅雯", reason: "refund", delta: -4200, note: "退貨 (皮衣)" },
  { id: "e7", time: "2026-04-16T15:30:00+08:00", staff: "王雅雯", reason: "sale", delta: 8800, note: "精品銷售" },
  { id: "e8", time: "2026-04-16T16:12:00+08:00", staff: "王雅雯", reason: "manual", delta: 0, note: "純開箱查看", suspicious: true },
];

const reasonMeta: Record<Event["reason"], { label: string; icon: string; tone: "info" | "success" | "warning" | "danger" | "neutral" | "brand" }> = {
  sale: { label: "銷售入帳", icon: "attach_money", tone: "success" },
  change: { label: "找零支出", icon: "currency_exchange", tone: "info" },
  refund: { label: "退款支出", icon: "assignment_return", tone: "danger" },
  manual: { label: "手動開箱", icon: "pan_tool", tone: "warning" },
  "shift-open": { label: "開班", icon: "login", tone: "brand" },
  "shift-close": { label: "收班", icon: "logout", tone: "brand" },
};

export default function CashDrawerPage() {
  const openingCash = 10000;
  const totalIn = events.filter((e) => e.delta > 0 && e.reason !== "shift-open").reduce((a, b) => a + b.delta, 0);
  const totalOut = Math.abs(events.filter((e) => e.delta < 0).reduce((a, b) => a + b.delta, 0));
  const expected = openingCash + totalIn - totalOut;
  const openCount = events.filter((e) => e.reason === "manual").length;
  const suspicious = events.filter((e) => e.suspicious).length;

  return (
    <PosPageShell title="錢箱管理" subtitle="每次開箱都留軌跡 · 異常自動警示" preview>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="當前現金" value={formatNTD(expected)} icon="savings" tone="indigo" />
        <KpiCard label="開班底金" value={formatNTD(openingCash)} icon="account_balance_wallet" tone="emerald" />
        <KpiCard label="本班進帳" value={formatNTD(totalIn)} icon="trending_up" tone="amber" />
        <KpiCard label="本班支出" value={formatNTD(totalOut)} icon="trending_down" tone="sky" />
      </div>

      {suspicious > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <span className="material-symbols-outlined text-rose-500 text-[28px]">warning</span>
          <div className="flex-1">
            <p className="font-bold text-rose-900">偵測到 {suspicious} 次可疑開箱</p>
            <p className="text-sm text-rose-700 mt-1">開箱但無對應銷售 / 退款 / 找零，請店長確認。</p>
          </div>
          <Button variant="danger" size="sm">通知店長</Button>
        </div>
      )}

      <Card title="錢箱動作軌跡" icon="timeline" padded={false} action={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon="search">查詢日期</Button>
          <Button variant="ghost" size="sm" icon="file_download">匯出</Button>
        </div>
      }>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500">時間</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500">動作</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500">操作員</th>
              <th className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-slate-500">備註</th>
              <th className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-slate-500">金額變動</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const meta = reasonMeta[e.reason];
              return (
                <tr key={e.id} className={`border-b border-slate-50 ${e.suspicious ? "bg-rose-50/50" : ""}`}>
                  <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">{formatTime(e.time)}</td>
                  <td className="px-4 py-3"><Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge></td>
                  <td className="px-4 py-3 text-sm">{e.staff}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {e.note}
                    {e.suspicious && <Badge tone="danger" className="ml-2">可疑</Badge>}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${e.delta > 0 ? "text-emerald-600" : e.delta < 0 ? "text-rose-600" : "text-slate-400"}`}>
                    {e.delta > 0 ? "+" : ""}{formatNTD(e.delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </PosPageShell>
  );
}
