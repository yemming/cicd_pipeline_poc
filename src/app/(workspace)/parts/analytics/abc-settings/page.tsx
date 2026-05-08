import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { AbcSettingsBoard, type AbcConfig } from "./_components/abc-settings-board";

export const dynamic = "force-dynamic";

async function loadConfig(): Promise<AbcConfig | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("abc_classification_config")
    .select(
      "id, brand_id, recalc_trigger, rolling_period_months, threshold_a_pct, threshold_b_pct, count_freq_a_days, count_freq_b_days, count_freq_c_days, safety_stock_days_a, safety_stock_days_b, safety_stock_days_c, new_item_default_class, new_item_grace_months, last_recalc_at, is_active",
    )
    .eq("brand_id", getBrandKey())
    .maybeSingle();
  if (error) throw new Error(`abc-config: ${error.message}`);
  return (data ?? null) as unknown as AbcConfig | null;
}

export default async function AbcSettingsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PARTS_CONTROL_TYPE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視 ABC 分類設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  const config = await loadConfig();
  return <AbcSettingsBoard config={config} canEdit={canEdit} />;
}
