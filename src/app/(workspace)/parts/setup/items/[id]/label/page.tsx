import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getItemLabelData } from "@/domain/items";

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
  const item = await getItemLabelData(id);
  if (!item) notFound();

  return <LabelPrint item={item} />;
}
