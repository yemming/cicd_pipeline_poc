import { Confirm1View } from "./_components/confirm-1-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <Confirm1View deliveryId={sp.deliveryId} />;
}
