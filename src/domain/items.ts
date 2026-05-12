"use server";

/**
 * Domain Helper — Items / SKUs（商品多維度料號）
 *
 * 提供：findItemBySku(code) — 跨 sku_type 查料號 → 回傳 item + 所有相關 skus
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ItemRow = Tables["items"]["Row"];
export type ItemSkuRow = Tables["item_skus"]["Row"];

export type ItemWithSkus = ItemRow & {
  skus: ItemSkuRow[];
};

/**
 * 多維度查料號：依 sku_type 過濾或全部，找到第一筆 match 的 sku_code → 回該 item 的全套 SKUs
 */
export async function findItemBySku(
  code: string,
  options: { sku_type?: string } = {},
): Promise<ItemWithSkus | null> {
  if (!code.trim()) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("item_skus")
    .select("item_id")
    .eq("brand_id", scope.brand_id)
    .ilike("sku_code", code.trim())
    .limit(1);
  if (options.sku_type) q = q.eq("sku_type", options.sku_type);

  const { data: matched, error } = await q;
  if (error) throw error;

  let itemId: string | null = matched?.[0]?.item_id ?? null;

  // 若用 sku 沒撈到、再試直接用 items.code
  if (!itemId) {
    const { data: itemDirect, error: iErr } = await supabase
      .from("items")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .ilike("code", code.trim())
      .limit(1);
    if (iErr) throw iErr;
    itemId = itemDirect?.[0]?.id ?? null;
  }
  if (!itemId) return null;

  const [itemRes, skusRes] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).single(),
    supabase
      .from("item_skus")
      .select("*")
      .eq("item_id", itemId)
      .order("is_primary", { ascending: false })
      .order("sku_type"),
  ]);
  if (itemRes.error) throw itemRes.error;
  if (skusRes.error) throw skusRes.error;
  return {
    ...(itemRes.data as ItemRow),
    skus: (skusRes.data ?? []) as ItemSkuRow[],
  };
}

export async function getItemsInfoPageData(query: {
  q?: string;
  sku_type?: string;
}): Promise<{
  result: ItemWithSkus | null;
  searched: boolean;
  canEdit: boolean;
}> {
  const [result, canEdit] = await Promise.all([
    query.q ? findItemBySku(query.q, { sku_type: query.sku_type }) : Promise.resolve(null),
    hasPermission(PERMISSIONS.ITEM_EDIT),
  ]);
  return { result, searched: !!query.q, canEdit };
}

/**
 * GL 科目（Chart of Accounts）下拉選項——只回 leaf-level 可入帳且啟用的。
 * 用於 items 詳情頁「會計」tab 的 inline select。
 *
 * 注意：chart_of_accounts 用 tenant_id（groups.tenant_uuid），不是 brand_id；
 * brand 是行銷虛軸，COA 屬於法人/集團層的 master data。
 */
export type CoaAccountOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

export async function listPostableAccountsForItem(): Promise<CoaAccountOption[]> {
  const supabase = await createClient();

  // 撈 default tenant uuid（同 src/lib/accounting/queries.ts#getDefaultTenantUuid）
  const { data: g, error: gErr } = await supabase
    .from("groups")
    .select("tenant_uuid")
    .eq("id", "default")
    .single();
  if (gErr || !g) return [];
  const tenant = g.tenant_uuid as string;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .eq("tenant_id", tenant)
    .eq("is_postable", true)
    .eq("is_active", true)
    .order("account_code", { ascending: true });
  if (error) return [];
  return (data ?? []) as CoaAccountOption[];
}

export type ItemGlAccount = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

/**
 * 撈 item 三個 GL FK 對應的 (code, name) 顯示資料。
 * 若某欄為 null 則對應 key 為 null。
 */
export async function getItemGlAccounts(item: {
  gl_inventory_coa_id: string | null;
  gl_cogs_coa_id: string | null;
  gl_revenue_coa_id: string | null;
  gl_expense_coa_id: string | null;
}): Promise<{
  inventory: ItemGlAccount | null;
  cogs: ItemGlAccount | null;
  revenue: ItemGlAccount | null;
  expense: ItemGlAccount | null;
}> {
  const ids = [
    item.gl_inventory_coa_id,
    item.gl_cogs_coa_id,
    item.gl_revenue_coa_id,
    item.gl_expense_coa_id,
  ].filter((x): x is string => !!x);

  if (ids.length === 0) {
    return { inventory: null, cogs: null, revenue: null, expense: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .in("id", ids);
  if (error) return { inventory: null, cogs: null, revenue: null, expense: null };

  const map = new Map(
    (data ?? []).map((c) => [
      c.id as string,
      {
        id: c.id as string,
        account_code: c.account_code as string,
        name_zh_tw: c.name_zh_tw as string,
      },
    ]),
  );
  return {
    inventory: item.gl_inventory_coa_id ? map.get(item.gl_inventory_coa_id) ?? null : null,
    cogs: item.gl_cogs_coa_id ? map.get(item.gl_cogs_coa_id) ?? null : null,
    revenue: item.gl_revenue_coa_id ? map.get(item.gl_revenue_coa_id) ?? null : null,
    expense: item.gl_expense_coa_id ? map.get(item.gl_expense_coa_id) ?? null : null,
  };
}

export type TaxCodeOption = {
  id: string;
  tax_code: string;
  name_zh_tw: string;
  rate: number;
  direction: string;
};

export async function listTaxCodes(): Promise<TaxCodeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_codes")
    .select("id, tax_code, name_zh_tw, rate, direction")
    .eq("is_active", true)
    .order("tax_code");
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tax_code: r.tax_code as string,
    name_zh_tw: r.name_zh_tw as string,
    rate: Number(r.rate),
    direction: r.direction as string,
  }));
}

/**
 * 料號預設前置時間頁 (/admin/master-data/item-lead-times) 用的列表 helper：
 * 撈啟用中料號 + 拼上預設供應商名稱，欄位精簡到 UI 需要的子集。
 */
export type LeadTimeRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  default_supplier_name: string | null;
  default_lead_time_days: number | null;
};

export async function listItemsWithLeadTime(): Promise<LeadTimeRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemsRes, supRes] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, code, name, category, default_supplier_id, default_lead_time_days, is_active",
      )
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("brand_id", brand),
  ]);
  if (itemsRes.error) throw new Error(`listItemsWithLeadTime/items: ${itemsRes.error.message}`);
  if (supRes.error) throw new Error(`listItemsWithLeadTime/suppliers: ${supRes.error.message}`);

  const supMap = new Map(
    ((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );
  return ((itemsRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    category: string | null;
    default_supplier_id: string | null;
    default_lead_time_days: number | null;
  }>).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    default_supplier_name: r.default_supplier_id
      ? supMap.get(r.default_supplier_id) ?? null
      : null,
    default_lead_time_days: r.default_lead_time_days,
  }));
}

// ─────────────────────────── Items list page（/parts/setup/items） ───────────────────────────

import type {
  ItemRow as ItemsBoardRow,
  SupplierOption,
} from "@/app/(workspace)/parts/setup/items/_components/items-board";
import { listDictionaries } from "@/domain/dictionaries";

export type ItemFilters = {
  category: string;
  control: string;
  status: string;
  q: string;
};

export interface ItemsListPageData {
  rows: ItemsBoardRow[];
  suppliers: SupplierOption[];
  totalCount: number;
  categories: string[];
  uoms: string[];
  controlLevels: Array<{ code: string; label: string; accent: string | null }>;
}

export async function getItemsListPageData(filters: ItemFilters): Promise<ItemsListPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("items")
    .select(
      "id, code, name, spec_description, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, serial_tracking_required, batch_tracking_required, image_url, is_active",
    )
    .eq("brand_id", brand);

  if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
  if (filters.control && filters.control !== "all") q = q.eq("control_type", filters.control);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`code.ilike.%${t}%,name.ilike.%${t}%`);
  }

  const [iRes, sRes, compatRes, totalRes, dictRows] = await Promise.all([
    q.order("code").limit(500),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("item_vehicle_compatibility")
      .select("item_id")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand),
    listDictionaries(),
  ]);

  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  if (compatRes.error) throw new Error(`compat: ${compatRes.error.message}`);

  const fitMap = new Map<string, number>();
  for (const c of compatRes.data ?? []) {
    fitMap.set(c.item_id as string, (fitMap.get(c.item_id as string) ?? 0) + 1);
  }
  const rows: ItemsBoardRow[] = ((iRes.data ?? []) as unknown as ItemsBoardRow[]).map((r) => ({
    ...r,
    fit_count: fitMap.get(r.id) ?? 0,
  }));

  const activeDict = dictRows.filter((d) => d.is_active);
  const categories = activeDict.filter((d) => d.kind === "category").map((d) => d.code);
  const uoms = activeDict.filter((d) => d.kind === "uom").map((d) => d.code);
  const controlLevels = activeDict
    .filter((d) => d.kind === "control_level")
    .map((d) => ({ code: d.code, label: d.label, accent: d.accent_color }));

  return {
    rows,
    suppliers: (sRes.data ?? []) as unknown as SupplierOption[],
    totalCount: totalRes.count ?? 0,
    categories,
    uoms,
    controlLevels,
  };
}

// ─────────────────────────── Item detail page（/parts/setup/items/[id]） ───────────────────────────

import type {
  DetailItem,
  StockLot,
  WarehouseRef,
  FitmentRow,
  ModelRef,
  SupplierRef,
  ControlLevelOption,
  WorkOrderLine,
  StorePriceRow,
  OrgRef,
} from "@/app/(workspace)/parts/setup/items/[id]/_components/item-detail-view";
import { listItemStorePrices } from "@/domain/pricing";

export interface ItemDetailPageData {
  item: DetailItem;
  stocks: StockLot[];
  warehouses: WarehouseRef[];
  fitments: FitmentRow[];
  supplier: SupplierRef | null;
  allSuppliers: SupplierRef[];
  models: ModelRef[];
  categories: string[];
  uoms: string[];
  controlLevels: ControlLevelOption[];
  woLines: WorkOrderLine[];
  storePrices: StorePriceRow[];
  storePricesWithStores: Awaited<ReturnType<typeof listItemStorePrices>>;
  orgs: OrgRef[];
  glAccounts: Awaited<ReturnType<typeof getItemGlAccounts>>;
  accountOptions: Awaited<ReturnType<typeof listPostableAccountsForItem>>;
  taxCode: TaxCodeOption | null;
  taxCodeOptions: TaxCodeOption[];
}

export async function getItemDetailPageData(id: string): Promise<ItemDetailPageData | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select(
      "id, code, name, name_en, spec_description, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, serial_tracking_required, batch_tracking_required, is_active, created_at, updated_at, synced_at, gl_inventory_coa_id, gl_cogs_coa_id, gl_revenue_coa_id, gl_expense_coa_id, default_tax_code_id, external_source, external_id, weight_kg, volume_cm3, image_url, image_display_height",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (itemErr || !item) return null;
  const detail = item as unknown as DetailItem;

  const [
    stockRes,
    whRes,
    fitRes,
    supRes,
    dictRows,
    allSupRes,
    woRes,
    storeRes,
    orgRes,
  ] = await Promise.all([
    supabase
      .from("stock_items")
      .select(
        "id, warehouse_id, qty, unit_cost, serial_no, batch_no, status, last_movement_at, warranty_start, warranty_end, notes",
      )
      .eq("brand_id", brand)
      .eq("item_id", id)
      .order("last_movement_at", { ascending: false })
      .limit(200),
    supabase.from("warehouses").select("id, code, name").eq("brand_id", brand),
    supabase
      .from("item_vehicle_compatibility")
      .select("vehicle_model_id, year_start, year_end, is_verified")
      .eq("brand_id", brand)
      .eq("item_id", id),
    detail.default_supplier_id
      ? supabase
          .from("suppliers")
          .select("id, code, name")
          .eq("id", detail.default_supplier_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    listDictionaries(),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("work_order_items")
      .select(
        "id, work_order_id, line_no, kind, qty, unit_price, amount, is_warranty, created_at, work_orders ( ro_no, status, opened_at )",
      )
      .eq("brand_id", brand)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("item_store_prices")
      .select(
        "id, org_id, price, pricing_type, is_active, promo_start_date, promo_end_date, notes",
      )
      .eq("brand_id", brand)
      .eq("item_id", id)
      .order("price", { ascending: false }),
    supabase.from("organizations").select("id, code, name, type").eq("brand_id", brand),
  ]);

  const storePricesWithStores = await listItemStorePrices(id);

  const [glAccounts, accountOptions, taxCodeOptions] = await Promise.all([
    getItemGlAccounts({
      gl_inventory_coa_id: detail.gl_inventory_coa_id,
      gl_cogs_coa_id: detail.gl_cogs_coa_id,
      gl_revenue_coa_id: detail.gl_revenue_coa_id,
      gl_expense_coa_id: detail.gl_expense_coa_id,
    }),
    listPostableAccountsForItem(),
    listTaxCodes(),
  ]);
  const taxCode = detail.default_tax_code_id
    ? taxCodeOptions.find((t) => t.id === detail.default_tax_code_id) ?? null
    : null;

  const stocks = (stockRes.data ?? []) as unknown as StockLot[];
  const warehouses = (whRes.data ?? []) as unknown as WarehouseRef[];
  const fitments = (fitRes.data ?? []) as unknown as FitmentRow[];
  const supplier = (supRes.data ?? null) as unknown as SupplierRef | null;
  const allSuppliers = (allSupRes.data ?? []) as unknown as SupplierRef[];
  const activeDict = dictRows.filter((d) => d.is_active);
  const orgs = (orgRes.data ?? []) as unknown as OrgRef[];
  const woLines = (woRes.data ?? []) as unknown as WorkOrderLine[];
  const storePrices = (storeRes.data ?? []) as unknown as StorePriceRow[];

  let models: ModelRef[] = [];
  const modelIds = Array.from(new Set(fitments.map((f) => f.vehicle_model_id)));
  if (modelIds.length > 0) {
    const { data: mData } = await supabase
      .from("vehicle_models")
      .select("id, name")
      .in("id", modelIds);
    models = (mData ?? []) as unknown as ModelRef[];
  }

  const categories = activeDict.filter((d) => d.kind === "category").map((d) => d.code);
  const uoms = activeDict.filter((d) => d.kind === "uom").map((d) => d.code);
  const controlLevels: ControlLevelOption[] = activeDict
    .filter((d) => d.kind === "control_level")
    .map((d) => ({ code: d.code, label: d.label, accent: d.accent_color }));

  return {
    item: detail,
    stocks,
    warehouses,
    fitments,
    supplier,
    allSuppliers,
    models,
    categories,
    uoms,
    controlLevels,
    woLines,
    storePrices,
    storePricesWithStores,
    orgs,
    glAccounts,
    accountOptions,
    taxCode,
    taxCodeOptions,
  };
}

// ─────────────────────────── Item label page（/parts/setup/items/[id]/label） ───────────────────────────

export interface ItemLabelData {
  code: string;
  name: string;
  spec_description: string | null;
  category: string | null;
  control_type: string | null;
  base_uom: string | null;
  suggested_price: number | null;
  suppliers: { name: string } | null;
}

export async function getItemLabelData(id: string): Promise<ItemLabelData | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("items")
    .select(
      "code, name, spec_description, category, control_type, base_uom, suggested_price, default_supplier_id, suppliers:default_supplier_id ( name )",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (error || !data) return null;
  return data as unknown as ItemLabelData;
}
