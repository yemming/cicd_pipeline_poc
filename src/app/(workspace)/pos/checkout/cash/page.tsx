"use client";

import { newId } from "@/lib/pos/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { PaymentPad } from "@/components/pos/payment-pad";
import { Button } from "@/components/pos/button";
import { useCart } from "@/components/pos/cart-context";

export default function CashPage() {
  const router = useRouter();
  const { due, total, addPayment } = useCart();
  const amount = due > 0 ? due : total;
  const [received, setReceived] = useState(0);

  function confirm() {
    if (received < amount) return;
    addPayment({
      id: newId("pay"),
      method: "cash",
      amount,
      received,
      change: received - amount,
      timestamp: new Date().toISOString(),
    });
    router.push("/pos/checkout/success");
  }

  return (
    <CheckoutShell
      title="現金找零"
      subtitle="輸入客戶實付金額，系統自動算找零"
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "付款方式", href: "/pos/checkout/payment" },
        { label: "現金" },
      ]}
    >
      <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl mx-auto">
        <PaymentPad value={received} onChange={setReceived} due={amount} />
        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => router.back()} icon="arrow_back">
            回付款方式
          </Button>
          <Button
            variant="success"
            size="lg"
            icon="check"
            disabled={received < amount}
            onClick={confirm}
          >
            確認收款
          </Button>
        </div>
      </div>
    </CheckoutShell>
  );
}
