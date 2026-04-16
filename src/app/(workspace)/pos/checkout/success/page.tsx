"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { InvoicePreview } from "@/components/pos/invoice-preview";
import { ReceiptPreview } from "@/components/pos/receipt-preview";
import { Button, ButtonLink } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { useCart } from "@/components/pos/cart-context";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import { formatNTD, generateInvoiceNo, generateReceiptNo, generateTxCode } from "@/lib/pos/format";

export default function SuccessPage() {
  const router = useRouter();
  const { cart, subtotal, feeTotal, taxAmount, total, paid, clear } = useCart();

  const [codes] = useState(() => {
    const today = new Date();
    const seed = Math.floor((today.getTime() % 100000) / 7);
    return {
      today,
      txCode: generateTxCode(today, seed % 9999),
      invoiceNo: generateInvoiceNo(seed),
      receiptNo: generateReceiptNo(seed),
    };
  });
  const { today, txCode, invoiceNo, receiptNo } = codes;
  const customer = cart.customerId ? getCustomer(cart.customerId) : undefined;

  const taxableLines = [
    ...cart.lines.filter((l) => l.taxable),
    ...cart.fees.filter((f) => f.taxable),
  ];
  const receiptLines = cart.fees.filter((f) => !f.taxable);

  const taxableSubtotal = taxableLines.reduce((a, b) => a + b.subtotal, 0);
  const receiptTotal = receiptLines.reduce((a, b) => a + b.subtotal, 0);

  function startOver() {
    clear();
    router.push("/pos/checkout");
  }

  if (cart.lines.length === 0 && cart.fees.length === 0) {
    return (
      <CheckoutShell title="結帳完成" step="success">
        <div className="py-20 text-center">
          <p className="text-slate-500 mb-4">目前沒有交易紀錄</p>
          <ButtonLink href="/pos/checkout">回結帳中心</ButtonLink>
        </div>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell
      title="結帳完成"
      subtitle={`交易編號 ${txCode}`}
      step="success"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "結帳完成" },
      ]}
      rightActions={
        <>
          <Button variant="secondary" icon="print">列印</Button>
          <Button variant="primary" icon="add" onClick={startOver}>
            新交易
          </Button>
        </>
      }
    >
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 mb-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-4xl">check</span>
        </div>
        <div className="flex-1">
          <h2 className="font-display font-extrabold text-2xl text-emerald-900">交易成功</h2>
          <p className="text-sm text-emerald-700 mt-0.5">
            已收款 {formatNTD(paid)} · 應收 {formatNTD(total)}
            {paid > total && ` · 找零 ${formatNTD(paid - total)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success" icon="send">電子發票已上傳</Badge>
          <Badge tone="brand" icon="smartphone">客戶 APP 已推播</Badge>
        </div>
      </div>

      <div className={`grid gap-6 ${receiptLines.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1 max-w-2xl mx-auto"}`}>
        {taxableLines.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-[20px]">receipt</span>
                電子發票
              </h3>
              <Badge tone="brand">{customer?.vatId ? "三聯式" : "二聯式"}</Badge>
            </div>
            <InvoicePreview
              invoiceNo={invoiceNo}
              date={today.toISOString()}
              buyerName={customer?.name}
              buyerVatId={customer?.vatId}
              lines={taxableLines}
              subtotal={taxableSubtotal}
              taxAmount={taxAmount}
              total={taxableSubtotal + taxAmount}
            />
          </section>
        )}

        {receiptLines.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-[20px]">article</span>
                代辦費用收據
              </h3>
              <Badge tone="warning">非稅收入</Badge>
            </div>
            <ReceiptPreview
              receiptNo={receiptNo}
              date={today.toISOString()}
              clerk="王雅雯"
              lines={receiptLines}
              total={receiptTotal}
              note="規費 / 汽燃費 / 牌照費等代收代付項目"
            />
          </section>
        )}
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-600">insights</span>
          交易分析
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="總金額" value={formatNTD(total)} />
          <Stat label="商品小計" value={formatNTD(subtotal)} />
          <Stat label="代辦費" value={formatNTD(feeTotal)} />
          <Stat label="營業稅" value={formatNTD(taxAmount)} />
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <Link href="/pos/ai-assistant" className="text-xs text-indigo-600 font-medium hover:underline">
            AI 助手建議下次推薦 →
          </Link>
          <Link href="/pos/transactions" className="text-xs text-slate-500 hover:text-indigo-600">
            查看全部交易
          </Link>
        </div>
      </div>
    </CheckoutShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="font-display font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}
