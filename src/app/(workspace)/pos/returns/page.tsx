"use client";

import { useState } from "react";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Button } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { CustomerAvatar } from "@/components/pos/customer-chip";
import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";
import type { Transaction } from "@/lib/pos/pos-types";

type Phase = "list" | "detail" | "refunding" | "done";

export default function ReturnsPage() {
  const [phase, setPhase] = useState<Phase>("list");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const recent = transactions.filter((t) => t.status === "completed").slice(0, 20);

  const columns: Column<Transaction>[] = [
    { key: "code", header: "交易編號", render: (r) => <span className="font-mono text-xs tabular-nums">{r.code}</span> },
    { key: "date", header: "交易日期", render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.date)}</span> },
    { key: "customer", header: "客戶", render: (r) => {
      const c = r.customerId ? getCustomer(r.customerId) : undefined;
      return <span className="text-sm">{c?.name ?? "零售"}</span>;
    }},
    { key: "summary", header: "品項", render: (r) => <span className="text-xs text-slate-500">{r.lines[0]?.name ?? ""}{r.lines.length > 1 ? ` +${r.lines.length - 1}` : ""}</span> },
    { key: "total", header: "金額", align: "right", render: (r) => <span className="font-bold tabular-nums">{formatNTD(r.total)}</span> },
  ];

  if (phase === "list") {
    return (
      <PosPageShell title="退貨退款" subtitle="選擇原交易，系統自動帶出退貨項目">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <KpiCard label="本月退貨件數" value={3} icon="assignment_return" tone="rose" />
          <KpiCard label="本月退款金額" value={formatNTD(58400)} icon="currency_exchange" tone="amber" />
          <KpiCard label="退貨率" value="0.4%" icon="trending_down" tone="emerald" subtitle="業界平均 2.1%" />
        </div>

        <Card title="選擇原交易" icon="search" padded={false}>
          <DataTable
            columns={columns}
            data={recent}
            rowKey={(r) => r.id}
            onRowClick={(r) => {
              setSelected(r);
              setChecked(new Set());
              setPhase("detail");
            }}
            searchable
            searchFields={(r) => {
              const c = r.customerId ? getCustomer(r.customerId) : undefined;
              return `${r.code} ${c?.name ?? ""} ${r.lines.map(l => l.name).join(" ")}`;
            }}
          />
        </Card>
      </PosPageShell>
    );
  }

  if (phase === "detail" && selected) {
    const customer = selected.customerId ? getCustomer(selected.customerId) : undefined;
    const refundAmount = selected.lines
      .filter((l) => checked.has(l.id))
      .reduce((a, b) => a + b.subtotal, 0);
    const refundTax = Math.round(refundAmount * 0.05);
    return (
      <PosPageShell
        title="退貨明細"
        subtitle={`原交易 ${selected.code}`}
        actions={
          <Button variant="ghost" onClick={() => setPhase("list")} icon="arrow_back">
            重選
          </Button>
        }
      >
        <Card title="原交易資訊" icon="receipt" className="mb-5">
          <div className="flex items-start gap-4">
            {customer && <CustomerAvatar customer={customer} size="lg" />}
            <div className="flex-1">
              <p className="font-bold">{customer?.name ?? "零售客戶"}</p>
              <p className="text-xs text-slate-500">{formatTaiwanDate(selected.date, true)} · {selected.clerk}</p>
              <p className="text-xs text-slate-500 mt-1">原發票 {selected.invoiceNo}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">原總金額</p>
              <p className="text-xl font-display font-bold tabular-nums">{formatNTD(selected.total)}</p>
            </div>
          </div>
        </Card>

        <Card title="勾選要退的品項" icon="check_box">
          <div className="space-y-2">
            {selected.lines.map((l) => (
              <label key={l.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-indigo-50/40">
                <input
                  type="checkbox"
                  checked={checked.has(l.id)}
                  onChange={() => {
                    const next = new Set(checked);
                    if (next.has(l.id)) next.delete(l.id);
                    else next.add(l.id);
                    setChecked(next);
                  }}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">{l.name}</p>
                  <p className="text-[11px] text-slate-500">單價 {formatNTD(l.unitPrice)} · {l.quantity} 件</p>
                </div>
                <span className="font-bold tabular-nums">{formatNTD(l.subtotal)}</span>
              </label>
            ))}
          </div>

          <div className="mt-5 pt-5 border-t border-slate-100 space-y-1 text-sm">
            <Row label="退品小計" value={refundAmount} />
            <Row label="退還營業稅" value={refundTax} />
            <div className="flex justify-between pt-2 border-t border-slate-100 text-base font-bold">
              <span>應退金額</span>
              <span className="text-rose-600 tabular-nums">{formatNTD(refundAmount + refundTax)}</span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setPhase("list")}>取消</Button>
            <Button
              variant="danger"
              icon="currency_exchange"
              disabled={checked.size === 0}
              onClick={() => {
                setPhase("refunding");
                setTimeout(() => setPhase("done"), 2800);
              }}
            >
              原卡退款 {formatNTD(refundAmount + refundTax)}
            </Button>
          </div>
        </Card>
      </PosPageShell>
    );
  }

  if (phase === "refunding") {
    return (
      <PosPageShell title="退款中…" subtitle="請勿關閉頁面">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin mb-6" />
          <p className="text-lg font-bold text-slate-800">正在與發卡行連線…</p>
          <p className="text-sm text-slate-500 mt-1">刷退動作約需 3-5 秒</p>
        </div>
      </PosPageShell>
    );
  }

  return (
    <PosPageShell title="退款完成" actions={<Button onClick={() => setPhase("list")} icon="refresh">返回退貨列表</Button>}>
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-20 h-20 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-emerald-600 text-5xl">check_circle</span>
        </div>
        <h2 className="font-display font-extrabold text-2xl text-slate-900">退款已完成</h2>
        <p className="text-sm text-slate-500 mt-2">款項將於 3-7 個工作天回到原付款帳戶</p>
        <div className="mt-6 inline-flex flex-col gap-2">
          <Badge tone="success" icon="send">折讓單已上傳財政部</Badge>
          <Badge tone="info" icon="sms">客戶簡訊通知已送出</Badge>
        </div>
      </div>
    </PosPageShell>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums">{formatNTD(value)}</span>
    </div>
  );
}
