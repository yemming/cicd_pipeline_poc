import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  WarehouseArchBoard,
  type LayerMetaRow,
  type WarehouseSummary,
} from "./_components/warehouse-arch-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  layers: LayerMetaRow[];
  warehouses: WarehouseSummary[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [layersRes, whRes, zoneRes, binRes, slotRes, stockRes] = await Promise.all([
    supabase
      .from("parts_warehouse_layer_meta")
      .select(
        "id, layer_index, layer_title, layer_name, icon, description, badge_text, badge_color, accent_color, is_active",
      )
      .eq("brand_id", brand)
      .order("layer_index"),
    supabase
      .from("warehouses")
      .select("id, name, type, is_active")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("warehouse_zones")
      .select("id, warehouse_id")
      .eq("brand_id", brand),
    supabase
      .from("warehouse_bins")
      .select("id, warehouse_id, capacity")
      .eq("brand_id", brand),
    supabase
      .from("warehouse_slots")
      .select("id, warehouse_id, bin_id")
      .eq("brand_id", brand),
    supabase
      .from("stock_items")
      .select("warehouse_id, qty")
      .eq("brand_id", brand),
  ]);

  if (layersRes.error) throw new Error(`layers: ${layersRes.error.message}`);
  if (whRes.error) throw new Error(`warehouses: ${whRes.error.message}`);
  if (zoneRes.error) throw new Error(`zones: ${zoneRes.error.message}`);
  if (binRes.error) throw new Error(`bins: ${binRes.error.message}`);
  if (slotRes.error) throw new Error(`slots: ${slotRes.error.message}`);
  if (stockRes.error) throw new Error(`stock: ${stockRes.error.message}`);

  const layers: LayerMetaRow[] = (layersRes.data ?? []).map((l) => ({
    id: l.id as string,
    layer_index: l.layer_index as number,
    layer_title: l.layer_title as string,
    layer_name: l.layer_name as string,
    icon: (l.icon as string | null) ?? null,
    description: (l.description as string | null) ?? null,
    badge_text: (l.badge_text as string | null) ?? null,
    badge_color: (l.badge_color as string) ?? "navy",
    accent_color: (l.accent_color as string) ?? "navy",
    is_active: !!l.is_active,
  }));

  // 把 zone/bin/slot 計數依 warehouse_id 聚合
  const zoneByWh = new Map<string, number>();
  for (const z of zoneRes.data ?? [])
    zoneByWh.set(z.warehouse_id as string, (zoneByWh.get(z.warehouse_id as string) ?? 0) + 1);

  type BinRow = {
    warehouse_id: string;
    capacity?: number | null;
  };
  const binByWh = new Map<string, number>();
  const binCapByWh = new Map<string, number>(); // 容量總和（per warehouse）
  for (const b of (binRes.data ?? []) as BinRow[]) {
    binByWh.set(b.warehouse_id, (binByWh.get(b.warehouse_id) ?? 0) + 1);
    binCapByWh.set(
      b.warehouse_id,
      (binCapByWh.get(b.warehouse_id) ?? 0) + Number(b.capacity ?? 0),
    );
  }

  const slotByWh = new Map<string, number>();
  for (const s of slotRes.data ?? [])
    slotByWh.set(s.warehouse_id as string, (slotByWh.get(s.warehouse_id as string) ?? 0) + 1);

  // 用 stock_items.qty 總和也可作為使用率近似（fallback when bins.capacity 為 0）
  const stockByWh = new Map<string, number>();
  for (const s of stockRes.data ?? [])
    stockByWh.set(
      s.warehouse_id as string,
      (stockByWh.get(s.warehouse_id as string) ?? 0) + Number(s.qty ?? 0),
    );

  const warehouses: WarehouseSummary[] = (whRes.data ?? []).map((w) => {
    const id = w.id as string;
    const bins = binByWh.get(id) ?? 0;
    const totalCap = binCapByWh.get(id) ?? 0;
    const stockQty = stockByWh.get(id) ?? 0;
    let utilization_pct = 0;
    if (totalCap > 0) {
      utilization_pct = Math.min(100, (stockQty / totalCap) * 100);
    } else if (bins > 0) {
      // fallback：以 stock qty / (bins * 50) 估算
      utilization_pct = Math.min(100, (stockQty / (bins * 50)) * 100);
    }
    return {
      id,
      name: w.name as string,
      type: (w.type as string) ?? "main",
      zone_count: zoneByWh.get(id) ?? 0,
      bin_count: bins,
      slot_count: slotByWh.get(id) ?? 0,
      utilization_pct,
    };
  });

  return { layers, warehouses };
}

export default async function WarehouseArchPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視倉儲四層架構的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_WAREHOUSE_ARCH_EDIT);
  const { layers, warehouses } = await loadData();

  return (
    <WarehouseArchBoard
      layers={layers}
      warehouses={warehouses}
      canEdit={canEdit}
    />
  );
}
