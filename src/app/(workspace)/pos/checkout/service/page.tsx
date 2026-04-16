"use client";

import { useState } from "react";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Card } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { useCart } from "@/components/pos/cart-context";
import { serviceItems } from "@/lib/pos/pos-mock-services";
import { formatNTD, newId } from "@/lib/pos/format";

export default function ServiceCheckoutPage() {
  const { cart, addLine, setMode, setWarranty, updateLine } = useCart();
  const [tab, setTab] = useState<"labor" | "parts">("labor");

  const items = serviceItems.filter((s) => s.category === tab);

  function add(id: string) {
    setMode("service");
    const item = serviceItems.find((s) => s.id === id)!;
    const warrantyFree = cart.warrantyApplied && item.warrantyFree;
    addLine({
      id: newId("line"),
      type: item.category === "labor" ? "service-labor" : "service-parts",
      refId: item.id,
      name: item.name,
      quantity: 1,
      unitPrice: warrantyFree ? 0 : item.unitPrice,
      subtotal: warrantyFree ? 0 : item.unitPrice,
      taxable: true,
      note: warrantyFree ? "保固內免收" : undefined,
    });
  }

  function toggleWarranty() {
    const next = !cart.warrantyApplied;
    setWarranty(next);
    cart.lines.forEach((l) => {
      if (l.type === "service-labor") {
        const item = serviceItems.find((s) => s.id === l.refId);
        if (item?.warrantyFree) {
          const price = next ? 0 : item.unitPrice;
          updateLine(l.id, {
            unitPrice: price,
            subtotal: price * l.quantity,
            note: next ? "保固內免收" : undefined,
          });
        }
      }
    });
  }

  return (
    <CheckoutShell
      title="維修結帳"
      subtitle="工時 + 料件 + 保固自動處理"
      step="items"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "維修結帳" },
      ]}
    >
      <Card title="保固狀態" icon="shield" className="mb-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!cart.warrantyApplied}
            onChange={toggleWarranty}
            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex-1">
            <p className="font-medium text-sm text-slate-800">此車輛在保固期內</p>
            <p className="text-xs text-slate-500">
              勾選後，保固可免工資項目自動歸零（料件費用照收）
            </p>
          </div>
          {cart.warrantyApplied && <Badge tone="success" icon="verified">保固有效</Badge>}
        </label>
      </Card>

      <div className="flex items-center gap-2 mb-4">
        <TabBtn active={tab === "labor"} onClick={() => setTab("labor")} icon="engineering">
          工時項目
        </TabBtn>
        <TabBtn active={tab === "parts"} onClick={() => setTab("parts")} icon="settings">
          料件耗材
        </TabBtn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => {
          const warrantyFree = cart.warrantyApplied && item.warrantyFree;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => add(item.id)}
              className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-300 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400 tabular-nums">{item.code}</span>
                    {item.hours && (
                      <span className="text-[10px] text-slate-500">約 {item.hours}h</span>
                    )}
                    {item.warrantyFree && <Badge tone="info">保固可免</Badge>}
                  </div>
                </div>
              </div>
              {item.description && (
                <p className="text-xs text-slate-500 mb-2">{item.description}</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  {warrantyFree ? (
                    <span className="text-xs text-slate-400 line-through">
                      {formatNTD(item.unitPrice)}
                    </span>
                  ) : null}
                  <p className="font-bold text-indigo-600 tabular-nums">
                    {warrantyFree ? "NT$0" : formatNTD(item.unitPrice)}
                  </p>
                </div>
                <span className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">add_circle</span>
                  加入
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </CheckoutShell>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${
        active
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {children}
    </button>
  );
}
