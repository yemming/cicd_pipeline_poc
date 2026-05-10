import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  StagingWarehouseBoard,
  type StagingRules,
  type StagingWarehouse,
} from "./_components/staging-warehouse-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  warehouses: StagingWarehouse[];
  rules: StagingRules | null;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [whRes, rulesRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name, type, is_active, address, notes")
      .eq("brand_id", brand)
      .or("type.eq.warranty,name.ilike.%保固%,name.ilike.%暫存%"),
    supabase
      .from("parts_warranty_staging_rules")
      .select(
        "brand_id, isolate_from_sellable, exclude_from_alerts, exclude_from_count, allow_temp_borrow, alert_days_first, alert_days_escalate, cost_calc_method",
      )
      .eq("brand_id", brand)
      .maybeSingle(),
  ]);
  if (whRes.error) throw new Error(`warehouses: ${whRes.error.message}`);
  if (rulesRes.error) throw new Error(`rules: ${rulesRes.error.message}`);
  return {
    warehouses: (whRes.data ?? []) as unknown as StagingWarehouse[],
    rules: (rulesRes.data ?? null) as unknown as StagingRules | null,
  };
}

export default async function StagingWarehousePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視暫存倉設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const { warehouses, rules } = await loadData();
  return (
    <StagingWarehouseBoard
      warehouses={warehouses}
      rules={rules}
      canEdit={canEdit}
    />
  );
}
