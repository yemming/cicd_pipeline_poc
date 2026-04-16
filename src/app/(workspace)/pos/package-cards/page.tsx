"use client";

import { useState } from "react";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { CustomerAvatar } from "@/components/pos/customer-chip";
import { packageTemplates, packageCards, getPackageTemplate } from "@/lib/pos/pos-mock-packages";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatTaiwanDate } from "@/lib/pos/format";

export default function PackageCardsPage() {
  const [selectedId, setSelectedId] = useState(packageCards[0].id);
  const card = packageCards.find((c) => c.id === selectedId)!;
  const tpl = getPackageTemplate(card.type)!;
  const customer = getCustomer(card.customerId)!;

  const totalSold = packageCards.length;
  const activeCards = packageCards.filter((c) => c.remainingUses !== 0 && c.remainingUses !== "unlimited" || c.remainingUses === "unlimited").length;

  return (
    <PosPageShell title="保養套餐卡" subtitle="預付綁忠誠 · 未來回購保障" preview>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="卡種" value={packageTemplates.length} icon="style" tone="indigo" />
        <KpiCard label="已售出" value={totalSold} icon="sell" tone="emerald" />
        <KpiCard label="本月銷售額" value={formatNTD(72000)} icon="monetization_on" tone="amber" />
        <KpiCard label="到期未用提醒" value={2} icon="warning" tone="rose" />
      </div>

      <div className="mb-6">
        <h3 className="font-bold text-slate-800 mb-3">卡種型錄</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {packageTemplates.map((t) => (
            <div key={t.type} className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="material-symbols-outlined text-[32px]">{t.icon}</span>
                <span className="text-[10px] uppercase tracking-widest opacity-70">{t.validMonths} 個月</span>
              </div>
              <h4 className="font-display font-extrabold text-xl mb-1">{t.name}</h4>
              <p className="text-xs opacity-80 mb-4">{t.tagline}</p>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-display font-extrabold tabular-nums">{formatNTD(t.price)}</span>
                <span className="text-xs line-through opacity-60">{formatNTD(t.retailEquivalent)}</span>
              </div>
              <p className="text-[10px] opacity-80">
                省 {formatNTD(t.retailEquivalent - t.price)} · {t.totalUses === "unlimited" ? "無限次" : `${t.totalUses} 次`}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card title="已售卡片" icon="list">
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {packageCards.map((c) => {
              const ct = getPackageTemplate(c.type)!;
              const cust = getCustomer(c.customerId)!;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 rounded-lg ${
                    selectedId === c.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <p className="text-xs font-mono text-slate-500">{c.code}</p>
                  <p className="text-sm font-medium mt-0.5">{ct.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{cust.name}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card
            title="卡片詳情"
            icon="card_membership"
            action={
              <Button size="sm" icon="qr_code_2">出示 QR</Button>
            }
          >
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 items-center mb-6">
              <CustomerAvatar customer={customer} size="lg" />
              <div>
                <p className="font-bold text-lg">{customer.name}</p>
                <p className="text-xs text-slate-500">{card.code} · 購於 {formatTaiwanDate(card.purchaseDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">剩餘次數</p>
                <p className="font-display font-extrabold text-3xl text-indigo-600 tabular-nums">
                  {card.remainingUses === "unlimited" ? "∞" : card.remainingUses}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="卡種" value={tpl.name} />
              <Stat label="購買金額" value={formatNTD(tpl.price)} />
              <Stat label="到期日" value={formatTaiwanDate(card.expiryDate)} />
            </div>

            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-indigo-600">history</span>
              使用記錄 ({card.usages.length})
            </h4>
            <div className="border-l-2 border-slate-200 pl-4 ml-2 space-y-3">
              {card.usages.map((u, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-[22px] w-3 h-3 rounded-full bg-indigo-500" />
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{u.item}</span>
                      <Badge tone="neutral">{formatTaiwanDate(u.date)}</Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">技師：{u.technician}</p>
                  </div>
                </div>
              ))}
              {card.usages.length === 0 && (
                <p className="text-sm text-slate-400 italic">尚未使用</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PosPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
