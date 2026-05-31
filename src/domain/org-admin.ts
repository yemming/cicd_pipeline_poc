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

// ───────────────────────── /admin/org/brands/[id] ─────────────────────────

export interface BrandDetail {
  id: string;
  name: string;
  manufacturer: string | null;
  default_subsidiary_id: string | null;
  netsuite_segment_value_id: string | null;
  netsuite_synced_at: string | null;
  created_at: string;
  updated_at: string;
  group_ids: string[];
  store_count: number;
}

export interface BrandDetailData {
  brand: BrandDetail | null;
  /** 全部集團（給代理集團多選用） */
  groups: Array<{ id: string; name: string }>;
}

/** detail page 用：撈單一品牌 + 代理集團 + 全部集團選項 */
export async function getBrandDetailData(id: string): Promise<BrandDetailData> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: brand }, { data: groups }, { data: gbAgg }, { data: orgsAgg }] =
    await Promise.all([
      sb
        .from("brands")
        .select(
          "id, name, manufacturer, default_subsidiary_id, netsuite_segment_value_id, netsuite_synced_at, created_at, updated_at",
        )
        .eq("id", id)
        .maybeSingle(),
      sb.from("groups").select("id, name").order("id"),
      sb.from("group_brands").select("group_id").eq("brand_id", id),
      sb.from("organizations").select("id", { count: "exact", head: true }).eq("brand_id", id),
    ]);

  if (!brand) return { brand: null, groups: groups ?? [] };

  return {
    brand: {
      ...brand,
      group_ids: (gbAgg ?? []).map((r) => r.group_id),
      store_count: orgsAgg?.length ?? 0,
    },
    groups: groups ?? [],
  };
}

/** create page 用：只撈全部集團選項 */
export async function getBrandFormLookups(): Promise<{
  groups: Array<{ id: string; name: string }>;
}> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const { data: groups } = await sb.from("groups").select("id, name").order("id");
  return { groups: groups ?? [] };
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

// ───────────────────────── /admin/org/groups/[id] ─────────────────────────

export interface GroupDetail {
  id: string;
  name: string;
  short_name: string | null;
  tenant_uuid: string;
  created_at: string;
  updated_at: string;
  org_count: number;
  brand_count: number;
  /** 此集團代理的品牌（顯示用） */
  brands: Array<{ id: string; name: string }>;
}

/** detail page 用：撈單一集團 + 統計 + 代理品牌清單 */
export async function getGroupDetailData(
  id: string,
): Promise<{ group: GroupDetail | null }> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: group }, { data: orgsAgg }, { data: gbAgg }, { data: brands }] =
    await Promise.all([
      sb
        .from("groups")
        .select("id, name, short_name, tenant_uuid, created_at, updated_at")
        .eq("id", id)
        .maybeSingle(),
      sb.from("organizations").select("id").eq("group_id", id),
      sb.from("group_brands").select("brand_id").eq("group_id", id),
      sb.from("brands").select("id, name").order("id"),
    ]);

  if (!group) return { group: null };

  const brandIds = new Set((gbAgg ?? []).map((r) => r.brand_id));
  const brandList = (brands ?? []).filter((b) => brandIds.has(b.id));

  return {
    group: {
      ...group,
      org_count: orgsAgg?.length ?? 0,
      brand_count: brandIds.size,
      brands: brandList,
    },
  };
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

// ───────────────────────── /admin/org/stores/[id] ─────────────────────────

export interface StoreDetail {
  id: string;
  brand_id: string;
  group_id: string | null;
  parent_id: string | null;
  type: string;
  level: number;
  code: string;
  name: string;
  short_name: string | null;
  store_type: string | null;
  address: string | null;
  phone: string | null;
  responsible_person: string | null;
  bank_account: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  brand_ids: string[];
  /** 上層 region（type=region）的顯示名，無則 null */
  parent_label: string | null;
}

export interface StoreDetailData {
  store: StoreDetail | null;
  brands: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  /** 同 brand 的 region 層節點（給上層 picker 用） */
  regions: Array<{ id: string; code: string; name: string; brand_id: string }>;
}

/** detail page 用：撈單一門店 + 掛載品牌 + 全部 brand/group/region 選項 */
export async function getStoreDetailData(id: string): Promise<StoreDetailData> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: org }, { data: brands }, { data: groups }, { data: regions }, { data: storeBrands }] =
    await Promise.all([
      sb
        .from("organizations")
        .select(
          "id, brand_id, group_id, parent_id, type, level, code, name, short_name, store_type, address, phone, responsible_person, bank_account, notes, is_active, created_at, updated_at",
        )
        .eq("id", id)
        .maybeSingle(),
      sb.from("brands").select("id, name").order("id"),
      sb.from("groups").select("id, name").order("id"),
      sb
        .from("organizations")
        .select("id, code, name, brand_id")
        .eq("type", "region")
        .order("code"),
      sb.from("store_brands").select("brand_id").eq("store_id", id),
    ]);

  if (!org) {
    return { store: null, brands: brands ?? [], groups: groups ?? [], regions: regions ?? [] };
  }

  let parentLabel: string | null = null;
  if (org.parent_id) {
    const parent = (regions ?? []).find((r) => r.id === org.parent_id);
    parentLabel = parent ? `${parent.code} — ${parent.name}` : null;
  }

  return {
    store: {
      ...org,
      brand_ids: (storeBrands ?? []).map((r) => r.brand_id),
      parent_label: parentLabel,
    },
    brands: brands ?? [],
    groups: groups ?? [],
    regions: regions ?? [],
  };
}

/** create page 用：撈 brand/group/region 選項 */
export async function getStoreFormLookups(): Promise<{
  brands: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; code: string; name: string; brand_id: string }>;
}> {
  await ensureOrgAdmin();
  const sb = createServiceClient();
  const [{ data: brands }, { data: groups }, { data: regions }] = await Promise.all([
    sb.from("brands").select("id, name").order("id"),
    sb.from("groups").select("id, name").order("id"),
    sb
      .from("organizations")
      .select("id, code, name, brand_id")
      .eq("type", "region")
      .order("code"),
  ]);
  return { brands: brands ?? [], groups: groups ?? [], regions: regions ?? [] };
}
