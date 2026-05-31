import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { brandKeys } from "@/lib/brands/registry";
import type { BrandKey } from "@/lib/brands/types";

/**
 * Active scope = 使用者目前作用中的 brand + (可選) store。
 *
 * 取代舊的 `BRAND_KEY` env：env 變成「沒登入時的 fallback brand」，登入後一律從
 * cookie + user_assignments 算。
 *
 * 切換器流程：
 *   client → setActiveScopeAction(brand, store?) → set cookie → revalidatePath('/')
 *   server → getActiveScope()                                     ← 讀 cookie + 驗證
 */

const SCOPE_COOKIE = "dealeros_scope";

const ENV_DEFAULT_BRAND: BrandKey =
  (process.env.BRAND_KEY as BrandKey | undefined) ??
  (process.env.NEXT_PUBLIC_BRAND_KEY as BrandKey | undefined) ??
  "ducati";

export type ActiveScope = {
  brand_id: BrandKey;
  /**
   * 法人 ID（NetSuite Subsidiary 對映）。
   * B5：cookie 結構升級為可選帶 `subsidiary_id`，若 cookie 有值就用、若無則 fallback 到
   * brands.default_subsidiary_id。當前 1:1 brand-subsidiary 對映下、切 subsidiary 等於切 brand，
   * 所以 UI 暫無切換 dropdown；長線多 subsidiary per brand 時補上 dropdown。
   *
   * 雙 brand 都已在 B1 設好預設法人，找不到時 throw error 讓問題早曝光。
   */
  subsidiary_id: string;
  /** null = 「全部店」（在 user 能見範圍內） */
  store_id: string | null;
};

/** 寫入 cookie 用的形狀（subsidiary_id 可選）。讀取時走 getActiveScope() 一律 normalize 過。 */
export type ScopeCookieShape = {
  brand_id?: BrandKey;
  subsidiary_id?: string;
  store_id?: string | null;
};

export type AccessibleStore = {
  id: string;
  brand_id: string;
  name: string;
  short_name: string | null;
  group_id: string;
};

export type AccessibleBrands = {
  brands: BrandKey[];
  /** key = brand_id；value = 該 brand 下使用者可進入的 store 清單 */
  storesByBrand: Record<string, AccessibleStore[]>;
};

/**
 * 算當前使用者能存取的 brands + stores。
 *
 * 規則（與 SQL function user_accessible_brands / user_accessible_stores 一致）：
 *   - app_admins 自動看到全部 brand + 全部 store
 *   - user_assignments scope_type='brand' → 該 brand 下所有 store
 *   - user_assignments scope_type='store' → 該 store 所屬 brand
 *   - user_assignments scope_type='group' → 該 group 代理的所有 brand 的所有 store
 *
 * 沒登入或無任何 assignment → 回傳空清單（UI 顯示「無權限」）。
 */
export const getAccessibleScopes = cache(async (): Promise<AccessibleBrands> => {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  const supabase = await createClient();

  // Admin: 全開
  if (isAdmin) {
    const [{ data: brandsRows }, { data: storesRows }] = await Promise.all([
      supabase.from("brands").select("id"),
      supabase
        .from("organizations")
        .select("id, brand_id, name, short_name, group_id")
        .eq("is_active", true),
    ]);

    const brands = (brandsRows ?? [])
      .map((b) => b.id as BrandKey)
      .filter((id) => brandKeys.includes(id));

    const storesByBrand: Record<string, AccessibleStore[]> = {};
    for (const s of storesRows ?? []) {
      const list = (storesByBrand[s.brand_id] ??= []);
      list.push({
        id: s.id,
        brand_id: s.brand_id,
        name: s.name,
        short_name: s.short_name,
        group_id: s.group_id ?? "default",
      });
    }
    return { brands, storesByBrand };
  }

  // 非 admin：照 user_assignments 算
  if (!userId) return { brands: [], storesByBrand: {} };

  const { data: assignments } = await supabase
    .from("user_assignments")
    .select("scope_type, scope_id, expires_at")
    .eq("user_id", userId);

  if (!assignments || assignments.length === 0) {
    return { brands: [], storesByBrand: {} };
  }

  const now = Date.now();
  const active = assignments.filter(
    (a) => !a.expires_at || new Date(a.expires_at).getTime() > now,
  );

  const groupIds = new Set<string>();
  const brandIdsFromAssign = new Set<string>();
  const storeIdsFromAssign = new Set<string>();
  for (const a of active) {
    if (a.scope_type === "group") groupIds.add(a.scope_id);
    else if (a.scope_type === "brand") brandIdsFromAssign.add(a.scope_id);
    else if (a.scope_type === "store") storeIdsFromAssign.add(a.scope_id);
  }

  // group → 該 group 代理的 brands
  if (groupIds.size > 0) {
    const { data: gbs } = await supabase
      .from("group_brands")
      .select("brand_id")
      .in("group_id", Array.from(groupIds));
    for (const gb of gbs ?? []) brandIdsFromAssign.add(gb.brand_id);
  }

  // 撈所有可能相關的 store（按 brand 全撈、按 store_id 直接撈、按 group 撈）
  const storeFilters: string[] = [];
  if (brandIdsFromAssign.size > 0) {
    storeFilters.push(
      `brand_id.in.(${Array.from(brandIdsFromAssign).map((b) => `"${b}"`).join(",")})`,
    );
  }
  if (storeIdsFromAssign.size > 0) {
    storeFilters.push(
      `id.in.(${Array.from(storeIdsFromAssign).map((s) => `"${s}"`).join(",")})`,
    );
  }
  if (groupIds.size > 0) {
    storeFilters.push(
      `group_id.in.(${Array.from(groupIds).map((g) => `"${g}"`).join(",")})`,
    );
  }
  if (storeFilters.length === 0) {
    return { brands: [], storesByBrand: {} };
  }

  const { data: storeRows } = await supabase
    .from("organizations")
    .select("id, brand_id, name, short_name, group_id")
    .or(storeFilters.join(","))
    .eq("is_active", true);

  const storesByBrand: Record<string, AccessibleStore[]> = {};
  const reachableBrands = new Set<string>();
  for (const s of storeRows ?? []) {
    reachableBrands.add(s.brand_id);
    const list = (storesByBrand[s.brand_id] ??= []);
    list.push({
      id: s.id,
      brand_id: s.brand_id,
      name: s.name,
      short_name: s.short_name,
      group_id: s.group_id ?? "default",
    });
  }

  const brands = Array.from(reachableBrands).filter((b): b is BrandKey =>
    brandKeys.includes(b as BrandKey),
  );

  return { brands, storesByBrand };
});

/**
 * 解析 cookie；若 cookie 指到使用者沒權限的 brand/store，自動 fallback。
 *
 * fallback 順序：
 *   1. cookie 內合法的 brand+store
 *   2. cookie brand 合法但 store 不合法 → 同 brand + null store
 *   3. cookie 都不合法 → 第一個可存取 brand + null store
 *   4. 沒任何可存取 brand → env 預設 brand（admin 才會走到這條）
 */
export const getActiveScope = cache(async (): Promise<ActiveScope> => {
  const { brands: accessibleBrands, storesByBrand } = await getAccessibleScopes();
  const cookieStore = await cookies();
  const raw = cookieStore.get(SCOPE_COOKIE)?.value;

  let parsed: ScopeCookieShape | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as ScopeCookieShape;
    } catch {
      parsed = null;
    }
  }

  const fallbackBrand: BrandKey =
    accessibleBrands[0] ?? ENV_DEFAULT_BRAND;

  const targetBrand: BrandKey =
    parsed?.brand_id && accessibleBrands.includes(parsed.brand_id)
      ? parsed.brand_id
      : fallbackBrand;

  const storesForBrand = storesByBrand[targetBrand] ?? [];
  const targetStore: string | null =
    parsed?.store_id && storesForBrand.some((s) => s.id === parsed!.store_id)
      ? parsed.store_id
      : null;

  // Subsidiary 解析（B5）：
  //   1) cookie 內若帶 subsidiary_id 且該 subsidiary 確實屬於 targetBrand → 採用
  //   2) 否則從 brands.default_subsidiary_id fallback
  // 注意：cookie 內的 subsidiary 必須做 brand 邊界檢查，避免使用者切 brand 後殘留舊 subsidiary。
  const supabase = await createClient();
  let subsidiary_id: string | null = null;

  if (parsed?.subsidiary_id) {
    const { data: subRow } = await supabase
      .from("subsidiaries")
      .select("id")
      .eq("id", parsed.subsidiary_id)
      .eq("is_active", true)
      .maybeSingle();
    if (subRow?.id) {
      // TODO 多 subsidiary per brand 時、改成驗 brand_subsidiaries pivot；現階段 1:1 用 brand.default 對 cookie 值比對
      const { data: brandRow } = await supabase
        .from("brands")
        .select("default_subsidiary_id")
        .eq("id", targetBrand)
        .single();
      if (brandRow?.default_subsidiary_id === subRow.id) {
        subsidiary_id = subRow.id;
      }
    }
  }

  if (!subsidiary_id) {
    const { data: brandRow } = await supabase
      .from("brands")
      .select("default_subsidiary_id")
      .eq("id", targetBrand)
      .single();
    subsidiary_id = (brandRow as { default_subsidiary_id: string | null } | null)
      ?.default_subsidiary_id ?? null;
  }

  // 系統 context（無登入 session，如 CI 部署通知 / 排程觸發的 dispatch）下，anon client 受
  // brands_read RLS（僅 authenticated）擋住讀不到 brands → 用 service client 補讀 reference data。
  // 僅在前面讀不到時才觸發，authed 流程行為不變。
  if (!subsidiary_id) {
    const { createServiceClient } = await import("@/lib/supabase/service");
    const { data: brandRow } = await createServiceClient()
      .from("brands")
      .select("default_subsidiary_id")
      .eq("id", targetBrand)
      .single();
    subsidiary_id = (brandRow as { default_subsidiary_id: string | null } | null)
      ?.default_subsidiary_id ?? null;
  }

  if (!subsidiary_id) {
    throw new Error(
      `Brand "${targetBrand}" has no default_subsidiary_id configured. ` +
        "請先在 brands 表設置 default_subsidiary_id（B1 應已 backfill，請檢查 DB）。",
    );
  }

  return { brand_id: targetBrand, subsidiary_id, store_id: targetStore };
});

/**
 * 寫入 cookie 的 server action 在 `./active-scope-action.ts`（"use server" boundary
 * 才能被 client component 呼叫）。讀取邏輯與寫入邏輯分檔，避免 module 同時是
 * server-only utils 又是 server actions 的混合。
 */
