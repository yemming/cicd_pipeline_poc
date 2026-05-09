import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  PurchasePermissionsBoard,
  type FlowRow,
  type RuleRow,
  type StoreOpt,
} from "./_components/purchase-permissions-board";

export const dynamic = "force-dynamic";

type RawRule = {
  id: string;
  role_code: string;
  role_name: string;
  store_id: string | null;
  single_limit: number | string | null;
  monthly_limit: number | string | null;
  requires_approval: boolean;
  notes: string | null;
  is_active: boolean;
  sort_order: number | null;
};

type RawFlow = {
  id: string;
  flow_type: string;
  flow_name: string;
  description: string | null;
  color_tag: string | null;
  emoji: string | null;
  steps: unknown;
  is_active: boolean;
  sort_order: number | null;
};

function toNumberOrNull(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSteps(raw: unknown): { label: string; color?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const obj = s as { label?: unknown; color?: unknown };
      const label = typeof obj.label === "string" ? obj.label : "";
      const color = typeof obj.color === "string" ? obj.color : "navy";
      if (!label) return null;
      return { label, color };
    })
    .filter((x): x is { label: string; color: string } => !!x);
}

async function loadData(): Promise<{
  rules: RuleRow[];
  flows: FlowRow[];
  stores: StoreOpt[];
}> {
  const supabase = await createClient();
  const brand = getBrandKey();

  const [rulesRes, flowsRes, storesRes] = await Promise.all([
    supabase
      .from("purchase_permission_rules")
      .select(
        "id, role_code, role_name, store_id, single_limit, monthly_limit, requires_approval, notes, is_active, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order")
      .order("role_code"),
    supabase
      .from("purchase_approval_flows")
      .select(
        "id, flow_type, flow_name, description, color_tag, emoji, steps, is_active, sort_order",
      )
      .eq("brand_id", brand)
      .order("sort_order")
      .order("flow_type"),
    supabase
      .from("organizations")
      .select("id, name")
      .eq("brand_id", brand)
      .eq("type", "store")
      .eq("is_active", true)
      .order("code"),
  ]);

  if (rulesRes.error) throw new Error(`rules: ${rulesRes.error.message}`);
  if (flowsRes.error) throw new Error(`flows: ${flowsRes.error.message}`);
  if (storesRes.error) throw new Error(`stores: ${storesRes.error.message}`);

  const rules: RuleRow[] = ((rulesRes.data ?? []) as RawRule[]).map((r) => ({
    id: r.id,
    role_code: r.role_code,
    role_name: r.role_name,
    store_id: r.store_id,
    single_limit: toNumberOrNull(r.single_limit),
    monthly_limit: toNumberOrNull(r.monthly_limit),
    requires_approval: !!r.requires_approval,
    notes: r.notes,
    is_active: !!r.is_active,
    sort_order: r.sort_order ?? 0,
  }));

  const flows: FlowRow[] = ((flowsRes.data ?? []) as RawFlow[]).map((f) => ({
    id: f.id,
    flow_type: f.flow_type,
    flow_name: f.flow_name,
    description: f.description,
    color_tag: f.color_tag ?? "navy",
    emoji: f.emoji,
    steps: normalizeSteps(f.steps),
    is_active: !!f.is_active,
    sort_order: f.sort_order ?? 0,
  }));

  const stores: StoreOpt[] = (storesRes.data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
  }));

  return { rules, flows, stores };
}

export default async function PurchasePermissionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視採購權限規則的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);
  const { rules, flows, stores } = await loadData();

  return (
    <PurchasePermissionsBoard
      rules={rules}
      flows={flows}
      stores={stores}
      canEdit={canEdit}
    />
  );
}
