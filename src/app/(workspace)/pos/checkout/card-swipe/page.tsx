"use client";

import { newId } from "@/lib/pos/format";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { CardSwipeMock } from "@/components/pos/card-swipe-mock";
import { useCart } from "@/components/pos/cart-context";
import { Button } from "@/components/pos/button";

export default function CardSwipePage() {
  const router = useRouter();
  const { due, total, addPayment } = useCart();
  const amount = due > 0 ? due : total;

  return (
    <CheckoutShell
      title="刷卡機"
      subtitle="EDC 端末機模擬"
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "付款方式", href: "/pos/checkout/payment" },
        { label: "刷卡" },
      ]}
    >
      <CardSwipeMock
        amount={amount}
        onApproved={(info) => {
          addPayment({
            id: newId("pay"),
            method: "card",
            amount,
            timestamp: new Date().toISOString(),
            cardBrand: info.brand as "VISA",
            cardLast4: info.last4,
          });
        }}
      />
      <div className="mt-8 max-w-md mx-auto flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => router.back()} icon="arrow_back">
          回付款方式
        </Button>
        <Button
          variant="primary"
          icon="arrow_forward"
          onClick={() => router.push("/pos/checkout/success")}
        >
          完成結帳
        </Button>
      </div>
    </CheckoutShell>
  );
}
