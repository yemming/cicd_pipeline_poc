import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import { NewPOForm } from "./_components/new-po-form";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立採購單的權限</p>
      </main>
    );
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [supRes, whRes, itemRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("warehouses")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name, base_uom")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(500),
  ]);

  return (
    <NewPOForm
      suppliers={supRes.data ?? []}
      warehouses={whRes.data ?? []}
      items={itemRes.data ?? []}
    />
  );
}
