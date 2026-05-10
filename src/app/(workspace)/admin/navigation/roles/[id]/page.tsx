import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { RoleDetailView } from "./_components/role-detail-view";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/admin/navigation");

  const { id } = await params;
  const sb = createServiceClient();
  const [{ data: role }, { data: rolePerms }, { data: assignments }, { data: permissions }] =
    await Promise.all([
      sb.from("roles").select("id, name, description, is_system, created_at, updated_at").eq("id", id).maybeSingle(),
      sb.from("role_permissions").select("permission_code").eq("role_id", id),
      sb
        .from("user_assignments")
        .select("id, user_id, scope_type, scope_id, granted_at")
        .eq("role_id", id)
        .order("granted_at", { ascending: false })
        .limit(50),
      sb.from("permissions").select("code, label, module"),
    ]);

  if (!role) notFound();

  // 撈使用該 role 的 user emails
  const userIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id)));
  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
    for (const u of users?.users ?? []) {
      if (u.id && u.email) userMap[u.id] = u.email;
    }
  }

  // 把 permission codes 對到 label/module 給 detail 頁顯示
  const permMeta = new Map<string, { label: string; module: string }>();
  for (const p of permissions ?? []) {
    permMeta.set(p.code, { label: p.label, module: p.module });
  }
  const grantedPerms = (rolePerms ?? []).map((rp) => ({
    code: rp.permission_code,
    label: permMeta.get(rp.permission_code)?.label ?? rp.permission_code,
    module: permMeta.get(rp.permission_code)?.module ?? "—",
  }));

  return (
    <main className="px-6 py-5 space-y-3">
      <RoleDetailView
        role={role}
        grantedPerms={grantedPerms}
        assignmentCount={assignments?.length ?? 0}
        recentAssignments={(assignments ?? []).slice(0, 10).map((a) => ({
          id: a.id,
          email: userMap[a.user_id] ?? null,
          user_id: a.user_id,
          scope_type: a.scope_type,
          scope_id: a.scope_id,
          granted_at: a.granted_at,
        }))}
      />
    </main>
  );
}
