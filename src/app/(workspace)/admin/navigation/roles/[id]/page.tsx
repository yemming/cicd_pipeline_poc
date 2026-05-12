import { notFound, redirect } from "next/navigation";

import { getRoleDetail } from "@/domain/navigation-admin";

import { RoleDetailView } from "./_components/role-detail-view";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getRoleDetail>>;
  try {
    detail = await getRoleDetail(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/admin/navigation");
    throw err;
  }

  if (!detail) notFound();
  const { role, grantedPerms, assignmentCount, recentAssignments } = detail;

  return (
    <main className="px-6 py-5 space-y-3">
      <RoleDetailView
        role={role}
        grantedPerms={grantedPerms}
        assignmentCount={assignmentCount}
        recentAssignments={recentAssignments}
      />
    </main>
  );
}
