/**
 * Legacy redirect — 舊路徑 /aftersales/crm/customer-base/[id] 已搬到 /crm/aftersales/customer-base/[id]。
 */
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/crm/aftersales/customer-base/${id}`);
}
