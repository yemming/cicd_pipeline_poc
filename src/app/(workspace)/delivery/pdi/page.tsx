import { PdiView } from "./_components/pdi-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <PdiView deliveryId={sp.deliveryId} />;
}
