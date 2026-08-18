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

// ─────────── 料號前置時間 detail page（/admin/master-data/item-lead-times/[id]） ───────────

/**
 * 料號前置時間 detail view 用的單筆資料。
 *
 * 這張「主檔」是 items 的 MRP 子視角：核心欄位唯讀顯示，可編輯的只有
 * default_lead_time_days（MRP fallback 前置時間）與 default_supplier_id（預設供應商）。
 * 完整商品維護仍在 /parts/setup/items/[id]。
 */
export type ItemLeadTimeDetail = {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  category: string | null;
  control_type: string;
  base_uom: string;
  spec_description: string | null;
  standard_cost: number | null;
  suggested_price: number | null;
  warranty_months: number | null;
  shelf_life_months: number | null;
  is_active: boolean;
  default_supplier_id: string | null;
  default_supplier_name: string | null;
  default_lead_time_days: number | null;
  created_at: string;
  updated_at: string;
};

export type SupplierLeadTimeOption = {
  id: string;
  code: string;
  name: string;
};

/** 本 brand 啟用中供應商清單（detail / new 頁「預設供應商」下拉用）。 */
export async function listSupplierOptionsForLeadTime(): Promise<SupplierLeadTimeOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, code, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code");
  if (error) return [];
  return (data ?? []) as SupplierLeadTimeOption[];
}

/** 單筆料號（含預設供應商名稱）給前置時間 detail 頁。 */
export async function getItemLeadTimeById(
  id: string,
): Promise<ItemLeadTimeDetail | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, code, name, name_en, category, control_type, base_uom, spec_description, standard_cost, suggested_price, warranty_months, shelf_life_months, is_active, default_supplier_id, default_lead_time_days, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (error || !data) return null;

  const row = data as unknown as Omit<ItemLeadTimeDetail, "default_supplier_name">;

  let default_supplier_name: string | null = null;
  if (row.default_supplier_id) {
    const { data: sup } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", row.default_supplier_id)
      .single();
    default_supplier_name = (sup?.name as string | undefined) ?? null;
  }

  return { ...row, default_supplier_name };
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
  page: number;
  categories: string[];
  uoms: string[];
  controlLevels: Array<{ code: string; label: string; accent: string | null }>;
}

// 注意：本檔為 "use server" Server Actions 檔，只能 export async function，
// 不能 export const/interface 以外的 runtime 值（會讓 Turbopack production build 整檔炸掉）。
const ITEMS_PAGE_SIZE_DEFAULT = 50;

export async function getItemsListPageData(
  filters: ItemFilters,
  options: { page?: number; pageSize?: number } = {},
): Promise<ItemsListPageData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? ITEMS_PAGE_SIZE_DEFAULT);

  const itemsBaseFilters = "id, code, name, spec_description, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, serial_tracking_required, batch_tracking_required, image_url, is_active";

  let countQ = supabase.from("items").select("id", { count: "exact", head: true }).eq("brand_id", brand);
  if (filters.category && filters.category !== "all") countQ = countQ.eq("category", filters.category);
  if (filters.control && filters.control !== "all") countQ = countQ.eq("control_type", filters.control);
  if (filters.status === "active") countQ = countQ.eq("is_active", true);
  if (filters.status === "inactive") countQ = countQ.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    countQ = countQ.or(`code.ilike.%${t}%,name.ilike.%${t}%`);
  }
  const countRes = await countQ;
  if (countRes.error) throw new Error(`items count: ${countRes.error.message}`);
  const totalCount = countRes.count ?? 0;

  // range() 若 from 超過實際筆數會丟 416 Requested range not satisfiable，
  // 所以先用 head-count 夾住合法頁碼範圍，避免使用者手動改 URL page 參數或篩選後筆數變少時整頁 500。
  const maxPage = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;
  const safePage = Math.min(page, maxPage);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from("items").select(itemsBaseFilters).eq("brand_id", brand);
  if (filters.category && filters.category !== "all") q = q.eq("category", filters.category);
  if (filters.control && filters.control !== "all") q = q.eq("control_type", filters.control);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`code.ilike.%${t}%,name.ilike.%${t}%`);
  }

  const [iRes, sRes, dictRows] = await Promise.all([
    totalCount > 0
      ? q.order("code").range(from, to)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    listDictionaries(),
  ]);

  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);

  // fit_count 只對「本頁顯示的 item_id」查 compat 表，不整表撈取
  const pageItemIds = (iRes.data ?? []).map((r) => (r as { id: string }).id);
  const compatRes = pageItemIds.length
    ? await supabase
        .from("item_vehicle_compatibility")
        .select("item_id")
        .eq("brand_id", brand)
        .in("item_id", pageItemIds)
    : { data: [] as Array<{ item_id: string }>, error: null };
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
    totalCount,
    page: safePage,
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

/**
 * 商品資訊 (items-info) 頂部 KPI 條：當前 brand 的多維度料號統計。
 *
 * 五個指標：
 * - totalItems：本 brand 啟用中商品數
 * - skuCount：所有維度料號筆數
 * - itemsWithSku：已建立至少 1 筆 SKU 的商品數
 * - itemsMissingSku：啟用中但 0 筆 SKU 的商品數（需補維度）
 * - alternateCount：替代 / 供應商料號筆數（業務避坑指標）
 */
export type ItemsInfoKpis = {
  totalItems: number;
  itemsWithSku: number;
  itemsMissingSku: number;
  skuCount: number;
  alternateCount: number;
  supplierCount: number;
  barcodeCount: number;
  byType: { sku_type: string; count: number }[];
};

export async function getItemsInfoKpis(): Promise<ItemsInfoKpis> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemsRes, skusRes] = await Promise.all([
    supabase
      .from("items")
      .select("id")
      .eq("brand_id", brand)
      .eq("is_active", true),
    supabase
      .from("item_skus")
      .select("item_id, sku_type")
      .eq("brand_id", brand),
  ]);

  const items = (itemsRes.data ?? []) as { id: string }[];
  const skus = (skusRes.data ?? []) as { item_id: string; sku_type: string }[];

  const itemIdsWithSku = new Set(skus.map((s) => s.item_id));
  const byTypeMap = new Map<string, number>();
  for (const s of skus) {
    byTypeMap.set(s.sku_type, (byTypeMap.get(s.sku_type) ?? 0) + 1);
  }
  const byType = Array.from(byTypeMap.entries())
    .map(([sku_type, count]) => ({ sku_type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalItems: items.length,
    itemsWithSku: items.filter((it) => itemIdsWithSku.has(it.id)).length,
    itemsMissingSku: items.filter((it) => !itemIdsWithSku.has(it.id)).length,
    skuCount: skus.length,
    alternateCount: byTypeMap.get("alternate") ?? 0,
    supplierCount: byTypeMap.get("supplier") ?? 0,
    barcodeCount: byTypeMap.get("barcode") ?? 0,
    byType,
  };
}

/**
 * 已建立 SKU 的商品快覽（左欄列表用）— 最近異動排前面、最多 50 筆。
 *
 * 給商品資訊頁的「最近編輯 / Top 商品」面板用：使用者沒輸入查詢時也能直接點清單瀏覽。
 */
export type ItemsInfoListItem = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
  sku_count: number;
  has_primary: boolean;
  updated_at: string;
};

export async function listItemsInfoOverview(): Promise<ItemsInfoListItem[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemsRes, skusRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, category, control_type, updated_at")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("item_skus")
      .select("item_id, is_primary")
      .eq("brand_id", brand),
  ]);

  const skus = (skusRes.data ?? []) as { item_id: string; is_primary: boolean }[];
  const countMap = new Map<string, number>();
  const primaryMap = new Map<string, boolean>();
  for (const s of skus) {
    countMap.set(s.item_id, (countMap.get(s.item_id) ?? 0) + 1);
    if (s.is_primary) primaryMap.set(s.item_id, true);
  }

  return ((itemsRes.data ?? []) as {
    id: string;
    code: string;
    name: string;
    category: string | null;
    control_type: string | null;
    updated_at: string;
  }[]).map((it) => ({
    id: it.id,
    code: it.code,
    name: it.name,
    category: it.category,
    control_type: it.control_type,
    sku_count: countMap.get(it.id) ?? 0,
    has_primary: primaryMap.get(it.id) ?? false,
    updated_at: it.updated_at,
  }));
}

/**
 * 單一商品的多維度資訊（給管理 Modal 多 tab 用）。
 *
 * 一次撈：
 * - skus：所有維度料號（含 supplier_id ref）
 * - fitments：適配車型（含車型名稱 / 年份）
 * - supplierPricing：供應商定價（含 supplier name）
 * - suppliers：本 brand 所有供應商（給「新增供應商料號」的下拉用）
 * - vehicleModels：本 brand 所有車型（給「新增適配」的下拉用）
 */
export type ItemDimensionsFitment = {
  id: string;
  vehicle_model_id: string;
  vehicle_display: string;
  year_start: number | null;
  year_end: number | null;
  is_verified: boolean;
  notes: string | null;
};

export type ItemDimensionsSupplierPricing = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  is_primary: boolean;
  unit_price: number;
  currency: string;
  lead_time_days: number;
  min_order_qty: number;
  is_active: boolean;
};

export type ItemDimensionsSkuRow = ItemSkuRow & {
  supplier_name?: string | null;
};

export type ItemDimensions = {
  item: ItemRow;
  skus: ItemDimensionsSkuRow[];
  fitments: ItemDimensionsFitment[];
  supplierPricing: ItemDimensionsSupplierPricing[];
  suppliers: { id: string; code: string; name: string }[];
  vehicleModels: { id: string; series: string; model_name: string; display_name: string }[];
};

export async function getItemDimensions(itemId: string): Promise<ItemDimensions | null> {
  if (!itemId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemRes, skusRes, fitRes, pricingRes, supRes, modelRes] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).eq("brand_id", brand).single(),
    supabase
      .from("item_skus")
      .select("*, suppliers:supplier_id ( name )")
      .eq("item_id", itemId)
      .eq("brand_id", brand)
      .order("is_primary", { ascending: false })
      .order("sku_type"),
    supabase
      .from("item_vehicle_compatibility")
      .select(
        "id, vehicle_model_id, year_start, year_end, is_verified, notes, vehicle_models:vehicle_model_id ( display_name, series, model_name, year_start, year_end )",
      )
      .eq("item_id", itemId)
      .eq("brand_id", brand)
      .order("is_verified", { ascending: false }),
    supabase
      .from("supplier_item_pricing")
      .select(
        "id, supplier_id, is_primary, unit_price, currency, lead_time_days, min_order_qty, is_active, suppliers:supplier_id ( name )",
      )
      .eq("item_id", itemId)
      .eq("brand_id", brand)
      .order("is_primary", { ascending: false })
      .order("unit_price"),
    supabase.from("suppliers").select("id, code, name").eq("brand_id", brand).eq("is_active", true).order("code"),
    supabase
      .from("vehicle_models")
      .select("id, series, model_name, display_name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("series")
      .order("model_name"),
  ]);

  if (itemRes.error || !itemRes.data) return null;

  // supabase typed FK joins 會回成 array（即使語意上是 0..1）；統一用 unknown 中介轉型
  type SkuRowRaw = ItemSkuRow & { suppliers: { name: string }[] | { name: string } | null };
  type FitRowRaw = {
    id: string;
    vehicle_model_id: string;
    year_start: number | null;
    year_end: number | null;
    is_verified: boolean;
    notes: string | null;
    vehicle_models:
      | { display_name: string; year_start: number | null; year_end: number | null }[]
      | { display_name: string; year_start: number | null; year_end: number | null }
      | null;
  };
  type PricingRowRaw = {
    id: string;
    supplier_id: string;
    is_primary: boolean;
    unit_price: number;
    currency: string;
    lead_time_days: number;
    min_order_qty: number;
    is_active: boolean;
    suppliers: { name: string }[] | { name: string } | null;
  };

  function pickOne<T>(v: T[] | T | null | undefined): T | null {
    if (!v) return null;
    if (Array.isArray(v)) return v[0] ?? null;
    return v;
  }

  return {
    item: itemRes.data as ItemRow,
    skus: ((skusRes.data ?? []) as unknown as SkuRowRaw[]).map((s) => ({
      ...s,
      supplier_name: pickOne(s.suppliers)?.name ?? null,
    })),
    fitments: ((fitRes.data ?? []) as unknown as FitRowRaw[]).map((f) => {
      const m = pickOne(f.vehicle_models);
      return {
        id: f.id,
        vehicle_model_id: f.vehicle_model_id,
        vehicle_display: m?.display_name ?? "（已刪除）",
        year_start: f.year_start ?? m?.year_start ?? null,
        year_end: f.year_end ?? m?.year_end ?? null,
        is_verified: f.is_verified,
        notes: f.notes,
      };
    }),
    supplierPricing: ((pricingRes.data ?? []) as unknown as PricingRowRaw[]).map((p) => ({
      id: p.id,
      supplier_id: p.supplier_id,
      supplier_name: pickOne(p.suppliers)?.name ?? "（未知供應商）",
      is_primary: p.is_primary,
      unit_price: Number(p.unit_price),
      currency: p.currency,
      lead_time_days: p.lead_time_days,
      min_order_qty: Number(p.min_order_qty),
      is_active: p.is_active,
    })),
    suppliers: (supRes.data ?? []) as { id: string; code: string; name: string }[],
    vehicleModels: (modelRes.data ?? []) as {
      id: string;
      series: string;
      model_name: string;
      display_name: string;
    }[],
  };
}
