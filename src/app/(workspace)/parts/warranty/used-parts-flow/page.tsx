import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  UsedPartsFlowBoard,
  type UsedPartsConfig,
  type UsedPartItem,
} from "./_components/used-parts-flow-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  config: UsedPartsConfig | null;
  items: UsedPartItem[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [cfgRes, itemsRes] = await Promise.all([
    supabase
      .from("parts_warranty_used_parts_config")
      .select(
        "brand_id, trigger_auto_reserve, trigger_scan_inbound, trigger_manual_no_serial, trigger_require_photo, trigger_auto_barcode, inbound_warehouse, auto_update_claim, auto_link_cost_recovery",
      )
      .eq("brand_id", brand)
      .maybeSingle(),
    supabase
      .from("parts_warranty_used_parts_items")
      .select(
        "id, barcode, item_name, item_code, ro_no, inbound_date, damage_level, damage_label, status, status_label, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order"),
  ]);
  if (cfgRes.error) throw new Error(`config: ${cfgRes.error.message}`);
  if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);
  return {
    config: (cfgRes.data ?? null) as unknown as UsedPartsConfig | null,
    items: (itemsRes.data ?? []) as unknown as UsedPartItem[],
  };
}

export default async function UsedPartsFlowPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視舊件出入庫邏輯的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.USEDPART_OPS);
  const { config, items } = await loadData();
  return <UsedPartsFlowBoard config={config} items={items} canEdit={canEdit} />;
}
