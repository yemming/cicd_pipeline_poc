import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  PricingBoard,
  type PriceRow,
  type ItemOption,
  type OrgOption,
} from "./_components/pricing-board";

export const dynamic = "force-dynamic";

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [pRes, iRes, oRes] = await Promise.all([
    supabase
      .from("item_store_prices")
      .select(
        "id, item_id, org_id, price, pricing_type, promo_start_date, promo_end_date, is_active, notes",
      )
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id, code, name, suggested_price")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("orgs")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (pRes.error) throw new Error(`prices: ${pRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  return {
    rows: (pRes.data ?? []) as unknown as PriceRow[],
    items: (iRes.data ?? []) as unknown as ItemOption[],
    orgs: oRes.error ? [] : ((oRes.data ?? []) as unknown as OrgOption[]),
  };
}

export default async function PricingPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視門市定價的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);
  const { rows, items, orgs } = await loadData();
  return <PricingBoard rows={rows} items={items} orgs={orgs} canEdit={canEdit} />;
}
