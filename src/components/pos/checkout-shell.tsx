"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCart } from "./cart-context";
import { CustomerChip } from "./customer-chip";
import { QuantityStepper } from "./quantity-stepper";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { PosPageShell } from "./page-shell";
import { formatNTD } from "@/lib/pos/format";
import { getCustomer } from "@/lib/pos/pos-mock-customers";
import type { TopbarBreadcrumb } from "@/components/page-header-context";

export type CheckoutStep = "items" | "customer" | "fees" | "payment" | "success";

const stepOrder: CheckoutStep[] = ["items", "customer", "fees", "payment", "success"];
const stepLabel: Record<CheckoutStep, string> = {
  items: "選購",
  customer: "客戶",
  fees: "代辦費",
  payment: "結帳",
  success: "完成",
};

export function CheckoutShell({
  title,
  subtitle,
  breadcrumb,
  step,
  children,
  rightActions,
}: {
  title: string;
  subtitle?: string;
  breadcrumb?: TopbarBreadcrumb[];
  step: CheckoutStep;
  children: ReactNode;
  rightActions?: ReactNode;
}) {
  return (
    <PosPageShell
      title={title}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      actions={rightActions}
    >
      <StepIndicator current={step} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 mt-6">
        <div className="min-w-0">{children}</div>
        <CheckoutSidebar step={step} />
      </div>
    </PosPageShell>
  );
}

export function StepIndicator({ current }: { current: CheckoutStep }) {
  const currentIdx = stepOrder.indexOf(current);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stepOrder.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                active
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : done
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-slate-400 border-slate-200"
              }`}
            >
              {done ? (
                <span className="material-symbols-outlined text-[14px]">check</span>
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {stepLabel[s]}
            </div>
            {i < stepOrder.length - 1 && (
              <span className={`w-4 h-px ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CheckoutSidebar({ step }: { step: CheckoutStep }) {
  const {
    cart,
    subtotal,
    feeTotal,
    taxAmount,
    total,
    due,
    paid,
    removeLine,
    updateLine,
  } = useCart();
  const customer = cart.customerId ? getCustomer(cart.customerId) : undefined;

  const modeLabel = { vehicle: "車輛銷售", service: "維修保養", retail: "精品零售" }[cart.mode];

  return (
    <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col max-h-[calc(100dvh-10rem)] sticky top-20">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">當前訂單</p>
          <h3 className="font-display font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600 text-[20px]">
              {cart.mode === "vehicle" ? "two_wheeler" : cart.mode === "service" ? "build" : "shopping_bag"}
            </span>
            {modeLabel}
          </h3>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
          {cart.lines.length} 項
        </span>
      </header>

      {customer && (
        <div className="px-5 py-3 border-b border-slate-100">
          <CustomerChip customer={customer} detailed />
        </div>
      )}

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {cart.lines.length === 0 ? (
          <EmptyState icon="shopping_cart" title="尚未加入商品" description="在左側選擇商品加入購物車" />
        ) : (
          cart.lines.map((l) => (
            <div key={l.id} className="px-5 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 leading-tight">{l.name}</p>
                {l.note && <p className="text-[10px] text-amber-600 mt-0.5">{l.note}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <QuantityStepper
                    value={l.quantity}
                    onChange={(n) => updateLine(l.id, { quantity: n })}
                    size="sm"
                  />
                  <span className="text-xs text-slate-400">× {formatNTD(l.unitPrice)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-slate-900 tabular-nums">
                  {formatNTD(l.subtotal)}
                </p>
                <button
                  type="button"
                  onClick={() => removeLine(l.id)}
                  className="text-[10px] text-rose-500 hover:text-rose-600 mt-1"
                >
                  移除
                </button>
              </div>
            </div>
          ))
        )}
        {cart.fees.length > 0 && (
          <div className="px-5 py-3 bg-amber-50/50">
            <p className="text-[10px] uppercase tracking-widest text-amber-600 font-medium mb-2">
              代辦費用
            </p>
            <div className="space-y-1.5">
              {cart.fees.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {f.name}
                    {!f.taxable && (
                      <span className="ml-1 text-[9px] text-amber-600">(收據)</span>
                    )}
                  </span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {formatNTD(f.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="px-5 py-4 border-t border-slate-200 bg-slate-50/50 space-y-1.5 text-sm">
        <Row label="小計" value={subtotal} muted />
        {feeTotal > 0 && <Row label="代辦費" value={feeTotal} muted />}
        <Row label="營業稅 (5%)" value={taxAmount} muted />
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <span className="font-bold text-slate-700">總金額</span>
          <span className="text-lg font-display font-extrabold text-indigo-600 tabular-nums">
            {formatNTD(total)}
          </span>
        </div>
        {paid > 0 && (
          <>
            <Row label="已收款" value={paid} accent />
            <Row label="尚差" value={due} bold tone={due <= 0 ? "success" : "warning"} />
          </>
        )}
        {step !== "payment" && step !== "success" && (
          <Button
            variant="primary"
            fullWidth
            className="mt-3"
            trailingIcon="arrow_forward"
            disabled={cart.lines.length === 0}
          >
            <Link href={nextStepHref(step, cart.mode)} className="w-full">
              前往{stepLabel[nextStep(step)]}
            </Link>
          </Button>
        )}
      </footer>
    </aside>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
  bold,
  tone,
}: {
  label: string;
  value: number;
  muted?: boolean;
  accent?: boolean;
  bold?: boolean;
  tone?: "success" | "warning";
}) {
  const cls = muted
    ? "text-slate-500"
    : accent
      ? "text-emerald-600 font-bold"
      : tone === "success"
        ? "text-emerald-600 font-bold"
        : tone === "warning"
          ? "text-amber-600 font-bold"
          : bold
            ? "text-slate-900 font-bold"
            : "text-slate-700";
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${cls}`}>{label}</span>
      <span className={`tabular-nums ${cls}`}>{formatNTD(value)}</span>
    </div>
  );
}

function nextStep(step: CheckoutStep): CheckoutStep {
  const i = stepOrder.indexOf(step);
  return stepOrder[Math.min(i + 1, stepOrder.length - 1)];
}

function nextStepHref(step: CheckoutStep, mode: string): string {
  const n = nextStep(step);
  if (n === "customer") return "/pos/checkout/customer";
  if (n === "fees") return mode === "vehicle" ? "/pos/checkout/fees" : "/pos/checkout/payment";
  if (n === "payment") return "/pos/checkout/payment";
  if (n === "success") return "/pos/checkout/success";
  return `/pos/checkout/${mode}`;
}
