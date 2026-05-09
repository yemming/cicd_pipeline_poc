import { notFound, redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { LabelPrint } from "./_components/label-print";

export const dynamic = "force-dynamic";

export default async function ItemLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return <div className="p-8 text-center text-[#BF2600]">沒有檢視權限</div>;
  }

  const { id } = await params;
  const supabase = await createClient();
  const brand = getBrandKey();
  const { data, error } = await supabase
    .from("items")
    .select("code, name, spec_description, category, control_type, base_uom, suggested_price, default_supplier_id, suppliers:default_supplier_id ( name )")
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (error || !data) notFound();
  const item = data as unknown as {
    code: string;
    name: string;
    spec_description: string | null;
    category: string | null;
    control_type: string | null;
    base_uom: string | null;
    suggested_price: number | null;
    suppliers: { name: string } | null;
  };

  return <LabelPrint item={item} />;
}
