"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Card } from "@/components/pos/card";
import { Button } from "@/components/pos/button";
import { PriceInput } from "@/components/pos/price-input";
import { useCart } from "@/components/pos/cart-context";
import { formatNTD, newId } from "@/lib/pos/format";

const banks = ["玉山銀行", "國泰世華", "中國信託", "台新銀行", "富邦銀行", "第一銀行"];

export default function CheckPage() {
  const router = useRouter();
  const { due, total, addPayment } = useCart();
  const amount = due > 0 ? due : total;
  const [checkNo, setCheckNo] = useState("");
  const [bank, setBank] = useState(banks[0]);
  const [issuedDate, setIssuedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [custom, setCustom] = useState(amount);

  function confirm() {
    addPayment({
      id: newId("pay"),
      method: "check",
      amount: custom,
      checkNumber: checkNo,
      checkBank: bank,
      checkDate: issuedDate,
      timestamp: new Date().toISOString(),
    });
    router.push("/pos/checkout/success");
  }

  return (
    <CheckoutShell
      title="支票錄入"
      subtitle="B2B 常用支付方式"
      step="payment"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "付款方式", href: "/pos/checkout/payment" },
        { label: "支票" },
      ]}
    >
      <Card title="支票明細" icon="description" className="max-w-2xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="支票號碼">
            <input
              value={checkNo}
              onChange={(e) => setCheckNo(e.target.value)}
              placeholder="例：AB1234567"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </Field>
          <Field label="發票銀行">
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {banks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="票面金額">
            <PriceInput value={custom} onChange={setCustom} size="lg" />
          </Field>
          <Field label="發票日期 / 到期日">
            <input
              type="date"
              value={issuedDate}
              onChange={(e) => setIssuedDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </Field>
        </div>
        <div className="mt-5 p-3 bg-indigo-50 rounded-lg text-xs text-indigo-700">
          <span className="font-bold">應收 {formatNTD(amount)}</span>
          {custom !== amount && (
            <span className="ml-2">
              · 差額 {formatNTD(amount - custom)} 需另外補齊
            </span>
          )}
        </div>
      </Card>
      <div className="mt-6 max-w-2xl mx-auto flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} icon="arrow_back">
          回付款方式
        </Button>
        <Button variant="success" onClick={confirm} icon="check" disabled={!checkNo}>
          登錄支票
        </Button>
      </div>
    </CheckoutShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-600 font-medium mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
