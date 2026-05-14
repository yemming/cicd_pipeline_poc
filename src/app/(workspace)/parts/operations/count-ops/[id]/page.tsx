import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCountSessionById } from "@/domain/count";

import { CountSessionDetailView } from "./_components/count-session-detail-view";

export const dynamic = "force-dynamic";

export default async function CountSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視盤點作業的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const detail = await getCountSessionById(id);
  if (!detail) notFound();

  const canExecute = await hasPermission(PERMISSIONS.COUNT_EXECUTE);
  const canApprove = await hasPermission(PERMISSIONS.COUNT_ADJUST);

  return (
    <CountSessionDetailView
      detail={detail}
      canExecute={canExecute}
      canApprove={canApprove}
    />
  );
}
