import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getConsignmentPageData } from "@/domain/consignment";

import { ConsignmentBoard } from "./_components/consignment-board";

export const dynamic = "force-dynamic";

type Bucket = "all" | "active" | "near" | "expired" | "done";

const BUCKETS: readonly Bucket[] = [
  "all",
  "active",
  "near",
  "expired",
  "done",
] as const;

function parseBucket(v?: string): Bucket {
  return (BUCKETS as readonly string[]).includes(v ?? "")
    ? (v as Bucket)
    : "all";
}

export default async function ConsignmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    bucket?: string;
    supplier_id?: string;
    due_from?: string;
    due_to?: string;
    q?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視寄存管理的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const bucket = parseBucket(sp.bucket);

  const { rows, stats, lookup, canEdit } = await getConsignmentPageData({
    bucket,
    supplier_id: sp.supplier_id || undefined,
    due_from: sp.due_from || undefined,
    due_to: sp.due_to || undefined,
    q: sp.q || undefined,
  });

  return (
    <ConsignmentBoard
      rows={rows}
      stats={stats}
      lookup={lookup}
      canEdit={canEdit}
      initialBucket={bucket}
      initialSupplierId={sp.supplier_id ?? ""}
      initialDueFrom={sp.due_from ?? ""}
      initialDueTo={sp.due_to ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
