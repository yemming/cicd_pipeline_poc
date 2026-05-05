import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAdminEmails } from "@/lib/feedback";

/**
 * App-wide admin allowlist — DB-backed (table: public.app_admins)。
 *
 * 取代舊的 FEEDBACK_ADMIN_EMAILS / NOTIFICATION_ADMIN_EMAILS env 白名單。
 *
 * 設計取捨：
 *   - 用 email 當 PK（citext 不分大小寫）→ 可以「預先授權」未註冊的人
 *   - RLS 鎖死，只走 service role；admin 名單不外洩到 client
 *   - Env 還是會被讀，但只當 **bootstrap fallback**（DB 空表時擋住自鎖）
 *
 * Cache：
 *   - listAdmins() React-cached → 整個 request 只查一次 DB
 *   - isAdmin(email) 共用上面的快取結果，O(1) 比對
 */

const CACHE_TTL_MS = 30_000; // 30 秒；admin 變更不需即時，但避免每次 request 都打 DB

let memoCache: { at: number; emails: Set<string> } | null = null;

/**
 * 從 DB 讀全部 admin email（lowercase Set）。
 *
 * 雙層 cache：
 *   - Per-request（React cache）：同一個 request 只查一次
 *   - Cross-request（memo with TTL）：30 秒內所有 request 共用
 *
 * 失敗時回 null（不是空 Set）→ 讓 caller 知道「DB 不可用」並走 env fallback。
 */
async function loadAdminsFromDb(): Promise<Set<string> | null> {
  if (memoCache && Date.now() - memoCache.at < CACHE_TTL_MS) {
    return memoCache.emails;
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("app_admins")
      .select("email");
    if (error) {
      console.warn("[admins] DB load failed:", error.message);
      return null;
    }
    const emails = new Set(
      (data ?? []).map((r) => String(r.email).toLowerCase()),
    );
    memoCache = { at: Date.now(), emails };
    return emails;
  } catch (e) {
    console.warn("[admins] DB load threw:", e instanceof Error ? e.message : e);
    return null;
  }
}

function envAdminEmails(): Set<string> {
  const raw =
    process.env.NOTIFICATION_ADMIN_EMAILS ?? process.env.FEEDBACK_ADMIN_EMAILS;
  return new Set(parseAdminEmails(raw)); // already lowercase
}

/**
 * 列出所有 admin email（lowercase）。
 * DB 與 env 聯集 — env 仍當 bootstrap 用（避免 DB 空時鎖死）。
 */
export const listAdmins = cache(async (): Promise<Set<string>> => {
  const fromDb = await loadAdminsFromDb();
  const fromEnv = envAdminEmails();
  if (fromDb === null) {
    // DB 掛了 → 全靠 env 撐
    return fromEnv;
  }
  // 聯集（env 還在、就還能登 admin；移除環變後就純 DB 控制）
  for (const e of fromEnv) fromDb.add(e);
  return fromDb;
});

/**
 * 判斷 email 是否為 admin。
 * email 為 null/空 → false。
 */
export async function isAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const set = await listAdmins();
  return set.has(email.toLowerCase());
}

// ──────────────────────────────────────────────────────────
// Mutations — 只能從 server action 呼叫，呼叫者要先做 admin 檢查
// ──────────────────────────────────────────────────────────

export async function grantAdmin(opts: {
  email: string;
  grantedBy: string | null;
  notes?: string | null;
}): Promise<void> {
  const email = opts.email.trim().toLowerCase();
  if (!email) throw new Error("email 不能空白");
  // 簡單 email 格式檢查（不求精準，只擋手滑）
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email 格式不正確");
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("app_admins")
    .upsert(
      {
        email,
        granted_by: opts.grantedBy,
        notes: opts.notes?.trim() || null,
      },
      { onConflict: "email" },
    );
  if (error) throw new Error(`授權失敗：${error.message}`);
  invalidateCache();
}

export async function revokeAdmin(email: string): Promise<void> {
  const target = email.trim().toLowerCase();
  if (!target) throw new Error("email 不能空白");

  const supabase = createServiceClient();

  // 鎖防：剩最後一個就拒絕（避免自鎖整個系統）
  const { count } = await supabase
    .from("app_admins")
    .select("*", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    throw new Error("這是最後一位管理員，不能移除（會把自己鎖在外面）");
  }

  const { error } = await supabase
    .from("app_admins")
    .delete()
    .eq("email", target);
  if (error) throw new Error(`移除失敗：${error.message}`);
  invalidateCache();
}

export type AdminRow = {
  email: string;
  granted_at: string;
  granted_by: string | null;
  notes: string | null;
};

export async function listAdminRows(): Promise<AdminRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_admins")
    .select("email, granted_at, granted_by, notes")
    .order("granted_at", { ascending: true });
  if (error) throw new Error(`讀取失敗：${error.message}`);
  return (data ?? []) as AdminRow[];
}

function invalidateCache() {
  memoCache = null;
}
