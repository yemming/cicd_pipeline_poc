import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getThresholdsPageData } from "@/domain/alerts";

import { ThresholdsBoard } from "./_components/thresholds-board";

export const dynamic = "force-dynamic";

export default async function ThresholdsPage({
  searchParams,
}: {
  searchParams: Promise<{ abc_class?: string; q?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視水位設定的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit } = await getThresholdsPageData({
    abc_class: sp.abc_class || undefined,
    q: sp.q || undefined,
  });

  return (
    <ThresholdsBoard
      rows={rows}
      canEdit={canEdit}
      initialAbc={sp.abc_class ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
