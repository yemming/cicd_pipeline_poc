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

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
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
  zones: StagingZoneRow[];
  bins: StagingBinRow[];
  pendingInbound: PendingRoInboundRow[];
}> {
  const [tree, warehouses] = await Promise.all([
    getWarehouseTreeWithStaging(),
    listWarehouses(),
  ]);

  const stagingWarehouses = warehouses.filter((w) => w.is_warranty_staging);

  // 預設選一個 staging 倉（spec：預設選一個 staging 倉）
  const selected =
    warehouses.find((w) => w.id === selectedWarehouseId) ??
    stagingWarehouses[0] ??
    warehouses[0] ??
    null;

  const [occupancy, zonesBins, pendingInbound] = await Promise.all([
    selected ? getStagingOccupancy(selected.id) : Promise.resolve(null),
    selected
      ? listStagingZonesBins(selected.id)
      : Promise.resolve({ zones: [], bins: [] }),
    listPendingRoInbound(),
  ]);

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
    zones: zonesBins.zones,
    bins: zonesBins.bins,
    pendingInbound,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// M04L-11.4 · 儲位層級設定 + RO 觸發舊件入庫
// ════════════════════════════════════════════════════════════════════════════

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/staging-warehouse";

/**
 * control_level → 分區業務類型顯示。warehouse_zones.control_level 的合法值：
 * normal / high_value / hazardous / consignment / warranty。
 *   warranty   → WC 保固件（原廠保固索賠舊件）
 *   high_value → AC 事故件（高價/事故理賠件）
 * 其餘照原樣給中文。
 */
export type ZoneControlLevel =
  | "normal"
  | "high_value"
  | "hazardous"
  | "consignment"
  | "warranty";

export type BizTypeTag = {
  code: string; // WC / AC / —
  label: string; // 保固件 / 事故件 / 一般
  control_level: ZoneControlLevel;
};

function bizTypeOf(control_level: string | null | undefined): BizTypeTag {
  switch (control_level) {
    case "warranty":
      return { code: "WC", label: "保固件", control_level: "warranty" };
    case "high_value":
      return { code: "AC", label: "事故件", control_level: "high_value" };
    case "hazardous":
      return { code: "HZ", label: "危險品", control_level: "hazardous" };
    case "consignment":
      return { code: "CS", label: "寄存", control_level: "consignment" };
    default:
      return { code: "—", label: "一般", control_level: "normal" };
  }
}

export type StagingBinRow = {
  id: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  controlLevel: ZoneControlLevel;
  bizType: BizTypeTag;
  code: string;
  name: string | null;
  capacity: number | null;
  isActive: boolean;
  storedCount: number; // 即時佔用：count(items where bin_id = 該 bin)
};

export type StagingZoneRow = {
  id: string;
  code: string;
  name: string;
  controlLevel: ZoneControlLevel;
  bizType: BizTypeTag;
  isActive: boolean;
  binCount: number;
};

/**
 * 列某 staging 倉的 zones + bins（含 control_level 分區、各 bin 即時舊件數量）。
 * bin 的「業務類型 / 分區」沿用其所屬 zone 的 control_level（bins 表本身沒 control_level）。
 */
export async function listStagingZonesBins(warehouseId: string): Promise<{
  zones: StagingZoneRow[];
  bins: StagingBinRow[];
}> {
  if (!warehouseId) return { zones: [], bins: [] };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [zoneRes, binRes] = await Promise.all([
    supabase
      .from("warehouse_zones")
      .select("id, code, name, control_level, is_active, sort_order")
      .eq("brand_id", brand)
      .eq("warehouse_id", warehouseId)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("warehouse_bins")
      .select("id, code, name, capacity, zone_id, is_active, sort_order")
      .eq("brand_id", brand)
      .eq("warehouse_id", warehouseId)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);
  if (zoneRes.error) throw zoneRes.error;
  if (binRes.error) throw binRes.error;

  // 即時佔用：撈該 brand 全部 items 的 bin_id，groupBy bin
  const itemsRes = await supabase
    .from("parts_warranty_used_parts_items")
    .select("bin_id")
    .eq("brand_id", brand)
    .not("bin_id", "is", null);
  if (itemsRes.error) throw itemsRes.error;
  const countByBin = new Map<string, number>();
  for (const it of itemsRes.data ?? []) {
    const bid = (it as { bin_id: string | null }).bin_id;
    if (!bid) continue;
    countByBin.set(bid, (countByBin.get(bid) ?? 0) + 1);
  }

  const zoneMap = new Map(
    (zoneRes.data ?? []).map((z) => [z.id, z] as const),
  );

  const zones: StagingZoneRow[] = (zoneRes.data ?? []).map((z) => ({
    id: z.id,
    code: z.code,
    name: z.name,
    controlLevel: z.control_level as ZoneControlLevel,
    bizType: bizTypeOf(z.control_level),
    isActive: z.is_active,
    binCount: (binRes.data ?? []).filter((b) => b.zone_id === z.id).length,
  }));

  const bins: StagingBinRow[] = (binRes.data ?? []).map((b) => {
    const z = b.zone_id ? zoneMap.get(b.zone_id) : undefined;
    const cl = (z?.control_level ?? "normal") as ZoneControlLevel;
    return {
      id: b.id,
      zoneId: b.zone_id,
      zoneCode: z?.code ?? "—",
      zoneName: z?.name ?? "—",
      controlLevel: cl,
      bizType: bizTypeOf(cl),
      code: b.code,
      name: b.name,
      capacity: b.capacity,
      isActive: b.is_active,
      storedCount: countByBin.get(b.id) ?? 0,
    };
  });

  return { zones, bins };
}

export type UpsertStagingBinInput = {
  id?: string; // 有 → update；無 → insert
  warehouseId: string;
  zoneId: string;
  code: string;
  name?: string | null;
  capacity?: number | null;
};

/**
 * 儲位 CRUD（POC）：bin 掛在 zone 下。insert / update 共用。
 * brand_id 一律取 active scope，zone 必須屬於同 brand + 同 warehouse（防跨倉誤掛）。
 */
export async function upsertStagingBin(
  input: UpsertStagingBinInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const code = input.code?.trim();
  if (!code) return { ok: false, error: "儲位代碼不可為空" };
  if (!input.warehouseId) return { ok: false, error: "缺少倉庫 ID" };
  if (!input.zoneId) return { ok: false, error: "請選擇所屬分區（zone）" };

  // 驗證 zone 屬於同 brand + 同倉
  const zoneRes = await supabase
    .from("warehouse_zones")
    .select("id, warehouse_id")
    .eq("brand_id", brand)
    .eq("id", input.zoneId)
    .maybeSingle();
  if (zoneRes.error) return { ok: false, error: zoneRes.error.message };
  if (!zoneRes.data || zoneRes.data.warehouse_id !== input.warehouseId) {
    return { ok: false, error: "分區不存在或不屬於此倉" };
  }

  const name = input.name?.trim() || null;
  const capacity =
    typeof input.capacity === "number" && input.capacity >= 0
      ? Math.floor(input.capacity)
      : null;

  if (input.id) {
    const { data, error } = await supabase
      .from("warehouse_bins")
      .update({ zone_id: input.zoneId, code, name, capacity })
      .eq("id", input.id)
      .eq("brand_id", brand)
      .eq("warehouse_id", input.warehouseId)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: `儲位代碼「${code}」在此倉已存在` };
      }
      return { ok: false, error: `更新失敗：${error.message}` };
    }
    if (!data) return { ok: false, error: "找不到此儲位或無權限" };
    revalidatePath(PAGE_PATH);
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("warehouse_bins")
    .insert({
      brand_id: brand,
      warehouse_id: input.warehouseId,
      zone_id: input.zoneId,
      code,
      name,
      capacity,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `儲位代碼「${code}」在此倉已存在` };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "建立失敗：未回傳資料" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

/** 啟用 / 停用儲位。 */
export async function setBinActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string; is_active: boolean }>> {
  await requirePermission(PERMISSIONS.WAREHOUSE_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  if (!id) return { ok: false, error: "缺少儲位 ID" };

  const { data, error } = await supabase
    .from("warehouse_bins")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand)
    .select("id, is_active")
    .maybeSingle();
  if (error) return { ok: false, error: `切換失敗：${error.message}` };
  if (!data) return { ok: false, error: "找不到此儲位或無權限" };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id, is_active: data.is_active } };
}

export type PendingRoInboundRow = {
  id: string; // used_part_item id
  roNo: string | null;
  itemName: string;
  itemCode: string | null;
  barcode: string;
  damageLevel: string;
  damageLabel: string | null;
  inboundDate: string | null;
  statusLabel: string | null;
  warehouseId: string | null; // 目前 metadata.warehouse_id（倉級舊位置）
};

/**
 * 列 status='awaiting' 的舊件（待入庫池）。
 * B2 決策：不依賴 repair_orders「竣工複檢通過」狀態，直接用本表 awaiting 當待入庫池。
 */
export async function listPendingRoInbound(): Promise<PendingRoInboundRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("parts_warranty_used_parts_items")
    .select(
      "id, ro_no, item_name, item_code, barcode, damage_level, damage_label, inbound_date, status, status_label, bin_id, metadata",
    )
    .eq("brand_id", brand)
    .eq("status", "awaiting")
    .is("bin_id", null)
    .order("inbound_date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((it) => ({
    id: it.id,
    roNo: it.ro_no,
    itemName: it.item_name,
    itemCode: it.item_code,
    barcode: it.barcode,
    damageLevel: it.damage_level,
    damageLabel: it.damage_label,
    inboundDate: it.inbound_date,
    statusLabel: it.status_label,
    warehouseId: readItemWarehouseId(it.metadata),
  }));
}

/**
 * 確認 RO 舊件入庫（跨表副作用，收在 helper 內）：
 *   1. parts_warranty_used_parts_items.bin_id = 選定 bin
 *   2. status awaiting → 'approved'（既有下一狀態；label 改「待申報」推進索賠到待申報）
 *   3. metadata.warehouse_id 同步成 bin 所屬倉（保持舊位置欄位一致）
 *   4. warehouse_bins.metadata.status 標 'occupied'（沿用 bins 既有 metadata.status 慣例）
 *
 * status 值域實測：awaiting / approved / disposed / shipped（無 'stored'）。
 * 故 awaiting 的下一站取既有 'approved'，並把 status_label 設為「待申報」表達語意。
 */
export async function confirmRoInbound(input: {
  usedPartItemId: string;
  binId: string;
}): Promise<ActionResult<{ id: string; binId: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { usedPartItemId, binId } = input;
  if (!usedPartItemId) return { ok: false, error: "缺少舊件 ID" };
  if (!binId) return { ok: false, error: "請選擇要入庫的儲位" };

  // 1. 驗 bin 屬同 brand、啟用中，取其 warehouse_id
  const binRes = await supabase
    .from("warehouse_bins")
    .select("id, warehouse_id, is_active, metadata")
    .eq("brand_id", brand)
    .eq("id", binId)
    .maybeSingle();
  if (binRes.error) return { ok: false, error: binRes.error.message };
  if (!binRes.data) return { ok: false, error: "找不到此儲位或無權限" };
  if (!binRes.data.is_active) {
    return { ok: false, error: "此儲位已停用，請改選其他儲位" };
  }
  const binWarehouseId = binRes.data.warehouse_id;

  // 2. 驗舊件屬同 brand、目前仍 awaiting（避免重複入庫 race）
  const itemRes = await supabase
    .from("parts_warranty_used_parts_items")
    .select("id, status, metadata")
    .eq("brand_id", brand)
    .eq("id", usedPartItemId)
    .maybeSingle();
  if (itemRes.error) return { ok: false, error: itemRes.error.message };
  if (!itemRes.data) return { ok: false, error: "找不到此舊件或無權限" };
  if (itemRes.data.status !== "awaiting") {
    return {
      ok: false,
      error: "此舊件已不在待入庫狀態（可能已被處理），請重新整理",
    };
  }

  // 3. 更新舊件：bin_id + status + status_label + metadata.warehouse_id 同步
  const prevMeta =
    itemRes.data.metadata && typeof itemRes.data.metadata === "object" &&
    !Array.isArray(itemRes.data.metadata)
      ? (itemRes.data.metadata as Record<string, unknown>)
      : {};
  const nextMeta = { ...prevMeta, warehouse_id: binWarehouseId };

  const updItem = await supabase
    .from("parts_warranty_used_parts_items")
    .update({
      bin_id: binId,
      status: "approved",
      status_label: "待申報",
      metadata: nextMeta as Json,
    })
    .eq("id", usedPartItemId)
    .eq("brand_id", brand)
    .eq("status", "awaiting") // 樂觀鎖：只在仍 awaiting 時更新
    .select("id")
    .maybeSingle();
  if (updItem.error) {
    return { ok: false, error: `入庫失敗：${updItem.error.message}` };
  }
  if (!updItem.data) {
    return { ok: false, error: "入庫失敗：舊件狀態已變更，請重新整理" };
  }

  // 4. bin metadata.status → occupied（沿用 bins 既有 metadata.status 慣例；best-effort）
  const prevBinMeta =
    binRes.data.metadata && typeof binRes.data.metadata === "object" &&
    !Array.isArray(binRes.data.metadata)
      ? (binRes.data.metadata as Record<string, unknown>)
      : {};
  await supabase
    .from("warehouse_bins")
    .update({ metadata: { ...prevBinMeta, status: "occupied" } as Json })
    .eq("id", binId)
    .eq("brand_id", brand);

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: usedPartItemId, binId } };
}
