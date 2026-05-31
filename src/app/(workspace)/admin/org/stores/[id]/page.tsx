import { redirect } from "next/navigation";

import { getStoreDetailData } from "@/domain/org-admin";

import { StoreDetailView } from "./_components/store-detail-view";

export const dynamic = "force-dynamic";

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getStoreDetailData>>;
  try {
    data = await getStoreDetailData(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return (
    <StoreDetailView
      store={data.store}
      brands={data.brands}
      groups={data.groups}
      regions={data.regions}
      initialMode="view"
    />
  );
}
