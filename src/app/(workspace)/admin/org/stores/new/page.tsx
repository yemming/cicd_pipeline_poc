import { redirect } from "next/navigation";

import { getStoreFormLookups } from "@/domain/org-admin";

import { StoreDetailView } from "../[id]/_components/store-detail-view";

export const dynamic = "force-dynamic";

export default async function StoreNewPage() {
  let data: Awaited<ReturnType<typeof getStoreFormLookups>>;
  try {
    data = await getStoreFormLookups();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return (
    <StoreDetailView
      store={null}
      brands={data.brands}
      groups={data.groups}
      regions={data.regions}
      initialMode="create"
    />
  );
}
