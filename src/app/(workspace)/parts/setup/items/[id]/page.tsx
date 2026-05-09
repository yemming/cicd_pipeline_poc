import { notFound, redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  ItemDetailView,
  type DetailItem,
  type StockLot,
  type WarehouseRef,
  type FitmentRow,
  type ModelRef,
  type SupplierRef,
  type ControlLevelOption,
  type WorkOrderLine,
  type StorePriceRow,
  type OrgRef,
} from "./_components/item-detail-view";

export const dynamic = "force-dynamic";

async function loadDetail(id: string) {
  const supabase = await createClient();
  const brand = getBrandKey();

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select(
      "id, code, name, name_en, spec_description, category, control_type, base_uom, standard_cost, suggested_price, warranty_months, shelf_life_months, default_supplier_id, serial_tracking_required, batch_tracking_required, is_active, created_at, updated_at, synced_at, gl_inventory_account_id, gl_cogs_account_id, gl_revenue_account_id, external_source, external_id, weight_kg, volume_cm3, image_url, image_display_height",
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
    dictRes,
    allSupRes,
    woRes,
    storeRes,
    orgRes,
  ] = await Promise.all([
    supabase
      .from("stock_items")
      .select(
        "warehouse_id, qty, unit_cost, serial_no, batch_no, status, last_movement_at, warranty_start, warranty_end",
      )
      .eq("brand_id", brand)
      .eq("item_id", id)
      .order("last_movement_at", { ascending: false })
      .limit(200),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", brand),
    supabase
      .from("item_motorcycle_compatibility")
      .select("motorcycle_model_id, year_start, year_end, is_verified")
      .eq("brand_id", brand)
      .eq("item_id", id),
    detail.default_supplier_id
      ? supabase
          .from("suppliers")
          .select("id, code, name")
          .eq("id", detail.default_supplier_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("parts_dictionary")
      .select("kind, code, label, accent_color")
      .eq("brand_id", brand)
      .eq("is_active", true),
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
      .select("id, org_id, price, pricing_type, is_active, promo_start_date, promo_end_date, notes")
      .eq("brand_id", brand)
      .eq("item_id", id)
      .order("price", { ascending: false }),
    supabase
      .from("organizations")
      .select("id, code, name, type")
      .eq("brand_id", brand),
  ]);

  const stocks = (stockRes.data ?? []) as unknown as StockLot[];
  const warehouses = (whRes.data ?? []) as unknown as WarehouseRef[];
  const fitments = (fitRes.data ?? []) as unknown as FitmentRow[];
  const supplier = (supRes.data ?? null) as unknown as SupplierRef | null;
  const allSuppliers = (allSupRes.data ?? []) as unknown as SupplierRef[];
  const dictRows = (dictRes.data ?? []) as unknown as Array<{
    kind: string;
    code: string;
    label: string;
    accent_color: string | null;
  }>;
  const orgs = (orgRes.data ?? []) as unknown as OrgRef[];
  const woLines = (woRes.data ?? []) as unknown as WorkOrderLine[];
  const storePrices = (storeRes.data ?? []) as unknown as StorePriceRow[];

  let models: ModelRef[] = [];
  const modelIds = Array.from(new Set(fitments.map((f) => f.motorcycle_model_id)));
  if (modelIds.length > 0) {
    const { data: mData } = await supabase
      .from("motorcycle_models")
      .select("id, name")
      .in("id", modelIds);
    models = (mData ?? []) as unknown as ModelRef[];
  }

  const categories = dictRows.filter((d) => d.kind === "category").map((d) => d.code);
  const uoms = dictRows.filter((d) => d.kind === "uom").map((d) => d.code);
  const controlLevels: ControlLevelOption[] = dictRows
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
    orgs,
  };
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品基礎資料的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const data = await loadDetail(id);
  if (!data) notFound();
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);

  return <ItemDetailView {...data} canEdit={canEdit} />;
}
