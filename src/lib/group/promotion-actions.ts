"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { revalidatePath } from "next/cache";

/**
 * GRP13 促銷活動管理 — server actions（Result 型別、不 redirect）
 *
 * 寫入一律走 service client + admin gate（business_rules 沒有 user INSERT/UPDATE policy）。
 * reads 在 domain/group-promotions.ts 走 createClient（RLS user_has_brand 已 scope）。
 *
 * 狀態機：draft → review → approved(active/scheduled) → ended → archived
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PromoPosterInput = {
  title: string;
  discount_label: string;
  subtitle: string;
  template: string;
  detail_html: string;
};

export type PromoCampaignInput = {
  brand_id: string;
  name: string;
  promo_type: string;
  start_date?: string | null;
  end_date?: string | null;
  disc_min?: number | null;
  disc_max?: number | null;
  stores?: string[];
  owner?: string | null;
  poster?: Partial<PromoPosterInput>;
};

async function requireAdmin(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; error: string }
> {
  const { userId, isAdmin, email } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };
  if (!isAdmin) return { ok: false, error: "需要管理員權限" };
  return { ok: true, userId, email: email ?? "" };
}

function mapError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("duplicate") || msg.includes("23505")) return "已存在相同活動";
  return msg || "操作失敗";
}

function validate(input: PromoCampaignInput): string | null {
  if (!input.name?.trim()) return "請填寫活動名稱";
  const min = input.disc_min;
  const max = input.disc_max;
  if (min != null && max != null && min > max) return "折扣下限不得高於上限";
  if (input.start_date && input.end_date && input.start_date > input.end_date)
    return "活動開始日不得晚於結束日";
  return null;
}

function buildPoster(p?: Partial<PromoPosterInput>) {
  return {
    title: p?.title ?? "",
    discount_label: p?.discount_label ?? "",
    subtitle: p?.subtitle ?? "",
    template: p?.template ?? "warm",
    detail_html: p?.detail_html ?? "",
  };
}

/** 建立促銷活動（status=draft） */
export async function createPromoCampaign(
  input: PromoCampaignInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const verr = validate(input);
  if (verr) return { ok: false, error: verr };

  const sb = createServiceClient();
  const now = new Date().toISOString();

  const config = {
    status: "draft",
    promo_type: input.promo_type,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    disc_min: input.disc_min ?? null,
    disc_max: input.disc_max ?? null,
    stores: input.stores ?? [],
    owner: input.owner ?? null,
    contrib_nt: null,
    exec_count: 0,
    poster: buildPoster(input.poster),
    audit_log: [{ action: "created", by: auth.email, at: now }],
  };

  // id 交給 DB gen_random_uuid() 預設（不用 crypto.randomUUID — runtime 可能無 global crypto）
  const { data, error } = await sb
    .from("business_rules")
    .insert({
      brand_id: input.brand_id,
      rule_kind: "promo_campaign",
      config,
      metadata: { name: input.name.trim(), _seed: "round21-promotions" },
      is_active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapError(error) };
  revalidatePath("/group/promotions");
  return { ok: true, data: { id: data.id } };
}

/** 更新活動 */
export async function updatePromoCampaign(
  id: string,
  patch: Partial<PromoCampaignInput>,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const verr = validate({ ...patch, name: patch.name ?? "x" } as PromoCampaignInput);
  if (verr) return { ok: false, error: verr };

  const sb = createServiceClient();
  const { data: existing, error: readErr } = await sb
    .from("business_rules")
    .select("config, metadata")
    .eq("id", id)
    .single();
  if (readErr) return { ok: false, error: mapError(readErr) };

  const prevConfig = (existing?.config as Record<string, unknown>) ?? {};
  const prevMeta = (existing?.metadata as Record<string, unknown>) ?? {};
  const prevAudit = Array.isArray(prevConfig.audit_log) ? prevConfig.audit_log : [];
  const prevPoster = (prevConfig.poster as Record<string, unknown>) ?? {};
  const now = new Date().toISOString();

  const nextConfig: Record<string, unknown> = {
    ...prevConfig,
    ...(patch.promo_type !== undefined ? { promo_type: patch.promo_type } : {}),
    ...(patch.start_date !== undefined ? { start_date: patch.start_date } : {}),
    ...(patch.end_date !== undefined ? { end_date: patch.end_date } : {}),
    ...(patch.disc_min !== undefined ? { disc_min: patch.disc_min } : {}),
    ...(patch.disc_max !== undefined ? { disc_max: patch.disc_max } : {}),
    ...(patch.stores !== undefined ? { stores: patch.stores } : {}),
    ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
    ...(patch.poster !== undefined
      ? { poster: { ...prevPoster, ...patch.poster } }
      : {}),
    audit_log: [...prevAudit, { action: "updated", by: auth.email, at: now }],
  };

  const nextMeta = patch.name !== undefined ? { ...prevMeta, name: patch.name.trim() } : prevMeta;

  const { error } = await sb
    .from("business_rules")
    .update({ config: nextConfig, metadata: nextMeta, updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: mapError(error) };
  revalidatePath("/group/promotions");
  return { ok: true, data: { id } };
}

/** 送審 */
export async function submitPromoForReview(id: string): Promise<ActionResult<{ id: string }>> {
  return appendStatus(id, "review", "submitted_for_review");
}

/** 核准上架（依開始日推導 active / scheduled，落地時計算一次） */
export async function approvePromo(id: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const sb = createServiceClient();
  const { data: existing, error: readErr } = await sb
    .from("business_rules")
    .select("config")
    .eq("id", id)
    .single();
  if (readErr) return { ok: false, error: mapError(readErr) };
  const prevConfig = (existing?.config as Record<string, unknown>) ?? {};
  const startDate = (prevConfig.start_date as string) ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const status = startDate && startDate > today ? "scheduled" : "active";
  return appendStatus(id, status, "approved");
}

/** 緊急下架 */
export async function takedownPromo(id: string): Promise<ActionResult<{ id: string }>> {
  return appendStatus(id, "ended", "ended");
}

/** 封存 */
export async function archivePromo(id: string): Promise<ActionResult<{ id: string }>> {
  return appendStatus(id, "archived", "archived");
}

async function appendStatus(
  id: string,
  status: string,
  action: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const sb = createServiceClient();
  const { data: existing, error: readErr } = await sb
    .from("business_rules")
    .select("config")
    .eq("id", id)
    .single();
  if (readErr) return { ok: false, error: mapError(readErr) };

  const prevConfig = (existing?.config as Record<string, unknown>) ?? {};
  const prevAudit = Array.isArray(prevConfig.audit_log) ? prevConfig.audit_log : [];
  const now = new Date().toISOString();

  const nextConfig = {
    ...prevConfig,
    status,
    audit_log: [...prevAudit, { action, by: auth.email, at: now }],
  };

  const { error } = await sb
    .from("business_rules")
    .update({ config: nextConfig, is_active: status !== "archived", updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: mapError(error) };
  revalidatePath("/group/promotions");
  return { ok: true, data: { id } };
}

/** 刪除 */
export async function deletePromoCampaign(id: string): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const sb = createServiceClient();
  const { error } = await sb.from("business_rules").delete().eq("id", id);
  if (error) return { ok: false, error: mapError(error) };
  revalidatePath("/group/promotions");
  return { ok: true, data: { id } };
}
