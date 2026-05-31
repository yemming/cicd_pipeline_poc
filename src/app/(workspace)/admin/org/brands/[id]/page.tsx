import { redirect } from "next/navigation";

import { getBrandDetailData } from "@/domain/org-admin";

import { BrandDetailView } from "./_components/brand-detail-view";

export const dynamic = "force-dynamic";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getBrandDetailData>>;
  try {
    data = await getBrandDetailData(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return <BrandDetailView brand={data.brand} groups={data.groups} initialMode="view" />;
}
