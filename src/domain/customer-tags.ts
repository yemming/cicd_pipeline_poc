"use server";

/**
 * Domain Helper — 客群標籤管理（銷售端 RS_SET2）
 *
 * 涵蓋兩張字典表：
 *   - customer_tags（官方標籤字典；本頁唯讀，主管維護端在售後 12）
 *   - customer_personal_tags（RS 個人自訂字典；本頁主要 CRUD）
 *
 * 提案：docs/proposals/feature-sales-customer-tags.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserDepartment } from "@/lib/rbac/department";

import {
  PERSONAL_TAG_LIMIT,
  TAG_COLOR_EMOJI,
  TREND_HOT_THRESHOLD,
  TREND_RISING_THRESHOLD,
  type TagColor,
  type TagKind,
} from "./customer-tags.constants";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type OfficialTag = {
  id: string;
  brand_id: string;
  code: string | null;
  label: string;
  color: TagColor;
  emoji: string | null;
  description: string | null;
  is_active: boolean;
  /** C-27 主管鎖定：true 時非主管不可修改 / 刪除此官方標籤 */
  is_locked: boolean;
  sort_order: number;
  /** 與 customer_tags.usage_count 對映；assignments 表落地前由人工 / batch update 維護 */
  usage_count: number;
  /** 標籤分類：official = 主管維護；system_auto = 系統規則自動貼 */
  tag_kind: TagKind;
  /** 系統自動標籤的規則描述（metadata.rule） */
  rule: string | null;
  /** 近 7 天每天新增套用次數（metadata.sparkline_7d；用於 KPI sparkline） */
  sparkline_7d: number[];
  /** 暫保留：舊 callsite 用 .usage；指向 usage_count */
  usage: number;
};

export type TagVisibility = "owner_only" | "department" | "cross_department";

export type PersonalTag = {
  id: string;
  brand_id: string;
  owner_id: string;
  name: string;
  color: TagColor;
  note: string | null;
  is_active: boolean;
  use_count: number;
  visibility: TagVisibility;
  created_at: string;
  updated_at: string;
};

function isValidVisibility(v: unknown): v is TagVisibility {
  return v === "owner_only" || v === "department" || v === "cross_department";
}

export type BrandAggregatedTag = {
  /** 同 (color, name) 視為一個聚合條目 */
  name: string;
  color: TagColor;
  /** 全 brand 累計使用次數（sum of use_count） */
  total_use: number;
  /** 使用此標籤的 RS 顯示名稱清單 */
  rs_users: Array<{ id: string; display_name: string }>;
  /** trend 標籤 — 由 total_use 衍生 */
  trend: "hot" | "rising" | "normal";
};

export type PersonalTagInput = {
  name: string;
  color: TagColor;
  note?: string | null;
  /** P-08：tag 可見範圍，預設 owner_only */
  visibility?: TagVisibility;
};

const REVALIDATE_PATHS = [
  "/sales/settings/customer-tags",
  "/parts/aftersales/management/customer-tags",
];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "標籤名稱重複";
  if (error.code === "23503") return "參照的關聯不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

function isValidColor(c: unknown): c is TagColor {
  return c === "red" || c === "yellow" || c === "green" || c === "blue";
}

function isValidKind(k: unknown): k is TagKind {
  return k === "official" || k === "system_auto";
}

type RawOfficialTagRow = {
  id: string;
  brand_id: string;
  code: string | null;
  label: string;
  color: string;
  emoji: string | null;
  description: string | null;
  is_active: boolean;
  is_locked: boolean | null;
  sort_order: number;
  usage_count: number | null;
  tag_kind: string | null;
  metadata: Record<string, unknown> | null;
};

function rowToOfficialTag(r: RawOfficialTagRow): OfficialTag {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const spark = Array.isArray(meta.sparkline_7d) ? (meta.sparkline_7d as unknown[]) : [];
  const sparkline_7d = spark
    .map((v) => (typeof v === "number" ? v : Number(v) || 0))
    .slice(0, 7);
  while (sparkline_7d.length < 7) sparkline_7d.push(0);
  return {
    id: r.id,
    brand_id: r.brand_id,
    code: r.code,
    label: r.label,
    color: r.color as TagColor,
    emoji: r.emoji,
    description: r.description,
    is_active: r.is_active,
    is_locked: Boolean(r.is_locked),
    sort_order: r.sort_order,
    usage_count: r.usage_count ?? 0,
    tag_kind: (isValidKind(r.tag_kind) ? r.tag_kind : "official") as TagKind,
    rule: typeof meta.rule === "string" ? (meta.rule as string) : null,
    sparkline_7d,
    usage: r.usage_count ?? 0,
  };
}

function deriveTrend(totalUse: number): "hot" | "rising" | "normal" {
  if (totalUse >= TREND_HOT_THRESHOLD) return "hot";
  if (totalUse >= TREND_RISING_THRESHOLD) return "rising";
  return "normal";
}

// ──────────────────────────────────────────────────────────────────────────
// 官方標籤字典（read-only from 本頁）
// ──────────────────────────────────────────────────────────────────────────

export async function listOfficialTags(): Promise<OfficialTag[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customer_tags")
    .select(
      "id, brand_id, code, label, color, emoji, description, is_active, is_locked, sort_order, usage_count, tag_kind, metadata",
    )
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("color")
    .order("sort_order");
  if (error) throw error;
  return ((data ?? []) as unknown as RawOfficialTagRow[]).map(rowToOfficialTag);
}

// ──────────────────────────────────────────────────────────────────────────
// 個人自訂標籤字典（owner CRUD）
// ──────────────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error("尚未登入");
  }
  return { supabase, user: data.user };
}

export async function listMyPersonalTags(): Promise<PersonalTag[]> {
  const { supabase, user } = await requireUser();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customer_personal_tags")
    .select("id, brand_id, owner_id, name, color, note, is_active, use_count, visibility, created_at, updated_at")
    .eq("brand_id", scope.brand_id)
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .order("color")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PersonalTag[]).map((r) => ({
    ...r,
    color: r.color as TagColor,
    visibility: isValidVisibility(r.visibility) ? r.visibility : "owner_only",
  }));
}

export async function createPersonalTag(input: PersonalTagInput): Promise<Result<{ id: string }>> {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "標籤名稱不可空白" };
  if (name.length > 20) return { ok: false, error: "標籤名稱最多 20 字" };
  if (!isValidColor(input.color)) return { ok: false, error: "顏色分類不合法" };

  const { supabase, user } = await requireUser();
  const scope = await getActiveScope();

  // 上限檢查（HTML hard-code 5）
  const { count } = await supabase
    .from("customer_personal_tags")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", scope.brand_id)
    .eq("owner_id", user.id)
    .eq("is_active", true);
  if ((count ?? 0) >= PERSONAL_TAG_LIMIT) {
    return { ok: false, error: `已達自訂標籤上限 ${PERSONAL_TAG_LIMIT} 個，請先刪除不用的標籤` };
  }

  const visibility: TagVisibility = isValidVisibility(input.visibility)
    ? input.visibility
    : "owner_only";

  const { data, error } = await supabase
    .from("customer_personal_tags")
    .insert({
      brand_id: scope.brand_id,
      owner_id: user.id,
      name,
      color: input.color,
      note: input.note?.trim() || null,
      visibility,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updatePersonalTag(
  id: string,
  patch: { name?: string; color?: TagColor; note?: string | null; visibility?: TagVisibility },
): Promise<Result<{ id: string }>> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) return { ok: false, error: "標籤名稱不可空白" };
    if (v.length > 20) return { ok: false, error: "標籤名稱最多 20 字" };
    update.name = v;
  }
  if (patch.color !== undefined) {
    if (!isValidColor(patch.color)) return { ok: false, error: "顏色分類不合法" };
    update.color = patch.color;
  }
  if (patch.note !== undefined) update.note = patch.note?.trim() || null;
  if (patch.visibility !== undefined) {
    if (!isValidVisibility(patch.visibility))
      return { ok: false, error: "可見範圍不合法" };
    update.visibility = patch.visibility;
  }
  if (Object.keys(update).length === 0) return { ok: true, data: { id } };
  update.updated_at = new Date().toISOString();

  const { supabase, user } = await requireUser();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("customer_personal_tags")
    .update(update)
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: mapDbError(error, "更新失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deletePersonalTag(id: string): Promise<Result<{ id: string }>> {
  const { supabase, user } = await requireUser();
  const scope = await getActiveScope();
  // 軟刪除（is_active=false）— 對齊 HTML 文案「已貼客戶不受影響」
  const { error } = await supabase
    .from("customer_personal_tags")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: mapDbError(error, "刪除失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// 主管觀察視角（全 brand 聚合）
// ──────────────────────────────────────────────────────────────────────────

export async function listBrandPersonalTagsAggregated(): Promise<BrandAggregatedTag[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取 brand 全部 active 個人標籤 + owner 姓名
  const { data, error } = await supabase
    .from("customer_personal_tags")
    .select("name, color, use_count, owner_id, profiles!customer_personal_tags_owner_id_fkey(id, name)")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (error) {
    // FK 名稱猜不到時退化成不 join、只回 id
    const fallback = await supabase
      .from("customer_personal_tags")
      .select("name, color, use_count, owner_id")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true);
    if (fallback.error) throw fallback.error;
    return aggregateRows(
      (fallback.data ?? []).map((r) => ({
        name: r.name as string,
        color: r.color as TagColor,
        use_count: r.use_count as number,
        owner_id: r.owner_id as string,
        owner_name: null,
      })),
    );
  }

  type Row = {
    name: string;
    color: string;
    use_count: number;
    owner_id: string;
    profiles?: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  return aggregateRows(
    rows.map((r) => {
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        name: r.name,
        color: r.color as TagColor,
        use_count: r.use_count,
        owner_id: r.owner_id,
        owner_name: profile?.name ?? null,
      };
    }),
  );
}

function aggregateRows(
  rows: Array<{ name: string; color: TagColor; use_count: number; owner_id: string; owner_name: string | null }>,
): BrandAggregatedTag[] {
  const map = new Map<string, BrandAggregatedTag>();
  for (const r of rows) {
    const key = `${r.color}::${r.name}`;
    const display = r.owner_name?.trim() || `用戶 ${r.owner_id.slice(0, 6)}`;
    const entry = map.get(key);
    if (entry) {
      entry.total_use += r.use_count;
      if (!entry.rs_users.find((u) => u.id === r.owner_id)) {
        entry.rs_users.push({ id: r.owner_id, display_name: display });
      }
    } else {
      map.set(key, {
        name: r.name,
        color: r.color,
        total_use: r.use_count,
        rs_users: [{ id: r.owner_id, display_name: display }],
        trend: "normal",
      });
    }
  }
  return Array.from(map.values())
    .map((entry) => ({ ...entry, trend: deriveTrend(entry.total_use) }))
    .sort((a, b) => b.total_use - a.total_use);
}

// ──────────────────────────────────────────────────────────────────────────
// 一站撈 page 所需全部資料
// ──────────────────────────────────────────────────────────────────────────

export async function getCustomerTagsPageData(): Promise<{
  officialTags: OfficialTag[];
  myTags: PersonalTag[];
  brandAggregated: BrandAggregatedTag[];
  currentUserId: string;
  brandId: string;
}> {
  const { user } = await requireUser();
  const scope = await getActiveScope();
  const [officialTags, myTags, brandAggregated] = await Promise.all([
    listOfficialTags(),
    listMyPersonalTags(),
    listBrandPersonalTagsAggregated(),
  ]);
  return { officialTags, myTags, brandAggregated, currentUserId: user.id, brandId: scope.brand_id };
}

// ──────────────────────────────────────────────────────────────────────────
// 使用統計 — placeholder helper（assignments 表尚未建）
// ──────────────────────────────────────────────────────────────────────────

export async function listUsageStat(): Promise<
  Array<{ name: string; color: TagColor; emoji: string; usage: number; kind: "official" | "personal" }>
> {
  const [official, personal] = await Promise.all([listOfficialTags(), listMyPersonalTags()]);
  const combined: Array<{ name: string; color: TagColor; emoji: string; usage: number; kind: "official" | "personal" }> = [
    ...official.map((t) => ({
      name: t.label,
      color: t.color,
      emoji: t.emoji ?? TAG_COLOR_EMOJI[t.color],
      usage: t.usage,
      kind: "official" as const,
    })),
    ...personal.map((t) => ({
      name: t.name,
      color: t.color,
      emoji: TAG_COLOR_EMOJI[t.color],
      usage: t.use_count,
      kind: "personal" as const,
    })),
  ];
  return combined.sort((a, b) => b.usage - a.usage).slice(0, 15);
}

// ──────────────────────────────────────────────────────────────────────────
// 主管端 — 官方標籤 CRUD（售後主管工作檯 → 客群標籤）
// ──────────────────────────────────────────────────────────────────────────

export type OfficialTagInput = {
  label: string;
  color: TagColor;
  description?: string | null;
  tag_kind?: TagKind;
  /** 系統自動標籤的規則描述（會寫入 metadata.rule） */
  rule?: string | null;
};

/** 含 inactive；主管頁要看到全部、能切啟用狀態 */
export async function listAllOfficialTags(): Promise<OfficialTag[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("customer_tags")
    .select(
      "id, brand_id, code, label, color, emoji, description, is_active, is_locked, sort_order, usage_count, tag_kind, metadata",
    )
    .eq("brand_id", scope.brand_id)
    .order("tag_kind", { ascending: true })
    .order("color")
    .order("sort_order");
  if (error) throw error;
  return ((data ?? []) as unknown as RawOfficialTagRow[]).map(rowToOfficialTag);
}


// ── C-27 主管鎖定 ──────────────────────────────────────────────────────────

/** 是否有權鎖定 / 解鎖、或修改被鎖官方標籤（部門主管 or 跨部門 admin） */
async function canManageOfficialTagLocks(): Promise<boolean> {
  const dept = await getCurrentUserDepartment();
  return dept.is_dept_manager || dept.is_cross_admin;
}

/** 給 UI：目前使用者是否可管理鎖定（顯示鎖 / 解鎖鈕、可編輯被鎖標籤） */
export async function getCanManageOfficialTagLocks(): Promise<boolean> {
  return canManageOfficialTagLocks();
}

/** 被鎖且非主管 → 拒絕。供 update / setActive / delete 共用守門。 */
async function assertOfficialTagMutable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  id: string,
): Promise<Result<true>> {
  const { data } = await supabase
    .from("customer_tags")
    .select("is_locked")
    .eq("id", id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (data?.is_locked && !(await canManageOfficialTagLocks())) {
    return { ok: false, error: "此標籤已由主管鎖定，僅主管可修改 / 刪除" };
  }
  return { ok: true, data: true };
}

/** 主管鎖定 / 解鎖官方標籤字典條目 */
export async function setOfficialTagLocked(
  id: string,
  locked: boolean,
): Promise<Result<{ id: string }>> {
  if (!(await canManageOfficialTagLocks())) {
    return { ok: false, error: "只有主管可以鎖定 / 解鎖官方標籤" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("customer_tags")
    .update({ is_locked: locked, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "鎖定狀態切換失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function createOfficialTag(
  input: OfficialTagInput,
): Promise<Result<{ id: string }>> {
  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "標籤文字不可空白" };
  if (label.length > 20) return { ok: false, error: "標籤文字最多 20 字" };
  if (!isValidColor(input.color)) return { ok: false, error: "顏色分類不合法" };

  const { supabase, user } = await requireUser();
  const scope = await getActiveScope();

  // 算下一個 sort_order：同色目前最大 +1
  const { data: maxRow } = await supabase
    .from("customer_tags")
    .select("sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("color", input.color)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 1;

  const tagKind: TagKind = isValidKind(input.tag_kind) ? input.tag_kind : "official";
  const ruleText = input.rule?.trim() ?? "";
  const metadata: Record<string, unknown> = { sparkline_7d: [0, 0, 0, 0, 0, 0, 0] };
  if (tagKind === "system_auto" && ruleText) metadata.rule = ruleText;

  const { data, error } = await supabase
    .from("customer_tags")
    .insert({
      brand_id: scope.brand_id,
      label,
      color: input.color,
      emoji: TAG_COLOR_EMOJI[input.color],
      description: input.description?.trim() || null,
      tag_kind: tagKind,
      sort_order: nextSort,
      created_by: user.id,
      metadata,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateOfficialTag(
  id: string,
  patch: { label?: string; color?: TagColor; description?: string | null; tag_kind?: TagKind; rule?: string | null },
): Promise<Result<{ id: string }>> {
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const v = patch.label.trim();
    if (!v) return { ok: false, error: "標籤文字不可空白" };
    if (v.length > 20) return { ok: false, error: "標籤文字最多 20 字" };
    update.label = v;
  }
  if (patch.color !== undefined) {
    if (!isValidColor(patch.color)) return { ok: false, error: "顏色分類不合法" };
    update.color = patch.color;
    update.emoji = TAG_COLOR_EMOJI[patch.color];
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.tag_kind !== undefined) {
    if (!isValidKind(patch.tag_kind)) return { ok: false, error: "標籤分類不合法" };
    update.tag_kind = patch.tag_kind;
  }
  const noPatch = Object.keys(update).length === 0 && patch.rule === undefined;
  if (noPatch) return { ok: true, data: { id } };
  update.updated_at = new Date().toISOString();

  const supabase = await createClient();
  const scope = await getActiveScope();

  // C-27：被鎖標籤僅主管可改
  const lockGuard = await assertOfficialTagMutable(supabase, scope.brand_id, id);
  if (!lockGuard.ok) return lockGuard;

  // 更新 rule（merge into metadata.rule）— 走第二次 update 走 jsonb_set
  if (patch.rule !== undefined) {
    const { data: existing, error: readErr } = await supabase
      .from("customer_tags")
      .select("metadata")
      .eq("id", id)
      .eq("brand_id", scope.brand_id)
      .maybeSingle();
    if (readErr) return { ok: false, error: mapDbError(readErr, "更新失敗") };
    const meta = (existing?.metadata as Record<string, unknown> | null) ?? {};
    const ruleText = patch.rule?.trim() ?? "";
    if (ruleText) meta.rule = ruleText;
    else delete meta.rule;
    update.metadata = meta;
  }

  const { error } = await supabase
    .from("customer_tags")
    .update(update)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "更新失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setOfficialTagActive(
  id: string,
  active: boolean,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  // C-27：被鎖標籤僅主管可改啟用狀態
  const lockGuard = await assertOfficialTagMutable(supabase, scope.brand_id, id);
  if (!lockGuard.ok) return lockGuard;
  const { error } = await supabase
    .from("customer_tags")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "切換狀態失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deleteOfficialTag(id: string): Promise<Result<{ id: string }>> {
  // 硬刪：HTML 設計稿就是直接 splice。已使用客戶不影響（assignments 表尚未建）。
  const supabase = await createClient();
  const scope = await getActiveScope();
  // C-27：被鎖標籤僅主管可刪
  const lockGuard = await assertOfficialTagMutable(supabase, scope.brand_id, id);
  if (!lockGuard.ok) return lockGuard;
  const { error } = await supabase
    .from("customer_tags")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "刪除失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}
