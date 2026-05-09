import { notFound, redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  RequisitionDetailView,
  type DetailRequisition,
  type LineRow,
  type ItemRef,
  type OrgRef,
} from "./_components/requisition-detail-view";

export const dynamic = "force-dynamic";

async function loadDetail(id: string) {
  const supabase = await createClient();
  const brand = getBrandKey();

  const { data: req, error: reqErr } = await supabase
    .from("purchase_requisitions")
    .select(
      "id, req_no, org_id, status, required_date, notes, source, approved_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (reqErr || !req) return null;

  const [linesRes, orgsRes] = await Promise.all([
    supabase
      .from("purchase_requisition_lines")
      .select("id, line_no, item_id, qty_required, uom, expected_date, notes")
      .eq("brand_id", brand)
      .eq("req_id", id)
      .order("line_no"),
    supabase
      .from("organizations")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code"),
  ]);

  const lines = (linesRes.data ?? []) as unknown as LineRow[];

  // 撈本單明細裡的 items + 給編輯模式用的全部 items 下拉
  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  const linkedItems: ItemRef[] = itemIds.length
    ? ((
        await supabase.from("items").select("id, code, name").in("id", itemIds)
      ).data ?? []) as unknown as ItemRef[]
    : [];

  const { data: allItemsData } = await supabase
    .from("items")
    .select("id, code, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code")
    .limit(500);
  const allItems = (allItemsData ?? []) as unknown as ItemRef[];

  // 編輯/明細顯示共用同一份 itemRef map（合併去重）
  const itemMap = new Map(allItems.map((i) => [i.id, i]));
  for (const it of linkedItems) if (!itemMap.has(it.id)) itemMap.set(it.id, it);

  return {
    requisition: req as unknown as DetailRequisition,
    lines,
    items: Array.from(itemMap.values()),
    orgs: (orgsRes.data ?? []) as unknown as OrgRef[],
  };
}

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視需求處理的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const data = await loadDetail(id);
  if (!data) notFound();

  const canEdit = await hasPermission(PERMISSIONS.PR_CREATE);
  const canApprove = await hasPermission(PERMISSIONS.PR_APPROVE);

  return <RequisitionDetailView {...data} canEdit={canEdit} canApprove={canApprove} />;
}
