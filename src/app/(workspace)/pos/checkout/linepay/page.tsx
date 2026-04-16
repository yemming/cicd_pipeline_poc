"use client";

import { newId } from "@/lib/pos/format";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { LinePayQr } from "@/components/pos/linepay-qr";
import { useCart } from "@/components/pos/cart-context";
import { Button } from "@/components/pos/button";

export default function LinePayPage() {
  const router = useRouter();
  const { due, total, addPayment } = useCart();
  const amount = due > 0 ? due : total;

  return (
    <CheckoutShell
      title="LINE Pay"
      subtitle="QR code 掃碼付款"
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "付款方式", href: "/pos/checkout/payment" },
        { label: "LINE Pay" },
      ]}
    >
      <LinePayQr
        amount={amount}
        onPaid={() => {
          addPayment({
            id: newId("pay"),
            method: "linepay",
            amount,
            timestamp: new Date().toISOString(),
            linePayOrderNo: `LP${Date.now()}`,
          });
        }}
      />
      <div className="mt-8 max-w-md mx-auto flex items-center justify-between">
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
