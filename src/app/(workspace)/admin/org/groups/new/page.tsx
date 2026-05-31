import { redirect } from "next/navigation";

import { getGroupsBoardData } from "@/domain/org-admin";

import { GroupDetailView } from "../[id]/_components/group-detail-view";

export const dynamic = "force-dynamic";

export default async function GroupNewPage() {
  // create mode 不需要 lookups，但仍跑一次 board getter 做 admin guard
  try {
    await getGroupsBoardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }

  return <GroupDetailView group={null} initialMode="create" />;
}
