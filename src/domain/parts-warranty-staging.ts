"use server";

/**
 * Domain Helper — Parts Warranty Staging Warehouse (M04L-11 A 級升級)
 *
 * 用途：售後管理員選哪個倉作「保固暫存倉」— 客戶送回有問題的舊件，先放這個倉，
 *      等原廠審核 → 退原廠或銷毀。
 *
 * 對應 schema：
 *   warehouses.is_warranty_staging boolean  ← 本次新增
 *   warehouse_zones, warehouse_bins         ← 三層架構（zone / warehouse / bin）
 *   parts_warranty_used_parts_items         ← 舊件主檔；metadata.warehouse_id 指到該倉
 *
 * UI 一律透過此 helper 取資料，禁止 page / component import @/lib/supabase/*。
 * 不動 src/domain/warranty.ts 既有 staging 相關函式（仍由 ro-link / cost-recovery 子頁等
 * 場景沿用），本檔提供 A 級 HierarchyTree + Occupancy 視覺化新介面。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { Json } from "@/lib/database.types";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type WarehouseListRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_active: boolean;
  is_warranty_staging: boolean;
  org_id: string | null;
  org_name: string | null;
};

export type TreeNodeData = {
  id: string;
  label: string;
  kind: "brand" | "warehouse" | "zone" | "bin";
  warehouseId?: string;
  isStaging?: boolean;
  isActive?: boolean;
  children?: TreeNodeData[];
};

export type AgeBucket = "0-30" | "30-60" | "60-90" | "90+";

export type StagingOccupancy = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  storedCount: number; // 該倉目前佔用件數（active 狀態）
  avgAgeDays: number; // 平均庫齡
  oldestDays: number; // 最老件天數
  ageDistribution: { bucket: AgeBucket; count: number }[];
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["awaiting", "approved", "reviewing"]);

function daysBetween(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

function readItemWarehouseId(metadata: Json | null): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const v = (metadata as Record<string, unknown>).warehouse_id;
  return typeof v === "string" ? v : null;
}

function bucketOf(days: number): AgeBucket {
  if (days < 30) return "0-30";
  if (days < 60) return "30-60";
  if (days < 90) return "60-90";
  return "90+";
}

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

/**
 * 列出當前 brand 全部倉庫，含 is_warranty_staging flag 與所屬門店名稱。
 */
export async function listWarehouses(): Promise<WarehouseListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: whs, error } = await supabase
    .from("warehouses")
    .select(
      "id, code, name, type, is_active, is_warranty_staging, org_id, sort_order",
    )
    .eq("brand_id", brand)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  const orgIds = Array.from(
    new Set((whs ?? []).map((w) => w.org_id).filter((x): x is string => !!x)),
  );
  const orgMap = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgErr) throw orgErr;
    for (const o of orgs ?? []) {
      if (o.id && o.name) orgMap.set(o.id, o.name);
    }
  }

  return (whs ?? []).map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    type: w.type,
    is_active: w.is_active,
    is_warranty_staging: w.is_warranty_staging,
    org_id: w.org_id,
    org_name: w.org_id ? (orgMap.get(w.org_id) ?? null) : null,
  }));
}

/**
 * 給 HierarchyTree 用的多層樹資料。
 * 結構：Brand → Warehouse → Zone → Bin（spec 寫四層；資料庫實際是
 * warehouse / zone / bin 三層，沒 areas 表 — 對齊現況以三層 + brand 根節點呈現）。
 */
export async function getWarehouseTreeWithStaging(): Promise<TreeNodeData[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [whRes, zoneRes, binRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name, is_active, is_warranty_staging, sort_order")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("warehouse_zones")
      .select("id, code, name, warehouse_id, is_active, sort_order")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("warehouse_bins")
      .select("id, code, name, warehouse_id, zone_id, is_active, sort_order")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (whRes.error) throw whRes.error;
  if (zoneRes.error) throw zoneRes.error;
  if (binRes.error) throw binRes.error;

  const zonesByWh = new Map<string, typeof zoneRes.data>();
  for (const z of zoneRes.data ?? []) {
    if (!z.warehouse_id) continue;
    const arr = zonesByWh.get(z.warehouse_id) ?? [];
    arr.push(z);
    zonesByWh.set(z.warehouse_id, arr);
  }
  const binsByZone = new Map<string, typeof binRes.data>();
  const binsByWhNoZone = new Map<string, typeof binRes.data>();
  for (const b of binRes.data ?? []) {
    if (b.zone_id) {
      const arr = binsByZone.get(b.zone_id) ?? [];
      arr.push(b);
      binsByZone.set(b.zone_id, arr);
    } else if (b.warehouse_id) {
      const arr = binsByWhNoZone.get(b.warehouse_id) ?? [];
      arr.push(b);
      binsByWhNoZone.set(b.warehouse_id, arr);
    }
  }

  const warehouseNodes: TreeNodeData[] = (whRes.data ?? []).map((w) => {
    const zones = zonesByWh.get(w.id) ?? [];
    const zoneNodes: TreeNodeData[] = zones.map((z) => {
      const bins = binsByZone.get(z.id) ?? [];
      return {
        id: `zone:${z.id}`,
        label: `${z.code} ${z.name}`,
        kind: "zone",
        warehouseId: w.id,
        isActive: z.is_active,
        children: bins.map((b) => ({
          id: `bin:${b.id}`,
          label: `${b.code} ${b.name}`,
          kind: "bin",
          warehouseId: w.id,
          isActive: b.is_active,
        })),
      };
    });
    // 倉直接掛的 bin（沒分 zone 的）也加進來
    const orphanBins = binsByWhNoZone.get(w.id) ?? [];
    for (const b of orphanBins) {
      zoneNodes.push({
        id: `bin:${b.id}`,
        label: `${b.code} ${b.name}`,
        kind: "bin",
        warehouseId: w.id,
        isActive: b.is_active,
      });
    }
    return {
      id: `wh:${w.id}`,
      label: `${w.code} ${w.name}`,
      kind: "warehouse",
      warehouseId: w.id,
      isStaging: w.is_warranty_staging,
      isActive: w.is_active,
      children: zoneNodes,
    };
  });

  return [
    {
      id: `brand:${brand}`,
      label: `${brand.toUpperCase()} 倉庫架構`,
      kind: "brand",
      children: warehouseNodes,
    },
  ];
}

/**
 * 計算指定倉目前的暫存佔用：件數、平均庫齡、最老件、庫齡分佈（0-30/30-60/60-90/90+）。
 */
export async function getStagingOccupancy(
  warehouseId: string,
): Promise<StagingOccupancy | null> {
  if (!warehouseId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const whRes = await supabase
    .from("warehouses")
    .select("id, code, name, is_warranty_staging")
    .eq("brand_id", brand)
    .eq("id", warehouseId)
    .maybeSingle();
  if (whRes.error) throw whRes.error;
  if (!whRes.data) return null;

  const itemsRes = await supabase
    .from("parts_warranty_used_parts_items")
    .select("id, inbound_date, status, metadata")
    .eq("brand_id", brand);
  if (itemsRes.error) throw itemsRes.error;

  const myActive = (itemsRes.data ?? []).filter((it) => {
    if (!ACTIVE_STATUSES.has(it.status)) return false;
    const wid = readItemWarehouseId(it.metadata);
    return wid === warehouseId;
  });

  const buckets: Record<AgeBucket, number> = {
    "0-30": 0,
    "30-60": 0,
    "60-90": 0,
    "90+": 0,
  };
  let total = 0;
  let oldest = 0;
  for (const it of myActive) {
    const d = daysBetween(it.inbound_date);
    buckets[bucketOf(d)] += 1;
    total += d;
    if (d > oldest) oldest = d;
  }
  const storedCount = myActive.length;
  const avgAgeDays = storedCount > 0 ? Math.round(total / storedCount) : 0;

  return {
    warehouseId: whRes.data.id,
    warehouseCode: whRes.data.code,
    warehouseName: whRes.data.name,
    storedCount,
    avgAgeDays,
    oldestDays: oldest,
    ageDistribution: (
      ["0-30", "30-60", "60-90", "90+"] as AgeBucket[]
    ).map((b) => ({
      bucket: b,
      count: buckets[b],
    })),
  };
}

/**
 * 整頁初始資料：tree + warehouse list + 當前 staging 倉清單 + 預設選中倉的 occupancy。
 */
export async function getStagingWarehouseAdminPageData(
  selectedWarehouseId?: string,
): Promise<{
  tree: TreeNodeData[];
  warehouses: WarehouseListRow[];
  stagingWarehouses: WarehouseListRow[];
  selectedWarehouse: WarehouseListRow | null;
  occupancy: StagingOccupancy | null;
  totals: { stagingCount: number; storedTotal: number };
}> {
  const [tree, warehouses] = await Promise.all([
    getWarehouseTreeWithStaging(),
    listWarehouses(),
  ]);

  const stagingWarehouses = warehouses.filter((w) => w.is_warranty_staging);

  const selected =
    warehouses.find((w) => w.id === selectedWarehouseId) ??
    stagingWarehouses[0] ??
    warehouses[0] ??
    null;

  const occupancy = selected ? await getStagingOccupancy(selected.id) : null;

  // 全 brand 暫存件加總
  let storedTotal = 0;
  for (const w of stagingWarehouses) {
    const o = await getStagingOccupancy(w.id);
    if (o) storedTotal += o.storedCount;
  }

  return {
    tree,
    warehouses,
    stagingWarehouses,
    selectedWarehouse: selected,
    occupancy,
    totals: {
      stagingCount: stagingWarehouses.length,
      storedTotal,
    },
  };
}
