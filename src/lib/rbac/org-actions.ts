"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type OrgActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) return "需要 admin 權限";
  return null;
}

const ID_RE = /^[a-z][a-z0-9_-]*$/;

// ────────────────────────────────────── Groups ──────────────────────────────────────

export async function createGroupAction(input: {
  id: string;
  name: string;
  short_name?: string | null;
}): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const id = input.id.trim();
  if (!ID_RE.test(id)) return { ok: false, error: "ID 只允許小寫英數、底線、連字號；開頭必為英文" };
  if (!input.name.trim()) return { ok: false, error: "名稱必填" };

  const sb = createServiceClient();
  const { error } = await sb.from("groups").insert({
    id,
    name: input.name.trim(),
    short_name: input.short_name?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Group ID「${id}」已存在` };
    return { ok: false, error: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

export async function updateGroupAction(
  id: string,
  patch: { name?: string; short_name?: string | null },
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    if (!patch.name.trim()) return { ok: false, error: "名稱不可空" };
    update.name = patch.name.trim();
  }
  if (typeof patch.short_name !== "undefined") {
    update.short_name = patch.short_name?.trim() || null;
  }

  const sb = createServiceClient();
  const { error } = await sb.from("groups").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

export async function deleteGroupAction(
  id: string,
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  // 檢查有沒有 organizations / group_brands / user_assignments 在用
  const [{ count: orgsCount }, { count: gbCount }, { count: uaCount }] = await Promise.all([
    sb.from("organizations").select("*", { count: "exact", head: true }).eq("group_id", id),
    sb.from("group_brands").select("*", { count: "exact", head: true }).eq("group_id", id),
    sb
      .from("user_assignments")
      .select("*", { count: "exact", head: true })
      .eq("scope_type", "group")
      .eq("scope_id", id),
  ]);
  if ((orgsCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${orgsCount} 個門店歸屬此集團，請先轉移` };
  if ((gbCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${gbCount} 個品牌代理權，請先解除` };
  if ((uaCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${uaCount} 筆使用者授權使用此集團，請先撤銷` };

  const { error } = await sb.from("groups").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

// ────────────────────────────────────── Brands ──────────────────────────────────────

export async function createBrandAction(input: {
  id: string;
  name: string;
  manufacturer?: string | null;
  group_ids?: string[];
}): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const id = input.id.trim();
  if (!ID_RE.test(id)) return { ok: false, error: "ID 只允許小寫英數、底線、連字號" };
  if (!input.name.trim()) return { ok: false, error: "名稱必填" };

  const sb = createServiceClient();
  const { error } = await sb.from("brands").insert({
    id,
    name: input.name.trim(),
    manufacturer: input.manufacturer?.trim() || null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Brand ID「${id}」已存在` };
    return { ok: false, error: error.message };
  }

  // 同步建立 group_brands；無代理集團時略過
  if (input.group_ids && input.group_ids.length > 0) {
    const rows = input.group_ids.map((gid) => ({ group_id: gid, brand_id: id }));
    await sb.from("group_brands").insert(rows);
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

export async function updateBrandAction(
  id: string,
  patch: { name?: string; manufacturer?: string | null; group_ids?: string[] },
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    if (!patch.name.trim()) return { ok: false, error: "名稱不可空" };
    update.name = patch.name.trim();
  }
  if (typeof patch.manufacturer !== "undefined") {
    update.manufacturer = patch.manufacturer?.trim() || null;
  }
  if (Object.keys(update).length > 1) {
    const { error } = await sb.from("brands").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  // group_brands diff
  if (Array.isArray(patch.group_ids)) {
    const target = new Set(patch.group_ids);
    const { data: existing } = await sb
      .from("group_brands")
      .select("group_id")
      .eq("brand_id", id);
    const current = new Set((existing ?? []).map((r) => r.group_id));

    const toAdd = [...target].filter((g) => !current.has(g));
    const toRemove = [...current].filter((g) => !target.has(g));

    if (toAdd.length > 0) {
      await sb
        .from("group_brands")
        .insert(toAdd.map((g) => ({ group_id: g, brand_id: id })));
    }
    if (toRemove.length > 0) {
      await sb
        .from("group_brands")
        .delete()
        .eq("brand_id", id)
        .in("group_id", toRemove);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

export async function deleteBrandAction(
  id: string,
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const [{ count: orgsCount }, { count: uaCount }] = await Promise.all([
    sb.from("organizations").select("*", { count: "exact", head: true }).eq("brand_id", id),
    sb
      .from("user_assignments")
      .select("*", { count: "exact", head: true })
      .eq("scope_type", "brand")
      .eq("scope_id", id),
  ]);
  if ((orgsCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${orgsCount} 個門店歸屬此品牌` };
  if ((uaCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${uaCount} 筆使用者授權使用此品牌` };

  const { error } = await sb.from("brands").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

// ────────────────────────────────────── Stores（organizations 表）──────────────────────────────────────

const STORE_CODE_RE = /^[A-Z0-9_-]+$/;

export async function createStoreAction(input: {
  brand_id: string;
  group_id: string;
  code: string;
  name: string;
  short_name?: string | null;
  parent_id?: string | null;
  type?: "region" | "store";
  level?: number;
  brand_ids?: string[]; // 若是複合店要打多 brand 進 store_brands
}): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const code = input.code.trim().toUpperCase();
  if (!STORE_CODE_RE.test(code)) {
    return { ok: false, error: "店碼只允許大寫英數、底線、連字號" };
  }
  if (!input.name.trim()) return { ok: false, error: "店名必填" };

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("organizations")
    .insert({
      brand_id: input.brand_id,
      group_id: input.group_id,
      code,
      name: input.name.trim(),
      short_name: input.short_name?.trim() || null,
      parent_id: input.parent_id ?? null,
      type: input.type ?? "store",
      level: input.level ?? 2,
      is_active: true,
      external_source: "manual",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `店碼「${code}」已存在` };
    return { ok: false, error: error.message };
  }

  // 主 brand + 額外 brand_ids 一起寫進 store_brands
  const brandsToLink = new Set<string>([input.brand_id, ...(input.brand_ids ?? [])]);
  await sb
    .from("store_brands")
    .insert([...brandsToLink].map((b) => ({ store_id: data.id, brand_id: b })));

  revalidatePath("/", "layout");
  return { ok: true, data: { id: data.id } };
}

export async function updateStoreAction(
  id: string,
  patch: {
    name?: string;
    short_name?: string | null;
    code?: string;
    brand_id?: string;
    group_id?: string;
    parent_id?: string | null;
    is_active?: boolean;
    brand_ids?: string[]; // 完整覆蓋 store_brands
  },
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.name === "string") {
    if (!patch.name.trim()) return { ok: false, error: "店名不可空" };
    update.name = patch.name.trim();
  }
  if (typeof patch.short_name !== "undefined")
    update.short_name = patch.short_name?.trim() || null;
  if (typeof patch.code === "string") {
    const c = patch.code.trim().toUpperCase();
    if (!STORE_CODE_RE.test(c)) return { ok: false, error: "店碼格式不合" };
    update.code = c;
  }
  if (typeof patch.brand_id === "string") update.brand_id = patch.brand_id;
  if (typeof patch.group_id === "string") update.group_id = patch.group_id;
  if (typeof patch.parent_id !== "undefined") update.parent_id = patch.parent_id;
  if (typeof patch.is_active === "boolean") update.is_active = patch.is_active;

  if (Object.keys(update).length > 1) {
    const { error } = await sb.from("organizations").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  if (Array.isArray(patch.brand_ids)) {
    const target = new Set(patch.brand_ids);
    const { data: existing } = await sb
      .from("store_brands")
      .select("brand_id")
      .eq("store_id", id);
    const current = new Set((existing ?? []).map((r) => r.brand_id));

    const toAdd = [...target].filter((b) => !current.has(b));
    const toRemove = [...current].filter((b) => !target.has(b));

    if (toAdd.length > 0) {
      await sb
        .from("store_brands")
        .insert(toAdd.map((b) => ({ store_id: id, brand_id: b })));
    }
    if (toRemove.length > 0) {
      await sb
        .from("store_brands")
        .delete()
        .eq("store_id", id)
        .in("brand_id", toRemove);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}

export async function deleteStoreAction(
  id: string,
): Promise<OrgActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();

  // 子節點檢查
  const { count: childCount } = await sb
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("parent_id", id);
  if ((childCount ?? 0) > 0)
    return { ok: false, error: `此節點下還有 ${childCount} 個子組織，請先移除` };

  const { count: uaCount } = await sb
    .from("user_assignments")
    .select("*", { count: "exact", head: true })
    .eq("scope_type", "store")
    .eq("scope_id", id);
  if ((uaCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${uaCount} 筆使用者授權鎖在此店，請先撤銷` };

  // store_brands ON DELETE CASCADE 會自動清；organizations 也可直接 delete
  const { error } = await sb.from("organizations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: { id } };
}
