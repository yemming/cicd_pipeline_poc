"use server";

/**
 * Domain Helper — 法律合約文字可配置範本（legal_text_templates）
 *
 * 核心函式：
 *   getActiveLegalText(docKey)   — 讀取當前 brand active 版（供前端合約/條款頁嵌入）
 *   listLegalTexts()             — 列出當前 brand 全部版本（admin list 用）
 *   upsertLegalText(input)       — 更新內容：自動 version+1、舊版 is_active=false、新版 is_active=true
 *
 * 版本機制：
 *   每次 upsert 都 INSERT 新 row（version+1）而非 UPDATE 既有 row。
 *   舊版透過 partial unique index (brand_id, doc_key) where is_active 保證只有一個 active。
 *   歷史版本保留供查閱（is_active=false）。
 */

import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { writeAuditLog } from "@/domain/audit-logs";

// ─────────────────────────────────────────────────────────────────────────────
// 型別（不 re-export 非 async；type 走 .constants.ts）
// ─────────────────────────────────────────────────────────────────────────────

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type LegalTextRow = {
  id: string;
  brand_id: string;
  doc_key: string;
  title: string | null;
  content: string;
  version: number;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type LegalTextUpsertInput = {
  doc_key: string;
  title?: string | null;
  content: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 讀取
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 讀取當前 brand 的 active 版本。
 * 供前端合約頁、條款嵌入用 — 不需任何 permission（任何已登入用戶都能讀）。
 */
export async function getActiveLegalText(docKey: string): Promise<LegalTextRow | null> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("legal_text_templates")
    .select("*")
    .eq("brand_id", brand_id)
    .eq("doc_key", docKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[legal-texts] getActiveLegalText error:", error.message);
    return null;
  }
  return data ? (data as LegalTextRow) : null;
}

/**
 * 列出當前 brand 的全部版本（admin list 頁用）。
 * 依 doc_key + version desc 排序，active 版浮上來。
 */
export async function listLegalTexts(): Promise<LegalTextRow[]> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("legal_text_templates")
    .select("*")
    .eq("brand_id", brand_id)
    .order("doc_key", { ascending: true })
    .order("version", { ascending: false });

  if (error) {
    console.error("[legal-texts] listLegalTexts error:", error.message);
    throw new Error(`listLegalTexts failed: ${error.message}`);
  }

  return (data ?? []) as LegalTextRow[];
}

/**
 * 列出特定 doc_key 的所有歷史版本（版本記錄 panel 用）。
 */
export async function listLegalTextHistory(docKey: string): Promise<LegalTextRow[]> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("legal_text_templates")
    .select("*")
    .eq("brand_id", brand_id)
    .eq("doc_key", docKey)
    .order("version", { ascending: false });

  if (error) {
    console.error("[legal-texts] listLegalTextHistory error:", error.message);
    return [];
  }
  return (data ?? []) as LegalTextRow[];
}

/**
 * 依 id 讀取一筆（含歷史版本；detail view 用）。
 */
export async function getLegalTextById(id: string): Promise<LegalTextRow | null> {
  const supabase = await createClient();
  const { brand_id } = await getActiveScope();

  const { data, error } = await supabase
    .from("legal_text_templates")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand_id)
    .maybeSingle();

  if (error) {
    console.error("[legal-texts] getLegalTextById error:", error.message);
    return null;
  }
  return data ? (data as LegalTextRow) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 寫入
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 更新法律文字範本。
 *
 * 版本機制：
 *   1. 讀目前 active 版取得最高 version number。
 *   2. 把現有 active 版設為 is_active=false。
 *   3. INSERT 新版（version+1, is_active=true）。
 *   4. 寫 audit_log（after()，非阻塞）。
 */
export async function upsertLegalText(
  input: LegalTextUpsertInput,
): Promise<Result<{ id: string; version: number }>> {
  await requirePermission(PERMISSIONS.LEGAL_TEXT_EDIT);

  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const { doc_key, title, content } = input;
  if (!doc_key.trim()) return { ok: false, error: "doc_key 不得為空" };
  if (!content.trim()) return { ok: false, error: "合約內容不得為空" };

  // 1. 讀目前 active 版
  const { data: currentActive } = await supabase
    .from("legal_text_templates")
    .select("id, version")
    .eq("brand_id", brand_id)
    .eq("doc_key", doc_key)
    .eq("is_active", true)
    .maybeSingle();

  const prevVersion = (currentActive?.version ?? 0) as number;
  const newVersion = prevVersion + 1;

  // 2. 舊版退役
  if (currentActive?.id) {
    const { error: deactivateErr } = await supabase
      .from("legal_text_templates")
      .update({ is_active: false })
      .eq("id", currentActive.id);

    if (deactivateErr) {
      return { ok: false, error: `退役舊版失敗：${deactivateErr.message}` };
    }
  }

  // 3. 新版 INSERT
  const { data: newRow, error: insertErr } = await supabase
    .from("legal_text_templates")
    .insert({
      brand_id,
      doc_key,
      title: title ?? null,
      content,
      version: newVersion,
      is_active: true,
      updated_by: ctx.userId,
    })
    .select("id, version")
    .single();

  if (insertErr || !newRow) {
    // 若 insert 失敗，嘗試將舊版重新 activate（最 best-effort）
    if (currentActive?.id) {
      await supabase
        .from("legal_text_templates")
        .update({ is_active: true })
        .eq("id", currentActive.id);
    }
    return { ok: false, error: `寫入失敗：${insertErr?.message ?? "unknown"}` };
  }

  // 4. 稽核（非阻塞）
  after(async () => {
    await writeAuditLog({
      table_name: "legal_text_templates",
      record_id: newRow.id as string,
      action: "upsert",
      actor_id: ctx.userId,
      brand_id,
      before: currentActive ? { version: prevVersion } : null,
      after: { version: newVersion, doc_key },
    });
  });

  revalidatePath("/admin/legal-texts");

  return {
    ok: true,
    data: { id: newRow.id as string, version: newRow.version as number },
  };
}

/**
 * 將特定歷史版本還原為 active（rollback）。
 * 用法：detail 頁「回復此版本」按鈕。
 */
export async function rollbackLegalText(
  id: string,
): Promise<Result<{ id: string; version: number }>> {
  await requirePermission(PERMISSIONS.LEGAL_TEXT_EDIT);

  const supabase = await createClient();
  const { brand_id } = await getActiveScope();
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  // 讀目標版本
  const { data: target } = await supabase
    .from("legal_text_templates")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand_id)
    .maybeSingle();

  if (!target) return { ok: false, error: "找不到該版本" };
  if ((target as LegalTextRow).is_active) return { ok: false, error: "此版本已是 active" };

  // 以原版內容重新 upsert（觸發 version+1 機制）
  return upsertLegalText({
    doc_key: (target as LegalTextRow).doc_key,
    title: (target as LegalTextRow).title,
    content: (target as LegalTextRow).content,
  });
}
