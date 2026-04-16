"use client";

import { newId } from "@/lib/pos/format";
import { useState } from "react";
import Image from "next/image";
import { CheckoutShell } from "@/components/pos/checkout-shell";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { useCart } from "@/components/pos/cart-context";
import { ducatiModels, DUCATI_FAMILIES, formatNTD, type DucatiFamily } from "@/lib/ducati-models";
import { skus, skuCategoryMeta } from "@/lib/pos/pos-mock-skus";
import type { LineItem } from "@/lib/pos/pos-types";

export default function VehicleCheckoutPage() {
  const [family, setFamily] = useState<DucatiFamily | "all">("all");
  const [tab, setTab] = useState<"vehicle" | "accessory">("vehicle");
  const { addLine, setMode } = useCart();

  const filteredModels =
    family === "all" ? ducatiModels : ducatiModels.filter((m) => m.family === family);

  function addVehicle(id: string) {
    setMode("vehicle");
    const m = ducatiModels.find((x) => x.id === id)!;
    addLine({
      id: newId("line"),
      type: "vehicle",
      refId: m.id,
      name: `${m.name} · ${m.colors[0]}`,
      quantity: 1,
      unitPrice: m.priceNTD,
      subtotal: m.priceNTD,
      taxable: true,
    });
  }

  function addAccessory(skuId: string) {
    const s = skus.find((x) => x.id === skuId)!;
    const line: LineItem = {
      id: newId("line"),
      type: "accessory",
      refId: s.id,
      name: s.name,
      quantity: 1,
      unitPrice: s.price,
      subtotal: s.price,
      taxable: true,
    };
    addLine(line);
  }

  return (
    <CheckoutShell
      title="車輛銷售"
      subtitle="選車 + 加購配件"
      step="items"
      breadcrumb={[
        { label: "POS 收銀", href: "/pos" },
        { label: "結帳中心", href: "/pos/checkout" },
        { label: "車輛銷售" },
      ]}
    >
      <div className="flex items-center gap-2 mb-4">
        <TabButton active={tab === "vehicle"} onClick={() => setTab("vehicle")} icon="two_wheeler">
          車款 ({ducatiModels.length})
        </TabButton>
        <TabButton active={tab === "accessory"} onClick={() => setTab("accessory")} icon="tune">
          配件 / 精品
        </TabButton>
      </div>

      {tab === "vehicle" && (
        <>
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            <FamilyChip active={family === "all"} onClick={() => setFamily("all")}>
              全部
            </FamilyChip>
            {DUCATI_FAMILIES.map((f) => (
              <FamilyChip key={f} active={family === f} onClick={() => setFamily(f)}>
                {f}
              </FamilyChip>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredModels.map((m) => (
              <article
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="aspect-[16/9] relative bg-gradient-to-br from-slate-900 to-slate-700">
                  <Image
                    src={m.thumb}
                    alt={m.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                    unoptimized
                  />
                  {m.isNew && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded">
                      NEW
                    </span>
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/40 backdrop-blur text-white text-[10px] rounded">
                    {m.family}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="font-display font-bold text-slate-900 truncate">{m.name}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{m.tagline}</p>
                  <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-500">
                    <span>{m.hp} hp</span>
                    <span>·</span>
                    <span>{m.displacementCc}cc</span>
                    {m.dryWeightKg && (
                      <>
                        <span>·</span>
                        <span>{m.dryWeightKg}kg</span>
                      </>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <p className="font-display text-lg font-extrabold text-indigo-600 tabular-nums">
                      {formatNTD(m.priceNTD)}
                    </p>
                    <Button size="sm" icon="add_shopping_cart" onClick={() => addVehicle(m.id)}>
                      加入
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tab === "accessory" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {skus.map((s) => {
            const cat = skuCategoryMeta[s.category];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => addAccessory(s.id)}
                className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-indigo-300 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cat.color}1A`, color: cat.color }}
                  >
                    <span className="material-symbols-outlined text-[22px]">{cat.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge tone="neutral">{cat.label}</Badge>
                      {s.brand && <span className="text-[10px] text-slate-400">{s.brand}</span>}
                    </div>
                    <p className="font-medium text-sm text-slate-900 leading-tight line-clamp-2">
                      {s.name}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 tabular-nums">{s.code}</span>
                      <span className="font-bold text-indigo-600 tabular-nums">
                        {formatNTD(s.price)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </CheckoutShell>
  );
}

function FamilyChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({
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
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
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
