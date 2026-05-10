import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  WorkorderLoopBoard,
  type LoopEntry,
} from "./_components/workorder-loop-board";

export const dynamic = "force-dynamic";

async function loadEntries(): Promise<LoopEntry[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("parts_workorder_loop_entries")
    .select(
      "id, ro_no, missing_parts, sa_name, shortage_reason, po_no, eta_label, days_pending, status, is_overdue, sort_order",
    )
    .eq("brand_id", brand)
    .order("sort_order");
  if (error) throw new Error(`workorder-loop: ${error.message}`);
  return (data ?? []) as unknown as LoopEntry[];
}

export default async function WorkorderLoopPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單增項閉環的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  const entries = await loadEntries();
  return <WorkorderLoopBoard entries={entries} canEdit={canEdit} />;
}
