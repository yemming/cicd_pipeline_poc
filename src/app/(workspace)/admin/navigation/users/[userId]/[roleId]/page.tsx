import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { loadScopeOptions } from "../../_lib/load-scope-options";
import { AssignmentDetailView } from "./_components/assignment-detail-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ userId: string; roleId: string }>;
}) {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/admin/navigation");

  const { userId, roleId } = await params;
  const sb = createServiceClient();

  const [{ data: assignments }, { data: role }, options] = await Promise.all([
    sb
      .from("user_assignments")
      .select("id, scope_type, scope_id, granted_at, notes")
      .eq("user_id", userId)
      .eq("role_id", roleId)
      .order("granted_at", { ascending: false }),
    sb.from("roles").select("id, name, description").eq("id", roleId).maybeSingle(),
    loadScopeOptions(),
  ]);

  if (!role) notFound();
  if (!assignments || assignments.length === 0) {
    // 沒任何作用域 = 該 (user, role) 不存在 → 回列表
    redirect("/admin/navigation?tab=users");
  }

  // user email
  let email: string | null = null;
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.id === userId && u.email) {
      email = u.email;
      break;
    }
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
