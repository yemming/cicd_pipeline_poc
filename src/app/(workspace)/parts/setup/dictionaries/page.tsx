import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { DictionaryRow } from "@/lib/parts-setup/dictionary-actions";

import { DictionariesBoard } from "./_components/dictionaries-board";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("parts_dictionary")
    .select(
      "id, brand_id, kind, code, label, description, accent_color, sort_order, is_active",
    )
    .eq("brand_id", brand)
    .order("kind")
    .order("sort_order");
  if (error) throw new Error(`parts_dictionary: ${error.message}`);
  return (data ?? []) as unknown as DictionaryRow[];
}

export default async function DictionariesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視主檔對應的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);
  const rows = await loadData();
  return <DictionariesBoard rows={rows} canEdit={canEdit} />;
}
