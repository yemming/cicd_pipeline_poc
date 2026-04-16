"use client";

import { useState } from "react";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { formatNTD, formatTime } from "@/lib/pos/format";

const denominations = [
  { value: 2000, label: "$2000" },
  { value: 1000, label: "$1000" },
  { value: 500, label: "$500" },
  { value: 100, label: "$100" },
  { value: 50, label: "$50" },
  { value: 10, label: "$10" },
  { value: 5, label: "$5" },
  { value: 1, label: "$1" },
];

export default function ShiftPage() {
  const expected = 28450;
  const [counts, setCounts] = useState<Record<number, number>>({
    2000: 8, 1000: 10, 500: 4, 100: 22, 50: 2, 10: 14, 5: 2, 1: 0,
  });
  const actual = denominations.reduce((a, d) => a + d.value * (counts[d.value] ?? 0), 0);
  const diff = actual - expected;

  return (
    <PosPageShell title="班別交接" subtitle="現金清點 · 禮券核對 · 差異分析" preview>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本班開始" value="09:00" icon="login" tone="indigo" subtitle="王雅雯 · 已 7h 42m" />
        <KpiCard label="本班結束" value="17:00" icon="logout" tone="amber" subtitle="交班給 張志豪" />
        <KpiCard label="本班交易" value="18 筆" icon="receipt_long" tone="emerald" />
        <KpiCard label="應有現金" value={formatNTD(expected)} icon="savings" tone="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="現金清點" icon="paid" subtitle="依面額輸入張數">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {denominations.map((d) => (
              <div key={d.value} className="flex items-center gap-2">
                <span className="w-16 text-sm font-bold tabular-nums">{d.label}</span>
                <input
                  type="number"
                  min="0"
                  value={counts[d.value] ?? 0}
                  onChange={(e) => setCounts({ ...counts, [d.value]: parseInt(e.target.value) || 0 })}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <span className="w-20 text-right text-xs text-slate-500 tabular-nums">
                  {formatNTD(d.value * (counts[d.value] ?? 0))}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t border-slate-100 space-y-1.5">
            <Row label="實盤金額" value={actual} bold />
            <Row label="應有金額" value={expected} muted />
            <div className={`flex items-center justify-between font-bold pt-2 border-t border-slate-100 ${diff === 0 ? "text-emerald-600" : Math.abs(diff) <= 100 ? "text-amber-600" : "text-rose-600"}`}>
              <span>差異</span>
              <span className="tabular-nums">{diff > 0 ? "+" : ""}{formatNTD(diff)}</span>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="禮券 / 套餐卡清點" icon="card_giftcard">
            <div className="space-y-3">
              <Item label="禮券 (NT$500)" expected={8} actual={8} />
              <Item label="禮券 (NT$1000)" expected={3} actual={3} />
              <Item label="套餐卡訂單 (未發)" expected={2} actual={2} />
              <Item label="發票機備用紙捲" expected={3} actual={2} warn />
            </div>
          </Card>

          <Card title="交接事項" icon="assignment">
            <div className="space-y-2 text-sm">
              <Note tone="success" title="已完成" desc="18 筆交易全數結清、3 張發票已上傳財政部" />
              <Note tone="warning" title="需跟進" desc="客戶陳子翔訂 Pista 安全帽尚未到貨，預計週三" />
              <Note tone="info" title="備註" desc="14:48 有 1 筆退貨 (皮衣尺寸)，原卡退款已完成" />
            </div>
          </Card>

          <Button fullWidth variant="primary" size="lg" icon="check_circle">
            完成交班
          </Button>
        </div>
      </div>
    </PosPageShell>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: number; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-slate-500" : bold ? "text-slate-900 font-bold" : "text-slate-700"}`}>
      <span className="text-sm">{label}</span>
      <span className="tabular-nums">{formatNTD(value)}</span>
    </div>
  );
}

function Item({ label, expected, actual, warn }: { label: string; expected: number; actual: number; warn?: boolean }) {
  const match = expected === actual;
  return (
    <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs tabular-nums ${match ? "text-emerald-600" : "text-rose-600 font-bold"}`}>
          {actual} / {expected}
        </span>
        {match ? <Badge tone="success" icon="check">OK</Badge> : <Badge tone={warn ? "warning" : "danger"}>差 {expected - actual}</Badge>}
      </div>
    </div>
  );
}

function Note({ tone, title, desc }: { tone: "success" | "warning" | "info"; title: string; desc: string }) {
  const bg = { success: "bg-emerald-50 border-emerald-200 text-emerald-700", warning: "bg-amber-50 border-amber-200 text-amber-700", info: "bg-sky-50 border-sky-200 text-sky-700" }[tone];
  return (
    <div className={`p-3 rounded-lg border ${bg}`}>
      <p className="font-bold text-sm">{title}</p>
      <p className="text-xs mt-0.5 opacity-90">{desc}</p>
    </div>
  );
}
