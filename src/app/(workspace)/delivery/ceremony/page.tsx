import { CeremonyView } from "./_components/ceremony-view";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const sp = await searchParams;
  return <CeremonyView deliveryId={sp.deliveryId} />;
}
