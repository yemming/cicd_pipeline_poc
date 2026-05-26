import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEvaluationForPrint } from "@/domain/used-car-evaluations";

import { UsedCarEvaluationPrintable } from "./_components/usedcar-evaluation-printable";

export const dynamic = "force-dynamic";

/**
 * 中古車評估鑑價列印頁 — 不在 (workspace) group 底下，所以沒有 topbar / sidebar。
 * 預覽歸預覽、列印歸列印（不 auto window.print）；User 自己點右上 PrintToolbar
 * 「下載 PDF」走 /api/pdf/usedcar-evaluation/{id}，拿到的 PDF 無 URL header。
 */
export default async function UsedCarEvaluationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  // 列印權限 = 詳情頁讀取權限（與 wizard 一致沿用 CUSTOMER_VIEW；目前 evaluation 沒有
  // 專屬 permission）。後續若拆出「中古車評估 view」permission 再換。
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印中古車評估單的權限
      </main>
    );
  }

  const { id } = await params;
  const data = await getEvaluationForPrint(id);
  if (!data) notFound();

  return <UsedCarEvaluationPrintable data={data} />;
}
