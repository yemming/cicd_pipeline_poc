"use client";

import { useState } from "react";
import Link from "next/link";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { CustomerAvatar, VipBadge } from "@/components/pos/customer-chip";
import { customers } from "@/lib/pos/pos-mock-customers";
import { recommendationsFor, splitReceiptPreviewLabels } from "@/lib/pos/pos-mock-ai";
import { transactionsByCustomer } from "@/lib/pos/pos-mock-transactions";
import { formatNTD, formatTaiwanDate, maskPhone, newId } from "@/lib/pos/format";
import { useCart } from "@/components/pos/cart-context";

export default function AiAssistantPage() {
  const vipCustomers = customers.filter((c) => c.tier !== "None").slice(0, 8);
  const [selectedId, setSelectedId] = useState(vipCustomers[0].id);
  const customer = customers.find((c) => c.id === selectedId)!;
  const recs = recommendationsFor(customer.id);
  const history = transactionsByCustomer(customer.id).slice(0, 5);
  const { addLine } = useCart();

  function addToCart(rec: ReturnType<typeof recommendationsFor>[number]) {
    addLine({
      id: newId("line"),
      type: "accessory",
      refId: rec.refId,
      name: rec.refName,
      quantity: 1,
      unitPrice: rec.refPrice,
      subtotal: rec.refPrice,
      taxable: true,
    });
  }

  const taxableTotal = 125000;
  const nontaxableTotal = 12500;

  return (
    <PosPageShell
      title="AI 銷售助手"
      subtitle="智慧加購推薦 · 智慧拆單預覽"
      preview
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card title="選擇客戶" icon="person">
          <div className="space-y-1">
            {vipCustomers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left ${
                  selectedId === c.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <CustomerAvatar customer={c} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-slate-500">{formatNTD(c.totalSpent)}</p>
                </div>
                <VipBadge tier={c.tier} />
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="客戶畫像" icon="account_circle">
            <div className="flex items-center gap-4">
              <CustomerAvatar customer={customer} size="lg" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display font-bold text-xl">{customer.name}</h3>
                  <VipBadge tier={customer.tier} />
                </div>
                <p className="text-sm text-slate-500">
                  {maskPhone(customer.phone)} · 入會 {customer.joinDate}
                </p>
                <div className="flex gap-4 mt-3 text-sm">
                  <Stat label="累計消費" value={formatNTD(customer.totalSpent)} />
                  <Stat label="點數" value={`${customer.points.toLocaleString()} 點`} />
                  {customer.lastPurchase && (
                    <Stat label="最近消費" value={formatTaiwanDate(customer.lastPurchase)} />
                  )}
                  {customer.bikeOwned && (
                    <Stat label="愛車" value={`${customer.bikeOwned.length} 台`} />
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div>
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">smart_toy</span>
              AI 推薦加購 ({recs.length})
            </h3>
            {recs.length === 0 ? (
              <Card title="尚無推薦" icon="psychology">
                <p className="text-sm text-slate-500 py-6 text-center">
                  此客戶資料不足以產生精準推薦
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recs.map((rec) => (
                  <div key={rec.id} className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Badge tone="brand" icon={rec.kind === "accessory" ? "tune" : rec.kind === "service" ? "build" : rec.kind === "package-card" ? "card_membership" : rec.kind === "finance" ? "account_balance" : "verified_user"}>
                          {rec.kind === "accessory" ? "配件" : rec.kind === "service" ? "維修" : rec.kind === "package-card" ? "套餐卡" : rec.kind === "finance" ? "金融" : "保險"}
                        </Badge>
                        {rec.savings && <Badge tone="success">省 {formatNTD(rec.savings)}</Badge>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">命中率</p>
                        <p className="font-bold text-emerald-600 tabular-nums">{(rec.confidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                    <h4 className="font-bold text-slate-900 mb-1">{rec.refName}</h4>
                    <p className="text-lg font-display font-extrabold text-indigo-600 mb-2 tabular-nums">
                      {rec.refPrice === 0 ? "—" : formatNTD(rec.refPrice)}
                    </p>
                    <p className="text-xs text-slate-600 mb-4 leading-relaxed">{rec.reason}</p>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-gradient-to-r from-indigo-400 to-emerald-500" style={{ width: `${rec.confidence * 100}%` }} />
                    </div>
                    <Button fullWidth size="sm" icon="add_shopping_cart" onClick={() => addToCart(rec)}>
                      加入當前購物車
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card title="智慧拆單預覽" icon="call_split">
            <p className="text-sm text-slate-600 mb-4">
              系統會自動識別本單哪些項目該開發票、哪些該開收據，出結帳頁直接兩張一起印。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-indigo-300 bg-indigo-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-700">
                    {splitReceiptPreviewLabels.taxableTitle}
                  </span>
                  <span className="material-symbols-outlined text-indigo-600 text-[20px]">receipt</span>
                </div>
                <p className="font-display text-xl font-extrabold text-indigo-900 tabular-nums mb-1">
                  {formatNTD(taxableTotal)}
                </p>
                <p className="text-[10px] text-indigo-600">{splitReceiptPreviewLabels.taxableNote}</p>
              </div>
              <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-700">
                    {splitReceiptPreviewLabels.nonTaxableTitle}
                  </span>
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">article</span>
                </div>
                <p className="font-display text-xl font-extrabold text-amber-900 tabular-nums mb-1">
                  {formatNTD(nontaxableTotal)}
                </p>
                <p className="text-[10px] text-amber-700">{splitReceiptPreviewLabels.nonTaxableNote}</p>
              </div>
            </div>
          </Card>

          <Card title="消費歷史 (供 AI 學習)" icon="history">
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">尚無消費記錄</p>
              ) : history.map((t) => (
                <Link key={t.id} href="/pos/transactions" className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg hover:bg-indigo-50">
                  <span className="material-symbols-outlined text-indigo-500 text-[20px]">
                    {t.mode === "vehicle" ? "two_wheeler" : t.mode === "service" ? "build" : "shopping_bag"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{t.lines[0]?.name}</p>
                    <p className="text-[10px] text-slate-400">{formatTaiwanDate(t.date)}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{formatNTD(t.total)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </PosPageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</p>
      <p className="font-medium text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}
