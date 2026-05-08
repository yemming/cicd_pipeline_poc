import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  SerialRulesBoard,
  type RecentSerial,
  type SerialRuleRow,
} from "./_components/serial-rules-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  rules: SerialRuleRow[];
  recentSerials: RecentSerial[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  const [rulesRes, recentRes] = await Promise.all([
    supabase
      .from("parts_serial_tracking_rules")
      .select(
        "id, class_code, rule_label, is_required, is_locked, description, panel_color, is_active, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order")
      .order("class_code"),
    supabase
      .from("stock_items")
      .select("serial_no, status, items(name)")
      .eq("brand_id", brand)
      .not("serial_no", "is", null)
      .order("last_movement_at", { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  if (rulesRes.error) throw new Error(`rules: ${rulesRes.error.message}`);
  if (recentRes.error) throw new Error(`recent: ${recentRes.error.message}`);

  const rules: SerialRuleRow[] = (rulesRes.data ?? []).map((r) => ({
    id: r.id as string,
    class_code: r.class_code as string,
    rule_label: r.rule_label as string,
    is_required: !!r.is_required,
    is_locked: !!r.is_locked,
    description: (r.description as string | null) ?? null,
    panel_color: (r.panel_color as string) ?? "gray",
    is_active: !!r.is_active,
    sort_order: (r.sort_order as number) ?? 0,
  }));

  const recentSerials: RecentSerial[] = (recentRes.data ?? [])
    .filter((r) => !!r.serial_no)
    .map((r) => {
      const it = r.items as { name?: string | null } | null;
      return {
        serial_no: r.serial_no as string,
        status: (r.status as string | null) ?? null,
        item_name: it?.name ?? null,
      };
    });

  return { rules, recentSerials };
}

export default async function SerialRulesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_SERIAL_RULE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視序列號追蹤的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT);
  const { rules, recentSerials } = await loadData();

  return (
    <SerialRulesBoard
      rules={rules}
      recentSerials={recentSerials}
      canEdit={canEdit}
    />
  );
}
