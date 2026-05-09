import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  CountRulesBoard,
  type ReviewRuleRow,
  type ToleranceConfig,
} from "./_components/count-rules-board";

export const dynamic = "force-dynamic";

const DEFAULT_TOLERANCE: ToleranceConfig = {
  tolerance_a_pct: 0,
  tolerance_b_pct: 2,
  tolerance_c_pct: 5,
  warning_text: "⚠ 超過容許率的差異項目將進入審核流程，不會自動回傳",
  notes: null,
};

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadData(): Promise<{
  tolerance: ToleranceConfig;
  rules: ReviewRuleRow[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  const [toleranceRes, rulesRes] = await Promise.all([
    supabase
      .from("count_tolerance_config")
      .select(
        "tolerance_a_pct, tolerance_b_pct, tolerance_c_pct, warning_text, notes",
      )
      .eq("brand_id", brand)
      .maybeSingle(),
    supabase
      .from("count_review_rules")
      .select(
        "id, rule_code, rule_name, description, badge_label, badge_color, panel_color, action, is_active, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order")
      .order("rule_code"),
  ]);

  if (toleranceRes.error)
    throw new Error(`tolerance: ${toleranceRes.error.message}`);
  if (rulesRes.error) throw new Error(`rules: ${rulesRes.error.message}`);

  const t = toleranceRes.data;
  const tolerance: ToleranceConfig = t
    ? {
        tolerance_a_pct: toNum(t.tolerance_a_pct),
        tolerance_b_pct: toNum(t.tolerance_b_pct),
        tolerance_c_pct: toNum(t.tolerance_c_pct),
        warning_text: (t.warning_text as string | null) ?? null,
        notes: (t.notes as string | null) ?? null,
      }
    : DEFAULT_TOLERANCE;

  const rules: ReviewRuleRow[] = (rulesRes.data ?? []).map((r) => ({
    id: r.id as string,
    rule_code: r.rule_code as string,
    rule_name: r.rule_name as string,
    description: (r.description as string | null) ?? null,
    badge_label: r.badge_label as string,
    badge_color: (r.badge_color as string) ?? "navy",
    panel_color: (r.panel_color as string) ?? "gray",
    action: (r.action as string | null) ?? null,
    is_active: !!r.is_active,
    sort_order: (r.sort_order as number) ?? 0,
  }));

  return { tolerance, rules };
}

export default async function CountRulesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">
          沒有檢視盤點回傳規則的權限
        </p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);
  const { tolerance, rules } = await loadData();

  return (
    <CountRulesBoard
      tolerance={tolerance}
      rules={rules}
      canEdit={canEdit}
    />
  );
}
