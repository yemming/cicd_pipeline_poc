"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartLine, Product } from "@/lib/pos/types";

type CartCtx = {
  lines: CartLine[];
  totalQty: number;
  totalAmount: number;
  add: (product: Product) => void;
  inc: (productId: string) => void;
  dec: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((product: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        if (existing.qty >= product.stockQty) return prev;
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }, []);

  const inc = useCallback((productId: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.product.id === productId && l.qty < l.product.stockQty
          ? { ...l, qty: l.qty + 1 }
          : l,
      ),
    );
  }, []);

  const dec = useCallback((productId: string) => {
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const { totalQty, totalAmount } = useMemo(() => {
    let q = 0;
    let a = 0;
    for (const l of lines) {
      q += l.qty;
      a += l.qty * l.product.unitPrice;
    }
    return { totalQty: q, totalAmount: a };
  }, [lines]);

  const value = useMemo(
    () => ({ lines, totalQty, totalAmount, add, inc, dec, remove, clear }),
    [lines, totalQty, totalAmount, add, inc, dec, remove, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
