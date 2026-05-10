import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  EscalationBoard,
  type EscalationRule,
  type Receiver,
} from "./_components/escalation-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  rules: EscalationRule[];
  receivers: Receiver[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [rulesRes, recvRes] = await Promise.all([
    supabase
      .from("parts_alert_escalation_rules")
      .select(
        "id, alert_type, alert_label, alert_priority, alert_icon, trigger_desc, tier, tier_label, delay_minutes, recipient_label, channel_push, channel_sms, channel_email, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order"),
    supabase
      .from("parts_alert_receivers")
      .select(
        "id, display_name, role_label, avatar_color, default_push, default_sms, default_email, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order"),
  ]);
  if (rulesRes.error) throw new Error(`escalation rules: ${rulesRes.error.message}`);
  if (recvRes.error) throw new Error(`receivers: ${recvRes.error.message}`);
  return {
    rules: (rulesRes.data ?? []) as unknown as EscalationRule[],
    receivers: (recvRes.data ?? []) as unknown as Receiver[],
  };
}

export default async function AlertEscalationPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視告警階層設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  const { rules, receivers } = await loadData();
  return <EscalationBoard rules={rules} receivers={receivers} canEdit={canEdit} />;
}
