import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  RoLinkBoard,
  type RoLinkConfig,
  type RoLinkRecord,
} from "./_components/ro-link-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  config: RoLinkConfig | null;
  records: RoLinkRecord[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [cfgRes, recsRes] = await Promise.all([
    supabase
      .from("parts_warranty_ro_link_config")
      .select(
        "brand_id, dms_label, dms_endpoint, dms_connected, sync_ro_to_issue, sync_vin_check, sync_warranty_label, sync_technician, sync_estimate, sync_frequency, fallback_action, expiry_alert_days",
      )
      .eq("brand_id", brand)
      .maybeSingle(),
    supabase
      .from("parts_warranty_ro_link_records")
      .select(
        "id, ro_no, vin, model, warranty_type, sync_status, sync_status_label, out_no, claim_no, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order"),
  ]);
  if (cfgRes.error) throw new Error(`config: ${cfgRes.error.message}`);
  if (recsRes.error) throw new Error(`records: ${recsRes.error.message}`);
  return {
    config: (cfgRes.data ?? null) as unknown as RoLinkConfig | null,
    records: (recsRes.data ?? []) as unknown as RoLinkRecord[],
  };
}

export default async function RoLinkPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視 RO 工單串接設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const { config, records } = await loadData();
  return <RoLinkBoard config={config} records={records} canEdit={canEdit} />;
}
