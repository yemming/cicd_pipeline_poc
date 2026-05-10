import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  CompatBoard,
  type CompatRow,
  type ItemOption,
  type ModelOption,
} from "./_components/compatibility-board";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [cRes, iRes, mRes] = await Promise.all([
    supabase
      .from("item_vehicle_compatibility")
      .select("id, item_id, vehicle_model_id, year_start, year_end, notes, is_verified")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("vehicle_models")
      .select("id, series, model_name, display_name, year_start, year_end")
      .eq("brand_id", brand)
      .order("model_name"),
  ]);
  if (cRes.error) throw new Error(`compat: ${cRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  if (mRes.error) throw new Error(`models: ${mRes.error.message}`);
  return {
    rows: (cRes.data ?? []) as unknown as CompatRow[],
    items: (iRes.data ?? []) as unknown as ItemOption[],
    models: (mRes.data ?? []) as unknown as ModelOption[],
  };
}

export default async function CompatPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視適配設定的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);
  const { rows, items, models } = await loadData();
  return <CompatBoard rows={rows} items={items} models={models} canEdit={canEdit} />;
}
