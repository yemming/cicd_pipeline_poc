import { redirect } from "next/navigation";

import { getGroupDetailData } from "@/domain/org-admin";

import { GroupDetailView } from "./_components/group-detail-view";

export const dynamic = "force-dynamic";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getGroupDetailData>>;
  try {
    data = await getGroupDetailData(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return <GroupDetailView group={data.group} initialMode="view" />;
}
