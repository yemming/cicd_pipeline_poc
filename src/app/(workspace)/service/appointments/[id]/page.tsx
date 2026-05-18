// canonical → /parts/aftersales/appointments/[id]（第八輪 Q9=A）
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/parts/aftersales/appointments/${id}`);
}
