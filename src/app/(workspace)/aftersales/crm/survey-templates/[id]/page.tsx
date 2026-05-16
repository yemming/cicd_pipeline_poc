/**
 * Legacy redirect — 舊路徑 /aftersales/crm/survey-templates/[id] 已搬到 /crm/aftersales/survey-templates/[id]。
 */
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/aftersales/survey-templates/${id}`);
}
