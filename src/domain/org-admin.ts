/**
 * Org admin domain helper — server-only。
 *
 * `/admin/org/{brands,groups,stores}` 3 個 board page 走這支。
 *
 * Throw sentinel: "UNAUTHENTICATED" / "FORBIDDEN_ORG_ADMIN"
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

// ───────────────────────── admin guard ─────────────────────────

async function ensureOrgAdmin() {
  const ctx = await getCurrentUserAndAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_ORG_ADMIN");
  return ctx;
}

// ───────────────────────── /admin/org/brands ─────────────────────────

export interface BrandsBoardRow {
  id: string;
  name: string;
  manufacturer: string | null;
  created_at: string;
  group_ids: string[];
  store_count: number;
}

export interface BrandsBoardData {
  rows: BrandsBoardRow[];
  groups: Array<{ id: string; name: string }>;
}

export async function getBrandsBoardData(): Promise<BrandsBoardData> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: brands }, { data: groups }, { data: gbAgg }, { data: orgsAgg }] =
    await Promise.all([
      sb.from("brands").select("id, name, manufacturer, created_at").order("id"),
      sb.from("groups").select("id, name").order("id"),
      sb.from("group_brands").select("brand_id, group_id"),
      sb.from("organizations").select("brand_id"),
    ]);

  const groupsForBrand = new Map<string, string[]>();
  for (const r of gbAgg ?? []) {
    const list = groupsForBrand.get(r.brand_id) ?? [];
    list.push(r.group_id);
    groupsForBrand.set(r.brand_id, list);
  }
  const storeCount = new Map<string, number>();
  for (const r of orgsAgg ?? []) {
    storeCount.set(r.brand_id, (storeCount.get(r.brand_id) ?? 0) + 1);
  }
  const rows = (brands ?? []).map((b) => ({
    ...b,
    group_ids: groupsForBrand.get(b.id) ?? [],
    store_count: storeCount.get(b.id) ?? 0,
  }));
  return { rows, groups: groups ?? [] };
}

// ───────────────────────── /admin/org/groups ─────────────────────────

export interface GroupsBoardRow {
  id: string;
  name: string;
  short_name: string | null;
  created_at: string;
  org_count: number;
  brand_count: number;
}

export async function getGroupsBoardData(): Promise<{ rows: GroupsBoardRow[] }> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: groups }, { data: orgsAgg }, { data: gbAgg }] = await Promise.all([
    sb.from("groups").select("id, name, short_name, created_at").order("id"),
    sb.from("organizations").select("group_id"),
    sb.from("group_brands").select("group_id"),
  ]);

  const orgCount = new Map<string, number>();
  for (const o of orgsAgg ?? []) {
    if (o.group_id) orgCount.set(o.group_id, (orgCount.get(o.group_id) ?? 0) + 1);
  }
  const brandCount = new Map<string, number>();
  for (const g of gbAgg ?? []) {
    brandCount.set(g.group_id, (brandCount.get(g.group_id) ?? 0) + 1);
  }
  const rows = (groups ?? []).map((g) => ({
    ...g,
    org_count: orgCount.get(g.id) ?? 0,
    brand_count: brandCount.get(g.id) ?? 0,
  }));
  return { rows };
}

// ───────────────────────── /admin/org/stores ─────────────────────────

export interface StoresBoardRow {
  id: string;
  brand_id: string;
  group_id: string | null;
  parent_id: string | null;
  type: string;
  level: number;
  code: string;
  name: string;
  short_name: string | null;
  is_active: boolean;
  created_at: string;
  brand_ids: string[];
}

export interface StoresBoardData {
  rows: StoresBoardRow[];
  brands: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
}

export async function getStoresBoardData(): Promise<StoresBoardData> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: orgs }, { data: brands }, { data: groups }, { data: storeBrands }] =
    await Promise.all([
      sb
        .from("organizations")
        .select(
          "id, brand_id, group_id, parent_id, type, level, code, name, short_name, is_active, created_at",
        )
        .order("brand_id")
        .order("level")
        .order("code"),
      sb.from("brands").select("id, name").order("id"),
      sb.from("groups").select("id, name").order("id"),
      sb.from("store_brands").select("store_id, brand_id"),
    ]);

  const brandsForStore = new Map<string, string[]>();
  for (const r of storeBrands ?? []) {
    const list = brandsForStore.get(r.store_id) ?? [];
    list.push(r.brand_id);
    brandsForStore.set(r.store_id, list);
  }
  const rows = (orgs ?? []).map((o) => ({
    ...o,
    brand_ids: brandsForStore.get(o.id) ?? [],
  }));
  return { rows, brands: brands ?? [], groups: groups ?? [] };
}
