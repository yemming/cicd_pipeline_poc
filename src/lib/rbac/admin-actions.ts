"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const { isAdmin, userId } = await getCurrentUserAndAdmin();
  if (!isAdmin) return "需要 admin 權限";
  if (!userId) return "未登入";
  return null;
}

/** 切換 brand_modules.enabled */
export async function setBrandModuleEnabledAction(
  brand_id: string,
  module_key: string,
  enabled: boolean,
): Promise<ActionResult<{ brand_id: string; module_key: string; enabled: boolean }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const { userId } = await getCurrentUserAndAdmin();
  const sb = createServiceClient();
  const { error } = await sb
    .from("brand_modules")
    .upsert(
      {
        brand_id,
        module_key,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "brand_id,module_key" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { brand_id, module_key, enabled } };
}

/** 新增一筆 user_assignment */
export async function createUserAssignmentAction(input: {
  user_id: string;
  role_id: string;
  scope_type: "group" | "brand" | "store";
  scope_id: string;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const { userId } = await getCurrentUserAndAdmin();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("user_assignments")
    .insert({
      user_id: input.user_id,
      role_id: input.role_id,
      scope_type: input.scope_type,
      scope_id: input.scope_id,
      granted_by: userId,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id } };
}

/** 建立新角色 */
export async function createRoleAction(input: {
  id: string;
  name: string;
  description?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const id = input.id.trim();
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    return { ok: false, error: "Role ID 只允許小寫英數與底線、開頭必須英文" };
  }
  if (!input.name.trim()) return { ok: false, error: "請填角色名稱" };

  const sb = createServiceClient();
  const { error } = await sb.from("roles").insert({
    id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    is_system: false,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Role ID「${id}」已存在` };
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

/** 更新角色（不允許改 id；is_system 不能被 unset） */
export async function updateRoleAction(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const sb = createServiceClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    if (!patch.name.trim()) return { ok: false, error: "角色名稱不可空" };
    update.name = patch.name.trim();
  }
  if (typeof patch.description !== "undefined") {
    update.description = patch.description?.trim() || null;
  }

  const { error } = await sb.from("roles").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

/** 刪除角色（system role 拒絕 / 有人使用拒絕） */
export async function deleteRoleAction(id: string): Promise<ActionResult<{ id: string }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const sb = createServiceClient();
  const { data: role } = await sb
    .from("roles")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if (!role) return { ok: false, error: "找不到此角色" };
  if (role.is_system) return { ok: false, error: "系統內建角色不可刪除" };

  const { count } = await sb
    .from("user_assignments")
    .select("*", { count: "exact", head: true })
    .eq("role_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `仍有 ${count} 筆授權使用此角色，請先撤銷` };
  }

  const { error } = await sb.from("roles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

/** 切換 role × permission 矩陣某一格 */
export async function setRolePermissionAction(
  role_id: string,
  permission_code: string,
  granted: boolean,
): Promise<ActionResult<{ role_id: string; permission_code: string; granted: boolean }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const sb = createServiceClient();
  if (granted) {
    const { error } = await sb
      .from("role_permissions")
      .upsert({ role_id, permission_code }, { onConflict: "role_id,permission_code" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await sb
      .from("role_permissions")
      .delete()
      .eq("role_id", role_id)
      .eq("permission_code", permission_code);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { role_id, permission_code, granted } };
}

/** 批次新增 user_assignment：一個 (user, role) 同時授予多個 scope */
export async function bulkCreateUserAssignmentsAction(input: {
  user_id: string;
  role_id: string;
  scopes: Array<{ scope_type: "group" | "brand" | "store"; scope_id: string }>;
  notes?: string | null;
}): Promise<ActionResult<{ inserted: number }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  if (!input.user_id?.trim()) return { ok: false, error: "user_id 必填" };
  if (!input.role_id?.trim()) return { ok: false, error: "role_id 必填" };
  if (!input.scopes?.length) return { ok: false, error: "至少要選一個作用域" };

  const { userId } = await getCurrentUserAndAdmin();
  const sb = createServiceClient();
  const rows = input.scopes.map((s) => ({
    user_id: input.user_id,
    role_id: input.role_id,
    scope_type: s.scope_type,
    scope_id: s.scope_id,
    granted_by: userId,
    notes: input.notes?.trim() || null,
  }));

  const { error } = await sb
    .from("user_assignments")
    .upsert(rows, { onConflict: "user_id,role_id,scope_type,scope_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { inserted: rows.length } };
}

/** 撤銷一個 user × role 在某 scope_type 下的所有授權（一鍵清整列） */
export async function revokeUserRoleScopeAction(
  user_id: string,
  role_id: string,
  scope_type: "group" | "brand" | "store",
): Promise<ActionResult<{ deleted: number }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const sb = createServiceClient();
  const { count, error } = await sb
    .from("user_assignments")
    .delete({ count: "exact" })
    .eq("user_id", user_id)
    .eq("role_id", role_id)
    .eq("scope_type", scope_type);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { deleted: count ?? 0 } };
}

/** 刪除一筆 user_assignment */
export async function deleteUserAssignmentAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const denyMsg = await requireAdmin();
  if (denyMsg) return { ok: false, error: denyMsg };

  const sb = createServiceClient();
  const { error } = await sb.from("user_assignments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}
