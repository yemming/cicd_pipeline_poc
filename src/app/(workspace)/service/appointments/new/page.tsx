// canonical → /parts/aftersales/appointments/new（第八輪 Q9=A）
import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v) qs.set(k, v);
  }
  const tail = qs.toString();
  redirect(
    tail
      ? `/parts/aftersales/appointments/new?${tail}`
      : "/parts/aftersales/appointments/new",
  );
}
