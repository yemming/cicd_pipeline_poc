/**
 * Legacy redirect — 舊路徑 /sales/crm/dormant-leads/[id] 已搬到 /crm/sales/dormant-leads/[id]。
 */
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/sales/dormant-leads/${id}`);
}
