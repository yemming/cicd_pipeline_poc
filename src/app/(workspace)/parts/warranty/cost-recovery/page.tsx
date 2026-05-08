import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  CostRecoveryBoard,
  type Claim,
  type CRConfig,
} from "./_components/cost-recovery-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  config: CRConfig | null;
  claims: Claim[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();
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
  return {
    config: (cfgRes.data ?? null) as unknown as CRConfig | null,
    claims: ((clRes.data ?? []) as unknown as Claim[]).map((c) => ({
      ...c,
      apply_amount: Number(c.apply_amount),
      approved_amount: Number(c.approved_amount),
    })),
  };
}

export default async function CostRecoveryPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視費用回收的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const { config, claims } = await loadData();
  return <CostRecoveryBoard config={config} claims={claims} canEdit={canEdit} />;
}
