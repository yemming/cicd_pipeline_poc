"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Card } from "@/components/pos/card";
import { Button, ButtonLink } from "@/components/pos/button";
import { CustomerAvatar, VipBadge } from "@/components/pos/customer-chip";
import { Badge } from "@/components/pos/badge";
import { useCart } from "@/components/pos/cart-context";
import { customers, findCustomerByPhone, findCustomerByVatId } from "@/lib/pos/pos-mock-customers";
import { formatNTD, formatVatId, maskPhone } from "@/lib/pos/format";
import type { CustomerType } from "@/lib/pos/pos-types";

export default function CustomerIdPage() {
  const router = useRouter();
  const { cart, setCustomer } = useCart();
  const [mode, setMode] = useState<CustomerType>(cart.mode === "retail" ? "B2C" : "B2C");
  const [q, setQ] = useState("");

  function onLookup() {
    const found =
      mode === "B2B" ? findCustomerByVatId(q.trim()) : findCustomerByPhone(q.trim());
    if (found) {
      setCustomer(found.id);
      router.push(cart.mode === "vehicle" ? "/pos/checkout/fees" : "/pos/checkout/payment");
    }
  }

  function pick(id: string) {
    setCustomer(id);
    router.push(cart.mode === "vehicle" ? "/pos/checkout/fees" : "/pos/checkout/payment");
  }

  function skipCustomer() {
    setCustomer(undefined);
    router.push(cart.mode === "vehicle" ? "/pos/checkout/fees" : "/pos/checkout/payment");
  }

  const list = customers.filter((c) => c.type === mode).slice(0, 12);

  return (
    <CheckoutShell
      title="客戶識別"
      subtitle="B2B 帶統編 · B2C 帶手機 / VIP"
      step="customer"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "客戶識別" },
      ]}
      rightActions={
        <Button variant="ghost" onClick={skipCustomer} icon="skip_next">
          跳過 (零售)
        </Button>
      }
    >
      <div className="inline-flex bg-slate-100 rounded-xl p-1 mb-5">
        <button
          type="button"
          onClick={() => setMode("B2C")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "B2C" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500"
          }`}
        >
          個人 B2C
        </button>
        <button
          type="button"
          onClick={() => setMode("B2B")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "B2B" ? "bg-white shadow-sm text-indigo-700" : "text-slate-500"
          }`}
        >
          公司 B2B
        </button>
      </div>

      <Card
        title={mode === "B2B" ? "以統一編號查找" : "以手機號碼查找"}
        subtitle={mode === "B2B" ? "輸入 8 碼統編帶出公司資料" : "VIP 手機自動帶入分級與消費歷史"}
        icon="person_search"
        className="mb-5"
      >
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "B2B" ? "統一編號 (8 碼)" : "手機號碼 (10 碼)"}
            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
          <Button onClick={onLookup} icon="search" size="lg">
            查找
          </Button>
        </div>
      </Card>

      <div>
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">
          {mode === "B2B" ? "B2B 企業客戶" : "近期到店客戶"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className="text-left flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <CustomerAvatar customer={c} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-slate-900 truncate">{c.name}</p>
                  <VipBadge tier={c.tier} />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {c.vatId ? `統編 ${formatVatId(c.vatId)}` : maskPhone(c.phone)}
                </p>
                {c.totalSpent > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge tone="neutral">累消 {formatNTD(c.totalSpent)}</Badge>
                    {c.bikeOwned && c.bikeOwned.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        持 {c.bikeOwned.length} 台
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <ButtonLink href="/pos/checkout" variant="ghost">
          回上一步
        </ButtonLink>
      </div>
    </CheckoutShell>
  );
}
