/**
 * Legacy redirect — 舊路徑 /aftersales/crm/call-tasks/[id] 已搬到 /crm/aftersales/call-tasks/[id]。
 */
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/aftersales/call-tasks/${id}`);
}
