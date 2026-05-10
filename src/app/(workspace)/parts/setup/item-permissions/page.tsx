import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  ItemPermissionsBoard,
  type FeatureRow,
  type GrantMap,
  type RoleRow,
} from "./_components/item-permissions-board";

export const dynamic = "force-dynamic";

async function loadData(): Promise<{
  roles: RoleRow[];
  features: FeatureRow[];
  grants: GrantMap;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [rolesRes, featuresRes, grantsRes] = await Promise.all([
    supabase
      .from("item_permission_roles")
      .select("id, role_code, role_name, sort_order, is_active")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("sort_order")
      .order("role_code"),
    supabase
      .from("item_permission_features")
      .select(
        "id, group_code, group_name, group_sort_order, feature_code, feature_name, description, sort_order, is_active",
      )
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("group_sort_order")
      .order("sort_order"),
    supabase
      .from("item_permission_grants")
      .select("feature_id, role_id, granted")
      .eq("brand_id", brand),
  ]);

  if (rolesRes.error) throw new Error(`roles: ${rolesRes.error.message}`);
  if (featuresRes.error) throw new Error(`features: ${featuresRes.error.message}`);
  if (grantsRes.error) throw new Error(`grants: ${grantsRes.error.message}`);

  const roles: RoleRow[] = (rolesRes.data ?? []).map((r) => ({
    id: r.id as string,
    role_code: r.role_code as string,
    role_name: r.role_name as string,
    sort_order: (r.sort_order as number) ?? 0,
    is_active: !!r.is_active,
  }));

  const features: FeatureRow[] = (featuresRes.data ?? []).map((f) => ({
    id: f.id as string,
    group_code: f.group_code as string,
    group_name: f.group_name as string,
    group_sort_order: (f.group_sort_order as number) ?? 0,
    feature_code: f.feature_code as string,
    feature_name: f.feature_name as string,
    description: (f.description as string | null) ?? null,
    sort_order: (f.sort_order as number) ?? 0,
    is_active: !!f.is_active,
  }));

  const grants: GrantMap = {};
  for (const g of grantsRes.data ?? []) {
    grants[`${g.feature_id}:${g.role_id}`] = !!g.granted;
  }

  return { roles, features, grants };
}

export default async function ItemPermissionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_ITEM_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">
          沒有檢視商品管理權限的權限
        </p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);
  const { roles, features, grants } = await loadData();

  return (
    <ItemPermissionsBoard
      roles={roles}
      features={features}
      grants={grants}
      canEdit={canEdit}
    />
  );
}
