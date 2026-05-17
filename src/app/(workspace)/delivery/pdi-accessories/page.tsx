import { PdiAccessoriesView } from "./_components/pdi-accessories-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <PdiAccessoriesView deliveryId={sp.deliveryId} />;
}
