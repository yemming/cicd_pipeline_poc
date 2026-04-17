"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { formatTWD, formatNumber, formatDate, gpTone } from "@/lib/pos/format";
import type {
  SaleOrder,
  UsedVehicle,
  UsedVehicleStatus,
} from "@/lib/pos/types";
import { SaleWizard } from "./sale-wizard";
import { DeliveryWizard } from "./delivery-wizard";

type Tab = "stock" | "orders";

const STATUS_LABEL: Record<UsedVehicleStatus, string> = {
  available: "可售",
  reserved: "保留",
  sold: "已售",
};

const STATUS_TONE: Record<UsedVehicleStatus, string> = {
  available: "bg-emerald-50 text-emerald-700",
  reserved: "bg-amber-50 text-amber-700",
  sold: "bg-slate-100 text-slate-500",
};

export function UsedCarSale({
  initialVehicles,
  initialOrders,
}: {
  initialVehicles: UsedVehicle[];
  initialOrders: SaleOrder[];
}) {
  useSetPageHeader({
    breadcrumb: [{ label: "POS 收銀", href: "/pos" }, { label: "中古車銷售" }],
  });

  const [tab, setTab] = useState<Tab>("stock");
  const [vehicles, setVehicles] = useState<UsedVehicle[]>(initialVehicles);
  const [orders, setOrders] = useState<SaleOrder[]>(initialOrders);
  const [wizardVehicle, setWizardVehicle] = useState<UsedVehicle | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<SaleOrder | null>(null);

  const stats = useMemo(() => {
    let available = 0;
    let reserved = 0;
    let sold = 0;
    let stockValue = 0;
    for (const v of vehicles) {
      if (v.status === "available") available++;
      else if (v.status === "reserved") reserved++;
      else sold++;
      if (v.status !== "sold") stockValue += v.listPrice;
    }
    return { available, reserved, sold, stockValue };
  }, [vehicles]);

  function handleCreateOrder(order: SaleOrder) {
    setOrders((prev) => [order, ...prev]);
    setVehicles((prev) =>
      prev.map((v) => (v.id === order.vehicleId ? { ...v, status: "reserved" } : v)),
    );
    setWizardVehicle(null);
    setTab("orders");
  }

  function handleDelivery(orderId: string) {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, paymentStatus: "paid", deliveryDate: new Date().toISOString() }
          : o,
      ),
    );
    const target = orders.find((o) => o.id === orderId);
    if (target) {
      setVehicles((prev) =>
        prev.map((v) => (v.id === target.vehicleId ? { ...v, status: "sold" } : v)),
      );
    }
    setDeliveryOrder(null);
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="可售" value={formatNumber(stats.available)} tone="ok" />
        <StatCard label="保留中" value={formatNumber(stats.reserved)} tone="warn" />
        <StatCard label="已售（累計）" value={formatNumber(stats.sold)} tone="neutral" />
        <StatCard label="在售市值" value={formatTWD(stats.stockValue)} tone="neutral" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-2 flex gap-1">
          <TabBtn active={tab === "stock"} onClick={() => setTab("stock")}>
            在售車輛（{vehicles.filter((v) => v.status !== "sold").length}）
          </TabBtn>
          <TabBtn active={tab === "orders"} onClick={() => setTab("orders")}>
            銷售單（{orders.length}）
          </TabBtn>
        </div>

        {tab === "stock" ? (
          <VehicleGrid
            vehicles={vehicles}
            onSell={(v) => setWizardVehicle(v)}
          />
        ) : (
          <SaleOrdersList
            orders={orders}
            vehicles={vehicles}
            onDeliver={(o) => setDeliveryOrder(o)}
          />
        )}
      </div>

      {/* Wizards */}
      {wizardVehicle && (
        <SaleWizard
          vehicle={wizardVehicle}
          onClose={() => setWizardVehicle(null)}
          onConfirm={handleCreateOrder}
        />
      )}
      {deliveryOrder && (
        <DeliveryWizard
          order={deliveryOrder}
          vehicle={vehicles.find((v) => v.id === deliveryOrder.vehicleId)}
          onClose={() => setDeliveryOrder(null)}
          onConfirm={() => handleDelivery(deliveryOrder.id)}
        />
      )}
    </div>
  );
}

function VehicleGrid({
  vehicles,
  onSell,
}: {
  vehicles: UsedVehicle[];
  onSell: (v: UsedVehicle) => void;
}) {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {vehicles.map((v) => {
        const gpAmt = v.listPrice - v.purchasePrice - v.refurbCost;
        const gpRatio = gpAmt / v.listPrice;
        const tone = gpTone(gpRatio);
        const canSell = v.status === "available";
        return (
          <div
            key={v.id}
            className={`relative bg-white border rounded-xl overflow-hidden transition-all ${
              canSell ? "border-slate-200 hover:border-indigo-400 hover:shadow-md" : "border-slate-100"
            }`}
          >
            {/* Photo placeholder */}
            <div className="relative h-36 bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-white/20 text-[80px]">
                two_wheeler
              </span>
              <span
                className={`absolute top-2 right-2 text-[11px] font-bold px-2 py-1 rounded ${STATUS_TONE[v.status]}`}
              >
                {STATUS_LABEL[v.status]}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {v.brand} {v.model}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {v.year} ・ {v.color} ・ {formatNumber(v.mileageKm)} km
                </p>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  售價
                </span>
                <span className="text-xl font-black text-slate-900 tabular-nums">
                  {formatTWD(v.listPrice)}
                </span>
              </div>

              <div className={`rounded-lg px-3 py-2 ${tone.bg}`}>
                <div className="flex items-baseline justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${tone.text}`}>
                    預估毛利（{tone.label}）
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${tone.text}`}>
                    {formatTWD(gpAmt)} · {(gpRatio * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <button
                disabled={!canSell}
                onClick={() => canSell && onSell(v)}
                className="w-full h-11 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">handshake</span>
                {canSell ? "建立銷售單" : v.status === "reserved" ? "已保留" : "已售出"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SaleOrdersList({
  orders,
  vehicles,
  onDeliver,
}: {
  orders: SaleOrder[];
  vehicles: UsedVehicle[];
  onDeliver: (o: SaleOrder) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <span className="material-symbols-outlined text-5xl mb-2 block">receipt_long</span>
        <p className="text-sm">尚無銷售單</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {orders.map((o) => {
        const v = vehicles.find((x) => x.id === o.vehicleId);
        const tone = gpTone(o.gpRatio);
        const paid = o.paymentStatus === "paid";
        const delivered = !!o.deliveryDate && paid;
        return (
          <li key={o.id} className="p-4 hover:bg-slate-50/60">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-slate-500">{o.id}</span>
                  <PaymentStatusBadge status={o.paymentStatus} />
                  {delivered && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      已交車
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    {v ? `${v.brand} ${v.model} ${v.year}` : "— 車輛已移除 —"}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {formatDate(o.createdAt)} ・ {o.salesperson}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                  <Field label="客戶" value={`${o.customerName} ${o.customerPhone}`} />
                  <Field label="成交價" value={<span className="tabular-nums font-semibold">{formatTWD(o.salePrice)}</span>} />
                  <Field label="訂金" value={<span className="tabular-nums">{formatTWD(o.depositAmount)}</span>} />
                  <Field
                    label="毛利"
                    value={
                      <span className={`font-semibold tabular-nums ${tone.text}`}>
                        {formatTWD(o.gp1)} · {(o.gpRatio * 100).toFixed(1)}%
                      </span>
                    }
                  />
                  <Field
                    label="來源"
                    value={o.sourceType === "sales-led" ? "銷售引導" : "技師推薦"}
                  />
                </div>
              </div>
              <div className="shrink-0">
                {!delivered && (
                  <button
                    onClick={() => onDeliver(o)}
                    className="h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                    交車確認
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentStatusBadge({
  status,
}: {
  status: SaleOrder["paymentStatus"];
}) {
  const map = {
    deposit: { label: "僅訂金", cls: "bg-amber-50 text-amber-700" },
    partial: { label: "部分付款", cls: "bg-orange-50 text-orange-700" },
    paid: { label: "全額已付", cls: "bg-emerald-50 text-emerald-700" },
  }[status];
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${map.cls}`}>
      {map.label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}

function TabBtn({
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
      onClick={onClick}
      className={`h-12 px-4 text-sm font-semibold transition-all relative ${
        active ? "text-indigo-700" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-600 rounded-t" />
      )}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
      : tone === "warn"
        ? "text-amber-700 bg-amber-50 border-amber-100"
        : "text-slate-800 bg-white border-slate-200";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  );
}
