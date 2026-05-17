import { Confirm2View } from "./_components/confirm-2-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <Confirm2View deliveryId={sp.deliveryId} />;
}
