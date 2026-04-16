"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Card } from "@/components/pos/card";
import { Button } from "@/components/pos/button";
import { PriceInput } from "@/components/pos/price-input";
import { Badge } from "@/components/pos/badge";
import { useCart } from "@/components/pos/cart-context";
import { formatNTD, newId } from "@/lib/pos/format";
import type { PaymentMethod } from "@/lib/pos/pos-types";

const methodMeta: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
  card: { label: "信用卡", icon: "credit_card", color: "#4F46E5" },
  linepay: { label: "LINE Pay", icon: "qr_code_2", color: "#06C755" },
  applepay: { label: "Apple Pay", icon: "contactless", color: "#000000" },
  cash: { label: "現金", icon: "payments", color: "#F59E0B" },
  check: { label: "支票", icon: "description", color: "#64748B" },
};

export default function SplitPage() {
  const router = useRouter();
  const { cart, total, due, paid, addPayment } = useCart();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [amount, setAmount] = useState(due > 0 ? due : 0);

  function addStep() {
    if (amount <= 0 || amount > due) return;
    addPayment({
      id: newId("pay"),
      method,
      amount,
      timestamp: new Date().toISOString(),
    });
    setAmount(Math.max(0, due - amount));
  }

  return (
    <CheckoutShell
      title="混合付款"
      subtitle="可多筆組合 - 一部分刷卡、一部分現金"
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "付款方式", href: "/pos/checkout/payment" },
        { label: "混合付款" },
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="新增一筆付款" icon="add_circle">
          <div className="grid grid-cols-5 gap-2 mb-5">
            {(Object.keys(methodMeta) as PaymentMethod[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setMethod(k)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center ${
                  method === k
                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {methodMeta[k].icon}
                </span>
                <span className="text-[10px] font-medium">{methodMeta[k].label}</span>
              </button>
            ))}
          </div>
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-600 mb-2">此筆金額</p>
            <PriceInput value={amount} onChange={setAmount} size="lg" />
            <p className="text-[10px] text-slate-400 mt-1">
              可用上限 {formatNTD(due > 0 ? due : 0)}
            </p>
          </div>
          <Button fullWidth onClick={addStep} disabled={amount <= 0 || amount > due} icon="playlist_add">
            加入此筆付款
          </Button>
        </Card>

        <Card title="已登記付款" icon="receipt_long">
          <div className="space-y-3 mb-5 min-h-[160px]">
            {cart.payments.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-10">尚未登記任何付款</p>
            )}
            {cart.payments.map((p, i) => {
              const meta = methodMeta[p.method];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: meta.color }}>
                        {meta.icon}
                      </span>
                      <span className="font-medium text-sm text-slate-800">{meta.label}</span>
                    </div>
                  </div>
                  <span className="font-bold tabular-nums">{formatNTD(p.amount)}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 pt-4 border-t border-slate-100 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>應收</span>
              <span className="tabular-nums">{formatNTD(total)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-bold">
              <span>已收</span>
              <span className="tabular-nums">{formatNTD(paid)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-100">
              <span>{due <= 0 ? "已付清" : "尚差"}</span>
              <Badge tone={due <= 0 ? "success" : "warning"}>
                {formatNTD(Math.abs(due))}
              </Badge>
            </div>
          </div>
          <Button
            fullWidth
            variant="success"
            icon="check_circle"
            disabled={due > 0}
            onClick={() => router.push("/pos/checkout/success")}
            className="mt-4"
          >
            {due <= 0 ? "完成結帳" : `尚差 ${formatNTD(due)}`}
          </Button>
        </Card>
      </div>
    </CheckoutShell>
  );
}
