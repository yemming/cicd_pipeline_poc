import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ItemLeadTimesBoard, type LeadTimeRow } from "./_components/item-lead-times-board";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

export default async function ItemLeadTimesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視料號的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [itemsRes, supRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, category, default_supplier_id, default_lead_time_days, is_active")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("brand_id", brand),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (supRes.error) throw new Error(supRes.error.message);

  const supMap = new Map(((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const rows: LeadTimeRow[] = ((itemsRes.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    category: string | null;
    default_supplier_id: string | null;
    default_lead_time_days: number | null;
  }>).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    default_supplier_name: r.default_supplier_id ? supMap.get(r.default_supplier_id) ?? null : null,
    default_lead_time_days: r.default_lead_time_days,
  }));

  const filledCount = rows.filter((r) => r.default_lead_time_days !== null).length;

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">料號預設前置時間</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {rows.length} 筆 ・ 已設定 {filledCount} 筆 ・
          MRP 計算時若該料沒有 supplier_item_pricing，就吃這個 fallback 值
        </p>
      </header>

      <div className="bg-[#DEEBFF] border border-[#B3D4FF] rounded-md px-4 py-2.5 text-[12.5px] text-[#0747A6]">
        💡 直接在右側欄位編輯數字，blur 或 Enter 自動儲存。空白＝沒設值（MRP 將套用 7 天預設）。
      </div>

      <ItemLeadTimesBoard rows={rows} canEdit={canEdit} />
    </main>
  );
}
