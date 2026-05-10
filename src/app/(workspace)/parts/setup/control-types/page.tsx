import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  ControlTypesBoard,
  type ControlTypeRow,
  type DistributionRow,
} from "./_components/control-types-board";

export const dynamic = "force-dynamic";

function toNumOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadData(): Promise<{
  rows: ControlTypeRow[];
  distribution: DistributionRow[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [rowsRes, distRes] = await Promise.all([
    supabase
      .from("parts_control_types")
      .select(
        "id, class_code, class_name, price_basis, count_frequency, serial_tracking_label, serial_tracking_color, issue_review_label, issue_review_color, tolerance_pct, example_text, accent_color, is_active, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order")
      .order("class_code"),
    supabase
      .from("abc_classification_results")
      .select("abc_class, item_id")
      .eq("brand_id", brand),
  ]);

  if (rowsRes.error) throw new Error(`control_types: ${rowsRes.error.message}`);
  if (distRes.error) throw new Error(`distribution: ${distRes.error.message}`);

  const rows: ControlTypeRow[] = (rowsRes.data ?? []).map((r) => ({
    id: r.id as string,
    class_code: r.class_code as string,
    class_name: r.class_name as string,
    price_basis: (r.price_basis as string | null) ?? null,
    count_frequency: (r.count_frequency as string | null) ?? null,
    serial_tracking_label: (r.serial_tracking_label as string | null) ?? null,
    serial_tracking_color: (r.serial_tracking_color as string) ?? "gray",
    issue_review_label: (r.issue_review_label as string | null) ?? null,
    issue_review_color: (r.issue_review_color as string) ?? "gray",
    tolerance_pct: toNumOrNull(r.tolerance_pct as number | string | null),
    example_text: (r.example_text as string | null) ?? null,
    accent_color: (r.accent_color as string) ?? "gray",
    is_active: !!r.is_active,
    sort_order: (r.sort_order as number) ?? 0,
  }));

  // Distribution: 以 abc_classification_results 中 distinct item_id 作為料號數
  const itemsByClass = new Map<string, Set<string>>();
  for (const d of distRes.data ?? []) {
    const cls = (d.abc_class as string | null)?.toUpperCase();
    const itemId = d.item_id as string | null;
    if (!cls || !itemId) continue;
    if (!itemsByClass.has(cls)) itemsByClass.set(cls, new Set());
    itemsByClass.get(cls)!.add(itemId);
  }
  const distribution: DistributionRow[] = Array.from(itemsByClass.entries()).map(
    ([class_code, set]) => ({ class_code, item_count: set.size }),
  );

  return { rows, distribution };
}

export default async function ControlTypesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_CONTROL_TYPE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">
          沒有檢視管控類型定義的權限
        </p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_CONTROL_TYPE_EDIT);
  const { rows, distribution } = await loadData();

  return (
    <ControlTypesBoard
      rows={rows}
      distribution={distribution}
      canEdit={canEdit}
    />
  );
}
