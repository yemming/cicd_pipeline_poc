"use server";

/**
 * Domain Helper — Warranty / Staging Warehouse（保固索賠暫存倉）
 *
 * Reuse 既有三張表（warehouses + parts_warranty_staging_rules
 * + parts_warranty_used_parts_items）整合給 11.3 設定頁。
 *
 * UI 一律透過此 helper 取資料，禁止 page / component import @/lib/supabase/*。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database, Json } from "@/lib/database.types";
import {
  computeDerivedStatus,
  daysRemaining,
  directiveToDisposalAction,
  DEFAULT_KEEP_DAYS,
  OEM_DIRECTIVE,
  type DerivedStatus,
} from "@/domain/warranty.constants";

type Tables = Database["public"]["Tables"];

export type StagingRulesRow = Tables["parts_warranty_staging_rules"]["Row"];
export type StagingItemRow = Tables["parts_warranty_used_parts_items"]["Row"];
export type OldPartRow = Tables["old_parts"]["Row"];

export type StagingWarehouseSummary = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  is_active: boolean;
  org_id: string | null;
  org_name: string | null;
  slot_capacity: number | null;
  stored_count: number;
  overdue_count: number;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/warranty/staging-warehouse";

// ────────────────────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────────────────────

function daysBetween(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function readSlotCapacity(metadata: Json | null): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const cap = (metadata as Record<string, unknown>).slot_capacity;
  if (typeof cap === "number" && Number.isFinite(cap)) return cap;
  return null;
}

function readItemWarehouseId(metadata: Json | null): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).warehouse_id;
  return typeof v === "string" ? v : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

async function listStagingWarehouses(
  brand: string,
  rules: StagingRulesRow,
): Promise<StagingWarehouseSummary[]> {
  const supabase = await createClient();

  const [whRes, itemsRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name, type, is_active, org_id, metadata")
      .eq("brand_id", brand)
      .or("type.eq.warranty,name.ilike.%保固%,name.ilike.%暫存%")
      .order("name"),
    supabase
      .from("parts_warranty_used_parts_items")
      .select("id, inbound_date, metadata, status")
      .eq("brand_id", brand),
  ]);
  if (whRes.error) throw whRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const orgIds = Array.from(
    new Set(
      (whRes.data ?? [])
        .map((w) => w.org_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const orgMap = new Map<string, string>();
  if (orgIds.length > 0) {
    const orgsRes = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgsRes.error) throw orgsRes.error;
    for (const o of orgsRes.data ?? []) {
      if (o.id && o.name) orgMap.set(o.id, o.name);
    }
  }

  const items = itemsRes.data ?? [];
  // 活躍狀態（status != 'shipped' / 'disposed'）才算「目前存放」
  const activeStatuses = new Set(["awaiting", "approved", "reviewing"]);

  return (whRes.data ?? []).map((w) => {
    const myItems = items.filter((it) => {
      const wid = readItemWarehouseId(it.metadata);
      // 沒指定 warehouse_id 時，預設歸到 type='warranty' 的第一個倉（POC 容錯）
      if (wid) return wid === w.id;
      return w.type === "warranty";
    });
    const stillStored = myItems.filter((it) => activeStatuses.has(it.status));
    const overdue = stillStored.filter(
      (it) => daysBetween(it.inbound_date) >= rules.alert_days_first,
    );
    return {
      id: w.id,
      code: w.code,
      name: w.name,
      type: w.type,
      is_active: w.is_active,
      org_id: w.org_id,
      org_name: w.org_id ? orgMap.get(w.org_id) ?? null : null,
      slot_capacity: readSlotCapacity(w.metadata),
      stored_count: stillStored.length,
      overdue_count: overdue.length,
    };
  });
}

async function getOrEnsureRules(brand: string): Promise<StagingRulesRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_staging_rules")
    .select("*")
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  // 沒有就建一筆預設
  const insertRes = await supabase
    .from("parts_warranty_staging_rules")
    .insert({ brand_id: brand })
    .select("*")
    .single();
  if (insertRes.error) throw insertRes.error;
  return insertRes.data;
}

async function listStagingItems(
  brand: string,
  warehouseId: string | null,
): Promise<StagingItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_items")
    .select("*")
    .eq("brand_id", brand)
    .order("inbound_date", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw error;

  if (!warehouseId) return (data ?? []) as StagingItemRow[];

  // 篩屬於該倉的 items（依 metadata.warehouse_id，未設則 POC 容錯歸給 warranty 倉）
  return ((data ?? []) as StagingItemRow[]).filter((it) => {
    const wid = readItemWarehouseId(it.metadata);
    return wid ? wid === warehouseId : true;
  });
}

export async function getStagingWarehousePageData(activeWarehouseId?: string): Promise<{
  warehouses: StagingWarehouseSummary[];
  rules: StagingRulesRow;
  activeWarehouse: StagingWarehouseSummary | null;
  items: StagingItemRow[];
  canEdit: boolean;
}> {
  const brand = (await getActiveScope()).brand_id;
  const rules = await getOrEnsureRules(brand);
  const warehouses = await listStagingWarehouses(brand, rules);
  const active =
    warehouses.find((w) => w.id === activeWarehouseId) ?? warehouses[0] ?? null;
  const items = active ? await listStagingItems(brand, active.id) : [];
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  return { warehouses, rules, activeWarehouse: active, items, canEdit };
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export async function updateStagingRules(
  patch: Partial<StagingRulesRow>,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  // 安全：只允許白名單欄位
  const allowed: (keyof StagingRulesRow)[] = [
    "isolate_from_sellable",
    "exclude_from_alerts",
    "exclude_from_count",
    "allow_temp_borrow",
    "alert_days_first",
    "alert_days_escalate",
    "cost_calc_method",
  ];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in patch) safe[k as string] = patch[k];
  }
  if (Object.keys(safe).length === 0) {
    return { ok: false, error: "沒有可更新的欄位" };
  }
  // ensure row exists
  await getOrEnsureRules(brand);
  const { error } = await supabase
    .from("parts_warranty_staging_rules")
    .update(safe)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export type StagingWarehouseInput = {
  code: string;
  name: string;
  org_id: string | null;
  slot_capacity: number | null;
};

export async function createStagingWarehouse(
  input: StagingWarehouseInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: "代碼不可為空" };
  if (!name) return { ok: false, error: "名稱不可為空" };

  const metadata: Record<string, unknown> = {};
  if (typeof input.slot_capacity === "number") {
    metadata.slot_capacity = input.slot_capacity;
  }

  const { data, error } = await supabase
    .from("warehouses")
    .insert({
      brand_id: brand,
      code,
      name,
      type: "warranty",
      org_id: input.org_id,
      is_active: true,
      metadata: metadata as Json,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "倉庫代碼已存在" };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateStagingWarehouse(
  id: string,
  patch: { name?: string; org_id?: string | null; slot_capacity?: number | null },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 先讀回，避免覆蓋其他 metadata key
  const existing = await supabase
    .from("warehouses")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此暫存倉" };

  const meta: Record<string, unknown> =
    existing.data.metadata && typeof existing.data.metadata === "object" && !Array.isArray(existing.data.metadata)
      ? { ...(existing.data.metadata as Record<string, unknown>) }
      : {};
  if ("slot_capacity" in patch) {
    if (patch.slot_capacity == null) delete meta.slot_capacity;
    else meta.slot_capacity = patch.slot_capacity;
  }

  const update: Record<string, unknown> = { metadata: meta };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.org_id !== undefined) update.org_id = patch.org_id;

  const { error } = await supabase
    .from("warehouses")
    .update(update)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function toggleStagingWarehouseActive(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("warehouses")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────────────────────
// Used parts（保固索賠舊件 11.4）
// ────────────────────────────────────────────────────────────────────────────

const USED_PARTS_PATH = "/parts/warranty/used-parts";

export type OldPartListItem = OldPartRow & {
  item_code: string | null;
  item_name: string | null;
  warehouse_code: string | null;
  days_remaining: number;
  derived_status: DerivedStatus;
  claim_no: string | null;
  oem_directive: string | null;
};

export type OldPartsFilter = {
  status?: string; // derived: all / overdue / warn / ok / sent / destroyed
  wc_no?: string;
  ro_no?: string;
  keyword?: string;
  expiry_from?: string;
  page?: number;
  pageSize?: number;
};

export type OldPartsStats = {
  overdue: number;
  warning: number;
  in_storage: number;
  returned: number;
  disposed: number;
  total: number;
  imminentList: Array<{
    id: string;
    wc_no: string;
    item_name: string;
    days_remaining: number;
    derived_status: DerivedStatus;
  }>;
};

function readMetaString(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function mergeMeta(
  metadata: Json | null,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, ...patch };
}

function decorateOldPart(
  row: OldPartRow,
  itemMap: Map<string, { code: string; name: string }>,
  whMap: Map<string, string>,
): OldPartListItem {
  const itm = itemMap.get(row.item_id);
  return {
    ...row,
    item_code: itm?.code ?? null,
    item_name: itm?.name ?? null,
    warehouse_code: row.warehouse_id ? whMap.get(row.warehouse_id) ?? null : null,
    days_remaining: daysRemaining(row.expiry_date),
    derived_status: computeDerivedStatus({
      db_status: row.status,
      expiry_date: row.expiry_date,
    }),
    claim_no: readMetaString(row.metadata, "claim_no"),
    oem_directive: readMetaString(row.metadata, "oem_directive"),
  };
}

async function nextWcNo(
  brand: string,
  entryDate: string,
): Promise<string> {
  const supabase = await createClient();
  const ymd = entryDate.replace(/-/g, "").slice(0, 8);
  const prefix = `WC-${ymd}-`;
  const { data } = await supabase
    .from("old_parts")
    .select("wc_no")
    .eq("brand_id", brand)
    .ilike("wc_no", `${prefix}%`)
    .order("wc_no", { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data[0]) {
    const tail = data[0].wc_no.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function getOldPartsPageData(filter: OldPartsFilter = {}): Promise<{
  rows: OldPartListItem[];
  totalCount: number;
  stats: OldPartsStats;
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 撈全集（POC：舊件數量級不大；filter 在 application 層做 derived 篩選最簡單）
  const { data: allRows, error } = await supabase
    .from("old_parts")
    .select("*")
    .eq("brand_id", brand)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const itemIds = Array.from(new Set((allRows ?? []).map((r) => r.item_id)));
  const whIds = Array.from(
    new Set(
      (allRows ?? [])
        .map((r) => r.warehouse_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );

  const [itemsRes, whRes] = await Promise.all([
    itemIds.length
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    whIds.length
      ? supabase.from("warehouses").select("id, code").in("id", whIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const itemMap = new Map<string, { code: string; name: string }>();
  for (const i of itemsRes.data ?? [])
    if (i.id) itemMap.set(i.id, { code: i.code, name: i.name });
  const whMap = new Map<string, string>();
  for (const w of whRes.data ?? []) if (w.id) whMap.set(w.id, w.code);

  let decorated: OldPartListItem[] = (allRows ?? []).map((r) =>
    decorateOldPart(r, itemMap, whMap),
  );

  // stats from full set
  const stats: OldPartsStats = {
    overdue: 0,
    warning: 0,
    in_storage: 0,
    returned: 0,
    disposed: 0,
    total: decorated.length,
    imminentList: [],
  };
  for (const r of decorated) {
    switch (r.derived_status) {
      case "overdue":
        stats.overdue++;
        break;
      case "warn":
        stats.warning++;
        break;
      case "ok":
        stats.in_storage++;
        break;
      case "sent":
        stats.returned++;
        break;
      case "destroyed":
        stats.disposed++;
        break;
    }
  }
  stats.imminentList = decorated
    .filter(
      (r) => r.derived_status === "overdue" || r.derived_status === "warn",
    )
    .sort((a, b) => a.days_remaining - b.days_remaining)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      wc_no: r.wc_no,
      item_name: r.item_name ?? "—",
      days_remaining: r.days_remaining,
      derived_status: r.derived_status,
    }));

  // Application-level filter
  if (filter.status && filter.status !== "all") {
    decorated = decorated.filter((r) => r.derived_status === filter.status);
  }
  if (filter.wc_no) {
    const q = filter.wc_no.trim().toUpperCase();
    decorated = decorated.filter((r) => r.wc_no.toUpperCase().includes(q));
  }
  if (filter.ro_no) {
    // ro_no 只在 metadata 或 ro_id（不查 RO 表，POC 純文字 metadata）
    const q = filter.ro_no.trim().toUpperCase();
    decorated = decorated.filter((r) => {
      const meta = readMetaString(r.metadata, "ro_no");
      return meta ? meta.toUpperCase().includes(q) : false;
    });
  }
  if (filter.keyword) {
    const q = filter.keyword.trim().toLowerCase();
    decorated = decorated.filter(
      (r) =>
        (r.item_code ?? "").toLowerCase().includes(q) ||
        (r.item_name ?? "").toLowerCase().includes(q) ||
        (r.serial_no ?? "").toLowerCase().includes(q),
    );
  }
  if (filter.expiry_from) {
    decorated = decorated.filter(
      (r) => r.expiry_date && r.expiry_date >= filter.expiry_from!,
    );
  }

  const totalCount = decorated.length;
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? 50);
  const from = (page - 1) * pageSize;
  const rows = decorated.slice(from, from + pageSize);

  const canEdit = await hasPermission(PERMISSIONS.USEDPART_OPS);

  return { rows, totalCount, stats, canEdit };
}

export type RegisterOldPartInput = {
  wc_no?: string;
  ro_id?: string | null;
  ro_no?: string;
  cl_id?: string | null;
  claim_no?: string;
  item_id: string;
  serial_no?: string;
  vin?: string;
  warehouse_id?: string | null;
  entry_date: string;
  keep_days?: number;
  expiry_date?: string;
  oem_directive: string;
  tsb_no?: string;
  defect_desc?: string;
};

export async function registerOldPart(
  input: RegisterOldPartInput,
): Promise<ActionResult<{ id: string; wc_no: string }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  return registerOldPartCore(input);
}

/**
 * 跨模組 hook #6 用：竣工複檢通過 → 自動登錄保固換下的舊件。
 *
 * 與 registerOldPart 共用核心 insert，差別：
 *   - 不做 requirePermission（系統自動副作用，觸發者是技師 / SA，未必有 USEDPART_OPS）
 *   - 自帶 (ro_id, item_id) 防重：同工單同料件已登錄就 skip（防複檢被簽兩次 / sign→clearSign→sign）
 * 由 caller after() 包 try/catch、失敗不炸主流程。
 */
export async function registerOldPartFromInspection(
  input: RegisterOldPartInput,
): Promise<ActionResult<{ id: string; wc_no: string } | { skipped: true }>> {
  if (!input.item_id) return { ok: false, error: "料件必選" };
  if (!input.ro_id) return { ok: false, error: "缺少 ro_id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 防重：同 ro_id + item_id 已登錄過就 skip
  const { data: existing, error: dupErr } = await supabase
    .from("old_parts")
    .select("id")
    .eq("brand_id", brand)
    .eq("ro_id", input.ro_id)
    .eq("item_id", input.item_id)
    .limit(1)
    .maybeSingle();
  if (dupErr) return { ok: false, error: dupErr.message };
  if (existing) return { ok: true, data: { skipped: true } };

  return registerOldPartCore(input);
}

async function registerOldPartCore(
  input: RegisterOldPartInput,
): Promise<ActionResult<{ id: string; wc_no: string }>> {
  if (!input.item_id) return { ok: false, error: "料件必選" };
  if (!input.oem_directive)
    return { ok: false, error: "原廠處置指示必選" };
  if (!input.entry_date) return { ok: false, error: "入庫日期必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const wcNo = input.wc_no?.trim() || (await nextWcNo(brand, input.entry_date));

  const keepDays = input.keep_days ?? DEFAULT_KEEP_DAYS;
  let expiry = input.expiry_date;
  if (!expiry) {
    const d = new Date(input.entry_date);
    d.setDate(d.getDate() + keepDays);
    expiry = d.toISOString().slice(0, 10);
  }

  const metadata: Record<string, unknown> = {
    keep_days: keepDays,
  };
  if (input.claim_no) metadata.claim_no = input.claim_no.trim();
  if (input.oem_directive) metadata.oem_directive = input.oem_directive;
  if (input.tsb_no) metadata.tsb_no = input.tsb_no.trim();
  if (input.defect_desc) metadata.defect_desc = input.defect_desc.trim();
  if (input.ro_no) metadata.ro_no = input.ro_no.trim();

  const { data, error } = await supabase
    .from("old_parts")
    .insert({
      brand_id: brand,
      wc_no: wcNo,
      ro_id: input.ro_id ?? null,
      cl_id: input.cl_id ?? null,
      item_id: input.item_id,
      serial_no: input.serial_no?.trim() ?? null,
      vin: input.vin?.trim() ?? null,
      warehouse_id: input.warehouse_id ?? null,
      entry_date: input.entry_date,
      expiry_date: expiry,
      disposal_action: directiveToDisposalAction(input.oem_directive),
      status: "in_storage",
      metadata: metadata as Json,
    })
    .select("id, wc_no")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "WC 編號已存在，請重試" };
    return { ok: false, error: `登記失敗：${error.message}` };
  }

  revalidatePath(USED_PARTS_PATH);
  return { ok: true, data: { id: data.id, wc_no: data.wc_no } };
}

export type MarkReturnedInput = {
  returned_at: string;
  return_recipient: string;
  return_tracking_no: string;
  operator?: string;
};

export async function markOldPartReturned(
  id: string,
  input: MarkReturnedInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  if (!input.return_tracking_no?.trim())
    return { ok: false, error: "快遞單號必填" };
  if (!input.returned_at) return { ok: false, error: "寄出日期必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("old_parts")
    .select("metadata, status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到該舊件" };
  if (
    existing.data.status === "returned_oem" ||
    existing.data.status === "disposed"
  )
    return { ok: false, error: "已處置，無法重複標記" };

  const meta = mergeMeta(existing.data.metadata, {
    returned_at: input.returned_at,
    return_recipient: input.return_recipient,
    return_tracking_no: input.return_tracking_no.trim(),
    return_operator: input.operator ?? null,
  });

  const { error } = await supabase
    .from("old_parts")
    .update({
      status: "returned_oem",
      metadata: meta as Json,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `標記寄回失敗：${error.message}` };

  revalidatePath(USED_PARTS_PATH);
  return { ok: true, data: { id } };
}

export type MarkDisposedInput = {
  destroyed_at: string;
  destroy_method?: string;
  operator?: string;
};

export async function markOldPartDisposed(
  id: string,
  input: MarkDisposedInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  if (!input.destroyed_at) return { ok: false, error: "銷毀日期必填" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("old_parts")
    .select("metadata, status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到該舊件" };
  if (
    existing.data.status === "returned_oem" ||
    existing.data.status === "disposed"
  )
    return { ok: false, error: "已處置，無法重複標記" };

  const meta = mergeMeta(existing.data.metadata, {
    destroyed_at: input.destroyed_at,
    destroy_method: input.destroy_method ?? null,
    destroy_operator: input.operator ?? null,
  });

  const { error } = await supabase
    .from("old_parts")
    .update({
      status: "disposed",
      disposed_at: new Date(input.destroyed_at).toISOString(),
      metadata: meta as Json,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `標記銷毀失敗：${error.message}` };

  revalidatePath(USED_PARTS_PATH);
  return { ok: true, data: { id } };
}

export async function batchMarkOldParts(
  ids: string[],
  kind: "returned" | "disposed",
  input: MarkReturnedInput | MarkDisposedInput,
): Promise<ActionResult<{ updated: number }>> {
  await requirePermission(PERMISSIONS.USEDPART_OPS);
  if (!ids.length) return { ok: false, error: "請先勾選要處理的舊件" };

  let updated = 0;
  for (const id of ids) {
    const res =
      kind === "returned"
        ? await markOldPartReturned(id, input as MarkReturnedInput)
        : await markOldPartDisposed(id, input as MarkDisposedInput);
    if (res.ok) updated++;
  }
  if (updated === 0)
    return { ok: false, error: "全部標記失敗（可能皆已處置）" };
  return { ok: true, data: { updated } };
}

// 提供 modal 內下拉用
export async function listItemsForOldParts(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("items")
    .select("id, code, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code")
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; code: string; name: string }>;
}

export async function listWarrantyWarehouses(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, code, name, type")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return (data ?? [])
    .filter((w) => w.type === "warranty" || /保固|暫存/.test(w.name))
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));
}

// 用一下 OEM_DIRECTIVE 避免 import unused（如未來內部需要再清）
const _OEM_KEYS_USED = OEM_DIRECTIVE;
void _OEM_KEYS_USED;

// 提供給門市下拉用（建/編暫存倉時需要選 org）
export async function listOrganizationsForStaging(): Promise<
  { id: string; name: string }[]
> {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) return [];
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, level")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .filter((o) => o.id && o.name)
    .map((o) => ({ id: o.id, name: o.name }));
}

// ────────────────────────────────────────────────────────────────────────────
// RO 工單串接設定（11.5）
// ────────────────────────────────────────────────────────────────────────────

export type RoLinkConfigRow = {
  brand_id: string;
  dms_label: string | null;
  dms_endpoint: string | null;
  dms_connected: boolean;
  sync_ro_to_issue: boolean;
  sync_vin_check: boolean;
  sync_warranty_label: boolean;
  sync_technician: boolean;
  sync_estimate: boolean;
  sync_frequency: string;
  fallback_action: string;
  expiry_alert_days: number;
};

export type RoLinkRecordRow = {
  id: string;
  ro_no: string;
  vin: string | null;
  model: string | null;
  warranty_type: string | null;
  sync_status: string;
  sync_status_label: string | null;
  out_no: string | null;
  claim_no: string | null;
  sort_order: number;
};

export type RoLinkConfigPatch = {
  sync_ro_to_issue?: boolean;
  sync_vin_check?: boolean;
  sync_warranty_label?: boolean;
  sync_technician?: boolean;
  sync_estimate?: boolean;
  sync_frequency?: string;
  fallback_action?: string;
  expiry_alert_days?: number;
};

const RO_LINK_PATH = "/parts/warranty/ro-link";

export async function getRoLinkConfig(): Promise<RoLinkConfigRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("parts_warranty_ro_link_config")
    .select(
      "brand_id, dms_label, dms_endpoint, dms_connected, sync_ro_to_issue, sync_vin_check, sync_warranty_label, sync_technician, sync_estimate, sync_frequency, fallback_action, expiry_alert_days",
    )
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw new Error(`getRoLinkConfig: ${error.message}`);
  return (data ?? null) as RoLinkConfigRow | null;
}

export async function listRoLinkRecords(): Promise<RoLinkRecordRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("parts_warranty_ro_link_records")
    .select(
      "id, ro_no, vin, model, warranty_type, sync_status, sync_status_label, out_no, claim_no, sort_order",
    )
    .eq("brand_id", brand)
    .order("sort_order");
  if (error) throw new Error(`listRoLinkRecords: ${error.message}`);
  return (data ?? []) as RoLinkRecordRow[];
}

export async function updateRoLinkConfig(
  patch: RoLinkConfigPatch,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) upd[k] = v;
  }
  if (upd.expiry_alert_days !== undefined) {
    upd.expiry_alert_days = Math.max(
      0,
      Math.floor(Number(upd.expiry_alert_days)),
    );
  }
  if (Object.keys(upd).length === 0) {
    return { ok: true, data: { brand_id: brand } };
  }
  const { error } = await supabase
    .from("parts_warranty_ro_link_config")
    .update(upd)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function verifyRoLinkRecord(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("parts_warranty_ro_link_records")
    .update({ sync_status: "done", sync_status_label: "✅ 同步完成" })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `驗證失敗：${error.message}` };
  revalidatePath(RO_LINK_PATH);
  return { ok: true, data: { id } };
}

/**
 * POC：純模擬連線測試（不打外部 DMS）。
 * 真實串接接通後改為對 dms_endpoint 做健康檢查。
 */
export async function testRoLinkConnection(): Promise<
  ActionResult<{ latencyMs: number }>
> {
  await requirePermission(PERMISSIONS.WARRANTY_VIEW);
  const start = Date.now();
  // 模擬輕量延遲 ~120ms
  await new Promise((r) => setTimeout(r, 120));
  return { ok: true, data: { latencyMs: Date.now() - start } };
}

// ────────────────────────────────────────────────────────────────────────────
// 索賠費用回收追蹤（11.6）
// ────────────────────────────────────────────────────────────────────────────

const COST_RECOVERY_PATH = "/parts/warranty/cost-recovery";

export type CostRecoveryConfigRow = {
  brand_id: string;
  remind_7_days_before: boolean;
  alert_on_overdue: boolean;
  auto_settle_cost: boolean;
  sync_finance_system: boolean;
  monthly_report_auto: boolean;
  monthly_report_to_manager: boolean;
};

export type CostRecoveryConfigPatch = {
  remind_7_days_before?: boolean;
  alert_on_overdue?: boolean;
  auto_settle_cost?: boolean;
  sync_finance_system?: boolean;
  monthly_report_auto?: boolean;
  monthly_report_to_manager?: boolean;
};

export type ClaimRow = {
  id: string;
  claim_no: string;
  ro_no: string | null;
  item_label: string;
  hours_label: string | null;
  warranty_type: string | null;
  apply_amount: number;
  approved_amount: number;
  status: string;
  status_label: string | null;
  expected_pay_date: string | null;
  sort_order: number;
};

export type ClaimsFilter = {
  status?: string;
  warranty_type?: string;
  month?: string;
  keyword?: string;
};

export type CostRecoveryStats = {
  pending_amount: number;
  paid_amount: number;
  reviewing_amount: number;
  rejected_amount: number;
  pending_count: number;
  paid_count: number;
  reviewing_count: number;
  rejected_count: number;
};

export async function getCostRecoveryPageData(
  filter: ClaimsFilter = {},
): Promise<{
  config: CostRecoveryConfigRow | null;
  claims: ClaimRow[];
  stats: CostRecoveryStats;
  warrantyTypes: string[];
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [cfgRes, clRes] = await Promise.all([
    supabase
      .from("parts_warranty_cost_recovery_config")
      .select(
        "brand_id, remind_7_days_before, alert_on_overdue, auto_settle_cost, sync_finance_system, monthly_report_auto, monthly_report_to_manager",
      )
      .eq("brand_id", brand)
      .maybeSingle(),
    supabase
      .from("parts_warranty_claims")
      .select(
        "id, claim_no, ro_no, item_label, hours_label, warranty_type, apply_amount, approved_amount, status, status_label, expected_pay_date, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order"),
  ]);
  if (cfgRes.error) throw new Error(`config: ${cfgRes.error.message}`);
  if (clRes.error) throw new Error(`claims: ${clRes.error.message}`);

  const allClaims: ClaimRow[] = ((clRes.data ?? []) as ClaimRow[]).map(
    (c) => ({
      ...c,
      apply_amount: Number(c.apply_amount),
      approved_amount: Number(c.approved_amount),
    }),
  );

  // Stats 用 full set（不被 filter 影響）
  const stats: CostRecoveryStats = {
    pending_amount: 0,
    paid_amount: 0,
    reviewing_amount: 0,
    rejected_amount: 0,
    pending_count: 0,
    paid_count: 0,
    reviewing_count: 0,
    rejected_count: 0,
  };
  for (const c of allClaims) {
    switch (c.status) {
      case "approved":
        stats.pending_amount += c.approved_amount;
        stats.pending_count++;
        break;
      case "paid":
        stats.paid_amount += c.approved_amount;
        stats.paid_count++;
        break;
      case "reviewing":
        stats.reviewing_amount += c.apply_amount;
        stats.reviewing_count++;
        break;
      case "rejected":
        stats.rejected_amount += c.apply_amount;
        stats.rejected_count++;
        break;
    }
  }

  // Application-level filter
  let claims = allClaims;
  if (filter.status && filter.status !== "all") {
    claims = claims.filter((c) => c.status === filter.status);
  }
  if (filter.warranty_type && filter.warranty_type !== "all") {
    claims = claims.filter((c) => c.warranty_type === filter.warranty_type);
  }
  if (filter.month) {
    const m = filter.month; // YYYY-MM
    claims = claims.filter((c) =>
      c.expected_pay_date ? c.expected_pay_date.startsWith(m) : false,
    );
  }
  if (filter.keyword) {
    const q = filter.keyword.trim().toLowerCase();
    claims = claims.filter(
      (c) =>
        c.claim_no.toLowerCase().includes(q) ||
        (c.ro_no ?? "").toLowerCase().includes(q) ||
        c.item_label.toLowerCase().includes(q),
    );
  }

  const warrantyTypes = Array.from(
    new Set(
      allClaims
        .map((c) => c.warranty_type)
        .filter((x): x is string => Boolean(x)),
    ),
  ).sort();

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);

  return {
    config: (cfgRes.data ?? null) as CostRecoveryConfigRow | null,
    claims,
    stats,
    warrantyTypes,
    canEdit,
  };
}

export async function updateCostRecoveryConfig(
  patch: CostRecoveryConfigPatch,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const allowed: (keyof CostRecoveryConfigPatch)[] = [
    "remind_7_days_before",
    "alert_on_overdue",
    "auto_settle_cost",
    "sync_finance_system",
    "monthly_report_auto",
    "monthly_report_to_manager",
  ];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in patch) safe[k as string] = patch[k];
  }
  if (Object.keys(safe).length === 0) {
    return { ok: false, error: "沒有可更新的欄位" };
  }
  // 確保 row 存在；缺則 insert defaults
  const exists = await supabase
    .from("parts_warranty_cost_recovery_config")
    .select("brand_id")
    .eq("brand_id", brand)
    .maybeSingle();
  if (exists.error) return { ok: false, error: exists.error.message };
  if (!exists.data) {
    const ins = await supabase
      .from("parts_warranty_cost_recovery_config")
      .insert({ brand_id: brand, ...safe });
    if (ins.error)
      return { ok: false, error: `建立設定失敗：${ins.error.message}` };
  } else {
    const { error } = await supabase
      .from("parts_warranty_cost_recovery_config")
      .update(safe)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  }
  revalidatePath(COST_RECOVERY_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function markClaimPaid(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const existing = await supabase
    .from("parts_warranty_claims")
    .select("status, expected_pay_date")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };
  if (!existing.data) return { ok: false, error: "找不到此索賠單" };
  if (existing.data.status === "paid")
    return { ok: false, error: "此單已標記為已收款" };
  if (existing.data.status !== "approved")
    return { ok: false, error: "僅核准的索賠單可標記收款" };

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("parts_warranty_claims")
    .update({
      status: "paid",
      status_label: "已收款",
      expected_pay_date: existing.data.expected_pay_date ?? today,
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `標記失敗：${error.message}` };

  // TODO（POC 後）：如果 config.auto_settle_cost on → 推暫估成本沖銷
  // TODO（POC 後）：如果 config.sync_finance_system on → push 財務模組

  revalidatePath(COST_RECOVERY_PATH);
  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────────────────────
// 11.1 索賠流程說明（flow config / steps / claim types / timing rules）
// ────────────────────────────────────────────────────────────────────────────

const FLOW_PATH = "/parts/warranty/flow";

export type FlowConfigRow = Tables["parts_warranty_flow_config"]["Row"];
export type FlowStepRow = Tables["parts_warranty_flow_steps"]["Row"];
export type ClaimTypeRow = Tables["parts_warranty_claim_types"]["Row"];
export type TimingRuleRow = Tables["parts_warranty_timing_rules"]["Row"];

export type TimingRuleWithType = TimingRuleRow & {
  claim_type_code: string;
  claim_type_label: string;
};

async function ensureFlowConfig(brand: string): Promise<FlowConfigRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_flow_config")
    .select("*")
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const ins = await supabase
    .from("parts_warranty_flow_config")
    .insert({ brand_id: brand })
    .select("*")
    .single();
  if (ins.error) throw ins.error;
  return ins.data;
}

export async function getWarrantyFlowPageData(): Promise<{
  config: FlowConfigRow;
  steps: FlowStepRow[];
  claimTypes: ClaimTypeRow[];
  timingRules: TimingRuleWithType[];
  canEdit: boolean;
}> {
  const brand = (await getActiveScope()).brand_id;
  const config = await ensureFlowConfig(brand);

  const supabase = await createClient();
  const [stepsRes, typesRes, timingRes] = await Promise.all([
    supabase
      .from("parts_warranty_flow_steps")
      .select("*")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true }),
    supabase
      .from("parts_warranty_claim_types")
      .select("*")
      .eq("brand_id", brand)
      .order("sort_order", { ascending: true }),
    supabase
      .from("parts_warranty_timing_rules")
      .select("*")
      .eq("brand_id", brand),
  ]);
  if (stepsRes.error) throw stepsRes.error;
  if (typesRes.error) throw typesRes.error;
  if (timingRes.error) throw timingRes.error;

  const typeMap = new Map<string, ClaimTypeRow>();
  for (const t of typesRes.data ?? []) typeMap.set(t.id, t);

  const timingRules: TimingRuleWithType[] = (timingRes.data ?? []).map((tr) => {
    const tp = typeMap.get(tr.claim_type_id);
    return {
      ...tr,
      claim_type_code: tp?.code ?? "—",
      claim_type_label: tp?.label ?? "—",
    };
  });
  // 依 claim_type sort_order 排序
  timingRules.sort((a, b) => {
    const ta = typeMap.get(a.claim_type_id);
    const tb = typeMap.get(b.claim_type_id);
    return (ta?.sort_order ?? 0) - (tb?.sort_order ?? 0);
  });

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);

  return {
    config,
    steps: (stepsRes.data ?? []) as FlowStepRow[],
    claimTypes: (typesRes.data ?? []) as ClaimTypeRow[],
    timingRules,
    canEdit,
  };
}

// ── Config（Banner）──
export type FlowConfigPatch = {
  banner_text?: string;
  banner_enabled?: boolean;
};

export async function updateWarrantyFlowConfig(
  patch: FlowConfigPatch,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  await ensureFlowConfig(brand);
  const supabase = await createClient();
  const safe: Record<string, unknown> = {};
  if (patch.banner_text !== undefined) safe.banner_text = patch.banner_text;
  if (patch.banner_enabled !== undefined)
    safe.banner_enabled = patch.banner_enabled;
  if (Object.keys(safe).length === 0)
    return { ok: false, error: "沒有可更新的欄位" };
  safe.updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("parts_warranty_flow_config")
    .update(safe)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { brand_id: brand } };
}

// ── Steps ──
export type FlowStepInput = {
  step_no: number;
  title: string;
  description: string;
  is_terminal: boolean;
};

export async function createFlowStep(
  input: FlowStepInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const title = input.title.trim();
  if (!title) return { ok: false, error: "步驟標題不可為空" };
  if (!Number.isInteger(input.step_no) || input.step_no <= 0)
    return { ok: false, error: "步驟編號需為正整數" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_flow_steps")
    .insert({
      brand_id: brand,
      step_no: input.step_no,
      title,
      description: input.description.trim(),
      is_terminal: input.is_terminal,
      sort_order: input.step_no,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "步驟編號已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateFlowStep(
  id: string,
  patch: Partial<FlowStepInput> & { is_active?: boolean },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const safe: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "步驟標題不可為空" };
    safe.title = t;
  }
  if (patch.description !== undefined)
    safe.description = patch.description.trim();
  if (patch.is_terminal !== undefined) safe.is_terminal = patch.is_terminal;
  if (patch.is_active !== undefined) safe.is_active = patch.is_active;
  if (patch.step_no !== undefined) {
    if (!Number.isInteger(patch.step_no) || patch.step_no <= 0)
      return { ok: false, error: "步驟編號需為正整數" };
    safe.step_no = patch.step_no;
    safe.sort_order = patch.step_no;
  }
  if (Object.keys(safe).length === 0)
    return { ok: false, error: "沒有可更新的欄位" };
  safe.updated_at = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_flow_steps")
    .update(safe)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "步驟編號已存在" };
    return { ok: false, error: `更新失敗：${error.message}` };
  }
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id } };
}

export async function deleteFlowStep(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_flow_steps")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id } };
}

// ── Claim Types ──
export type ClaimTypeInput = {
  code: string;
  label: string;
  icon: string;
  description: string;
  accent: string;
};

export async function createClaimType(
  input: ClaimTypeInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const code = input.code.trim().toUpperCase();
  const label = input.label.trim();
  if (!code) return { ok: false, error: "代碼不可為空" };
  if (!label) return { ok: false, error: "名稱不可為空" };
  const supabase = await createClient();
  // 找最大 sort_order
  const { data: maxRow } = await supabase
    .from("parts_warranty_claim_types")
    .select("sort_order")
    .eq("brand_id", brand)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from("parts_warranty_claim_types")
    .insert({
      brand_id: brand,
      code,
      label,
      icon: input.icon.trim() || "🛡",
      description: input.description.trim(),
      accent: input.accent.trim() || "navy",
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "類型代碼已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateClaimType(
  id: string,
  patch: Partial<ClaimTypeInput> & { is_active?: boolean },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const safe: Record<string, unknown> = {};
  if (patch.code !== undefined) {
    const c = patch.code.trim().toUpperCase();
    if (!c) return { ok: false, error: "代碼不可為空" };
    safe.code = c;
  }
  if (patch.label !== undefined) {
    const l = patch.label.trim();
    if (!l) return { ok: false, error: "名稱不可為空" };
    safe.label = l;
  }
  if (patch.icon !== undefined) safe.icon = patch.icon.trim() || "🛡";
  if (patch.description !== undefined)
    safe.description = patch.description.trim();
  if (patch.accent !== undefined) safe.accent = patch.accent.trim() || "navy";
  if (patch.is_active !== undefined) safe.is_active = patch.is_active;
  if (Object.keys(safe).length === 0)
    return { ok: false, error: "沒有可更新的欄位" };
  safe.updated_at = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_claim_types")
    .update(safe)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "類型代碼已存在" };
    return { ok: false, error: `更新失敗：${error.message}` };
  }
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id } };
}

export async function deleteClaimType(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_claim_types")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id } };
}

// ── Timing Rules ──
export type TimingRuleInput = {
  claim_type_id: string;
  apply_window: string;
  storage_rule: string;
  close_goal_days: number;
};

export async function upsertTimingRule(
  input: TimingRuleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  if (!input.claim_type_id) return { ok: false, error: "索賠類型必選" };
  if (!Number.isInteger(input.close_goal_days) || input.close_goal_days < 0)
    return { ok: false, error: "結案目標天數需為非負整數" };
  const supabase = await createClient();
  const existing = await supabase
    .from("parts_warranty_timing_rules")
    .select("id")
    .eq("brand_id", brand)
    .eq("claim_type_id", input.claim_type_id)
    .maybeSingle();
  if (existing.error) return { ok: false, error: existing.error.message };

  if (existing.data) {
    const { error } = await supabase
      .from("parts_warranty_timing_rules")
      .update({
        apply_window: input.apply_window.trim(),
        storage_rule: input.storage_rule.trim(),
        close_goal_days: input.close_goal_days,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `更新失敗：${error.message}` };
    revalidatePath(FLOW_PATH);
    return { ok: true, data: { id: existing.data.id } };
  }
  const { data, error } = await supabase
    .from("parts_warranty_timing_rules")
    .insert({
      brand_id: brand,
      claim_type_id: input.claim_type_id,
      apply_window: input.apply_window.trim(),
      storage_rule: input.storage_rule.trim(),
      close_goal_days: input.close_goal_days,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteTimingRule(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_timing_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(FLOW_PATH);
  return { ok: true, data: { id } };
}

// ────────────────────────────────────────────────────────────────────────────
// 11.2 舊件出入庫邏輯設定（used-parts-flow）
//   - config 表：parts_warranty_used_parts_config（雙 brand 各 1 筆）
//   - items 表：parts_warranty_used_parts_items（在途追蹤）
// ────────────────────────────────────────────────────────────────────────────

const USED_PARTS_FLOW_PATH = "/parts/warranty/used-parts-flow";

export type UsedPartsConfigRow =
  Tables["parts_warranty_used_parts_config"]["Row"];
export type UsedPartItemRow =
  Tables["parts_warranty_used_parts_items"]["Row"];

export type UsedPartsConfigPatch = {
  trigger_auto_reserve?: boolean;
  trigger_scan_inbound?: boolean;
  trigger_manual_no_serial?: boolean;
  trigger_require_photo?: boolean;
  trigger_auto_barcode?: boolean;
  inbound_warehouse?: string;
  auto_update_claim?: boolean;
  auto_link_cost_recovery?: boolean;
};

export type UsedPartItemInput = {
  barcode: string;
  item_name: string;
  item_code?: string | null;
  ro_no?: string | null;
  inbound_date?: string | null;
  damage_level: string;
  damage_label?: string | null;
};

async function ensureUsedPartsConfig(
  brand: string,
): Promise<UsedPartsConfigRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_config")
    .select("*")
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const ins = await supabase
    .from("parts_warranty_used_parts_config")
    .insert({ brand_id: brand })
    .select("*")
    .single();
  if (ins.error) throw ins.error;
  return ins.data;
}

export async function getUsedPartsFlowPageData(): Promise<{
  config: UsedPartsConfigRow;
  items: UsedPartItemRow[];
  canEdit: boolean;
}> {
  const brand = (await getActiveScope()).brand_id;
  const config = await ensureUsedPartsConfig(brand);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_items")
    .select("*")
    .eq("brand_id", brand)
    .order("inbound_date", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  return {
    config,
    items: (data ?? []) as UsedPartItemRow[],
    canEdit,
  };
}

export async function updateUsedPartsFlowConfig(
  patch: UsedPartsConfigPatch,
): Promise<ActionResult<{ brand_id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  await ensureUsedPartsConfig(brand);
  const supabase = await createClient();
  const allowed: (keyof UsedPartsConfigPatch)[] = [
    "trigger_auto_reserve",
    "trigger_scan_inbound",
    "trigger_manual_no_serial",
    "trigger_require_photo",
    "trigger_auto_barcode",
    "inbound_warehouse",
    "auto_update_claim",
    "auto_link_cost_recovery",
  ];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in patch) safe[k as string] = patch[k];
  }
  if (Object.keys(safe).length === 0)
    return { ok: false, error: "沒有可更新的欄位" };
  safe.updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("parts_warranty_used_parts_config")
    .update(safe)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(USED_PARTS_FLOW_PATH);
  return { ok: true, data: { brand_id: brand } };
}

export async function createUsedPartItem(
  input: UsedPartItemInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const barcode = input.barcode.trim();
  const item_name = input.item_name.trim();
  if (!barcode) return { ok: false, error: "舊件條碼不可為空" };
  if (!item_name) return { ok: false, error: "品名不可為空" };
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("parts_warranty_used_parts_items")
    .select("sort_order")
    .eq("brand_id", brand)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;
  const { data, error } = await supabase
    .from("parts_warranty_used_parts_items")
    .insert({
      brand_id: brand,
      barcode,
      item_name,
      item_code: input.item_code?.trim() || null,
      ro_no: input.ro_no?.trim() || null,
      inbound_date: input.inbound_date || null,
      damage_level: input.damage_level,
      damage_label: input.damage_label?.trim() || null,
      status: "awaiting",
      status_label: "待原廠核准",
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "舊件條碼已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(USED_PARTS_FLOW_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateUsedPartItem(
  id: string,
  patch: Partial<UsedPartItemInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const safe: Record<string, unknown> = {};
  if (patch.barcode !== undefined) {
    const b = patch.barcode.trim();
    if (!b) return { ok: false, error: "舊件條碼不可為空" };
    safe.barcode = b;
  }
  if (patch.item_name !== undefined) {
    const n = patch.item_name.trim();
    if (!n) return { ok: false, error: "品名不可為空" };
    safe.item_name = n;
  }
  if (patch.item_code !== undefined)
    safe.item_code = patch.item_code?.trim() || null;
  if (patch.ro_no !== undefined) safe.ro_no = patch.ro_no?.trim() || null;
  if (patch.inbound_date !== undefined) safe.inbound_date = patch.inbound_date;
  if (patch.damage_level !== undefined) safe.damage_level = patch.damage_level;
  if (patch.damage_label !== undefined)
    safe.damage_label = patch.damage_label?.trim() || null;
  if (Object.keys(safe).length === 0)
    return { ok: false, error: "沒有可更新的欄位" };
  safe.updated_at = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_items")
    .update(safe)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "舊件條碼已存在" };
    return { ok: false, error: `更新失敗：${error.message}` };
  }
  revalidatePath(USED_PARTS_FLOW_PATH);
  return { ok: true, data: { id } };
}

export async function setUsedPartItemStatus(
  id: string,
  status: string,
  status_label: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_items")
    .update({
      status,
      status_label,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(USED_PARTS_FLOW_PATH);
  return { ok: true, data: { id } };
}

export async function deleteUsedPartItem(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const brand = (await getActiveScope()).brand_id;
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_warranty_used_parts_items")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(USED_PARTS_FLOW_PATH);
  return { ok: true, data: { id } };
}
