import { redirect } from "next/navigation";

import { getBrandFormLookups } from "@/domain/org-admin";

import { BrandDetailView } from "../[id]/_components/brand-detail-view";

export const dynamic = "force-dynamic";

export default async function BrandNewPage() {
  let data: Awaited<ReturnType<typeof getBrandFormLookups>>;
  try {
    data = await getBrandFormLookups();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return <BrandDetailView brand={null} groups={data.groups} initialMode="create" />;
}
