"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BrandKey } from "@/lib/brands/types";

export type ScopeContextValue = {
  brand_id: BrandKey;
  store_id: string | null;
  /**
   * 該使用者能存取的所有 brand
   * （從 user_assignments + group_brands + store_brands 算出）
   */
  accessibleBrands: BrandKey[];
  /**
   * 當前 brand 下使用者能存取的所有店；server 端依 brand 已過濾。
   * 第一筆為 null/「全部店」是由 UI 自己加，不在這裡。
   */
  accessibleStores: Array<{
    id: string;
    name: string;
    short_name: string | null;
  }>;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({
  value,
  children,
}: {
  value: ScopeContextValue;
  children: ReactNode;
}) {
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useActiveScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) {
    throw new Error("useActiveScope must be used inside <ScopeProvider>");
  }
  return ctx;
}

export function useActiveBrand(): BrandKey {
  return useActiveScope().brand_id;
}

export function useActiveStore(): string | null {
  return useActiveScope().store_id;
}
