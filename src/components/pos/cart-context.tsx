"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Cart,
  CheckoutMode,
  LineItem,
  Payment,
} from "@/lib/pos/pos-types";

const STORAGE_KEY = "pos-cart-v1";

const emptyCart: Cart = {
  mode: "vehicle",
  lines: [],
  fees: [],
  payments: [],
};

type CartCtx = {
  cart: Cart;
  setMode: (m: CheckoutMode) => void;
  addLine: (line: LineItem) => void;
  removeLine: (id: string) => void;
  updateLine: (id: string, patch: Partial<LineItem>) => void;
  addFee: (fee: LineItem) => void;
  removeFee: (id: string) => void;
  setCustomer: (id: string | undefined) => void;
  addPayment: (p: Payment) => void;
  clearPayments: () => void;
  clear: () => void;
  setWarranty: (b: boolean) => void;
  subtotal: number;
  feeTotal: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  paid: number;
  due: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(() => {
    if (typeof window === "undefined") return emptyCart;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return emptyCart;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const setMode = useCallback(
    (mode: CheckoutMode) =>
      setCart((c) => ({ ...c, mode, warrantyApplied: mode === "service" ? c.warrantyApplied : undefined })),
    [],
  );

  const addLine = useCallback(
    (line: LineItem) =>
      setCart((c) => {
        const existing = c.lines.find((l) => l.refId === line.refId && l.type === line.type);
        if (existing) {
          return {
            ...c,
            lines: c.lines.map((l) =>
              l.id === existing.id
                ? {
                    ...l,
                    quantity: l.quantity + line.quantity,
                    subtotal: l.unitPrice * (l.quantity + line.quantity),
                  }
                : l,
            ),
          };
        }
        return { ...c, lines: [...c.lines, line] };
      }),
    [],
  );

  const removeLine = useCallback(
    (id: string) => setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.id !== id) })),
    [],
  );

  const updateLine = useCallback(
    (id: string, patch: Partial<LineItem>) =>
      setCart((c) => ({
        ...c,
        lines: c.lines.map((l) => {
          if (l.id !== id) return l;
          const merged = { ...l, ...patch };
          merged.subtotal = merged.unitPrice * merged.quantity - (merged.discount ?? 0);
          return merged;
        }),
      })),
    [],
  );

  const addFee = useCallback(
    (fee: LineItem) => setCart((c) => ({ ...c, fees: [...c.fees.filter((f) => f.id !== fee.id), fee] })),
    [],
  );

  const removeFee = useCallback(
    (id: string) => setCart((c) => ({ ...c, fees: c.fees.filter((f) => f.id !== id) })),
    [],
  );

  const setCustomer = useCallback(
    (id: string | undefined) => setCart((c) => ({ ...c, customerId: id })),
    [],
  );

  const addPayment = useCallback(
    (p: Payment) => setCart((c) => ({ ...c, payments: [...c.payments, p] })),
    [],
  );

  const clearPayments = useCallback(() => setCart((c) => ({ ...c, payments: [] })), []);

  const setWarranty = useCallback((b: boolean) => setCart((c) => ({ ...c, warrantyApplied: b })), []);

  const clear = useCallback(() => setCart(emptyCart), []);

  const subtotal = useMemo(() => cart.lines.reduce((a, b) => a + b.subtotal, 0), [cart.lines]);
  const feeTotal = useMemo(() => cart.fees.reduce((a, b) => a + b.subtotal, 0), [cart.fees]);
  const taxableBase = useMemo(
    () =>
      cart.lines.filter((l) => l.taxable).reduce((a, b) => a + b.subtotal, 0) +
      cart.fees.filter((f) => f.taxable).reduce((a, b) => a + b.subtotal, 0),
    [cart.lines, cart.fees],
  );
  const taxAmount = useMemo(() => Math.round(taxableBase * 0.05), [taxableBase]);
  const total = subtotal + feeTotal + taxAmount;
  const paid = useMemo(() => cart.payments.reduce((a, b) => a + b.amount, 0), [cart.payments]);
  const due = total - paid;

  const value = useMemo(
    () => ({
      cart,
      setMode,
      addLine,
      removeLine,
      updateLine,
      addFee,
      removeFee,
      setCustomer,
      addPayment,
      clearPayments,
      clear,
      setWarranty,
      subtotal,
      feeTotal,
      taxableBase,
      taxAmount,
      total,
      paid,
      due,
    }),
    [
      cart,
      setMode,
      addLine,
      removeLine,
      updateLine,
      addFee,
      removeFee,
      setCustomer,
      addPayment,
      clearPayments,
      clear,
      setWarranty,
      subtotal,
      feeTotal,
      taxableBase,
      taxAmount,
      total,
      paid,
      due,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
