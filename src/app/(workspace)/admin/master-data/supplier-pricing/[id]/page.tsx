import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSupplierPricingById } from "@/lib/master-data/queries";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  SupplierPricingDetailView,
  type ItemRef,
  type SupplierRef,
} from "./_components/supplier-pricing-detail-view";

export const dynamic = "force-dynamic";

async function loadLookups() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [sRes, iRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand)
      .order("code"),
    supabase
      .from("items")
      .select("id, code, name, category, base_uom")
      .eq("brand_id", brand)
      .order("code")
      .limit(1000),
  ]);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  return {
    suppliers: (sRes.data ?? []) as unknown as SupplierRef[],
    items: (iRes.data ?? []) as unknown as ItemRef[],
  };
}

export default async function SupplierPricingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_PRICING_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商定價的權限</p>
      </main>
    );
  }

  const [pricing, lookups] = await Promise.all([
    getSupplierPricingById(id),
    loadLookups(),
  ]);
  if (!pricing) notFound();
  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);

  return (
    <SupplierPricingDetailView
      pricing={pricing}
      suppliers={lookups.suppliers}
      items={lookups.items}
      canEdit={canEdit}
    />
  );
}
