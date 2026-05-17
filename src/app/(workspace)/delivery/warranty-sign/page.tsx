import { WarrantySignView } from "./_components/warranty-sign-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <WarrantySignView deliveryId={sp.deliveryId} />;
}
