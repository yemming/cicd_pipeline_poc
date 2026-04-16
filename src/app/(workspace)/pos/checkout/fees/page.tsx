"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Card } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { useCart } from "@/components/pos/cart-context";
import { defaultFees } from "@/lib/pos/pos-mock-services";
import { formatNTD } from "@/lib/pos/format";

export default function FeesPage() {
  const router = useRouter();
  const { cart, addFee, removeFee } = useCart();
  const selectedIds = useMemo(() => new Set(cart.fees.map((f) => f.id)), [cart.fees]);

  function toggle(id: string) {
    const f = defaultFees.find((x) => x.id === id)!;
    if (selectedIds.has(id)) {
      removeFee(id);
    } else {
      addFee({
        id: f.id,
        type: "fee",
        name: f.name,
        quantity: 1,
        unitPrice: f.amount,
        subtotal: f.amount,
        taxable: f.taxable,
      });
    }
  }

  function toggleTaxable(id: string) {
    const existing = cart.fees.find((f) => f.id === id);
    if (!existing) return;
    removeFee(id);
    addFee({ ...existing, taxable: !existing.taxable });
  }

  const taxableCount = cart.fees.filter((f) => f.taxable).length;
  const nontaxableCount = cart.fees.filter((f) => !f.taxable).length;

  return (
    <CheckoutShell
      title="代辦費用"
      subtitle="勾選要代收的費用，決定開發票或只給收據"
      step="fees"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "代辦費用" },
      ]}
    >
      <Card
        title="智慧拆單預覽"
        subtitle="系統會自動把代辦項拆成「發票」與「收據」兩張"
        icon="call_split"
        className="mb-5"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-widest text-indigo-600 font-semibold">
                電子發票
              </span>
              <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                {taxableCount}
              </span>
            </div>
            <p className="text-[11px] text-indigo-700 mt-1">含稅項目 · 即時上傳財政部</p>
          </div>
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs uppercase tracking-widest text-amber-600 font-semibold">
                代辦收據
              </span>
              <span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">
                {nontaxableCount}
              </span>
            </div>
            <p className="text-[11px] text-amber-700 mt-1">規費項目 · 代收代付不入帳</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2 mb-6">
        {defaultFees.map((f) => {
          const selected = selectedIds.has(f.id);
          const current = cart.fees.find((x) => x.id === f.id);
          return (
            <div
              key={f.id}
              className={`flex items-center gap-4 p-4 bg-white rounded-xl border transition-colors ${
                selected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"
              }`}
            >
              <label className="flex items-center gap-3 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(f.id)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900">{f.name}</p>
                    {f.taxable ? (
                      <Badge tone="brand" icon="receipt">發票</Badge>
                    ) : (
                      <Badge tone="warning" icon="article">收據</Badge>
                    )}
                  </div>
                  {f.description && <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>}
                </div>
                <span className="font-display font-bold text-slate-900 tabular-nums">
                  {formatNTD(f.amount)}
                </span>
              </label>
              {selected && (
                <button
                  type="button"
                  onClick={() => toggleTaxable(f.id)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                >
                  切換{current?.taxable ? "改收據" : "改發票"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>
          上一步
        </Button>
        <Button
          variant="primary"
          icon="arrow_forward"
          onClick={() => router.push("/pos/checkout/payment")}
        >
          前往結帳
        </Button>
      </div>
    </CheckoutShell>
  );
}
