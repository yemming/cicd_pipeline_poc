import { notFound, redirect } from "next/navigation";

import { getUserAssignmentDetail } from "@/domain/navigation-admin";

import { AssignmentDetailView } from "./_components/assignment-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ userId: string; roleId: string }>;
}) {
  const { userId, roleId } = await params;

  let detail: Awaited<ReturnType<typeof getUserAssignmentDetail>>;
  try {
    detail = await getUserAssignmentDetail(userId, roleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/admin/navigation");
    throw err;
  }

  const { assignments, role, email, options } = detail;
  if (!role) notFound();
  if (!assignments || assignments.length === 0) {
    // 沒任何作用域 = 該 (user, role) 不存在 → 回列表
    redirect("/admin/navigation?tab=users");
  }

  const granted = {
    groups: assignments.filter((a) => a.scope_type === "group"),
    brands: assignments.filter((a) => a.scope_type === "brand"),
    stores: assignments.filter((a) => a.scope_type === "store"),
  };

  return (
    <main className="px-6 py-5 space-y-3">
      <AssignmentDetailView
        mode="view"
        email={email}
        userId={userId}
        role={role}
        granted={granted}
        groups={options.groups}
        brands={options.brands}
        stores={options.stores}
        allRoles={options.roles}
      />
    </main>
  );
}
