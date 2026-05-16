/**
 * Legacy redirect — 舊路徑 /aftersales/crm/dormant-customers/[id] 已搬到 /crm/aftersales/dormant-customers/[id]。
 */
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/aftersales/dormant-customers/${id}`);
}
