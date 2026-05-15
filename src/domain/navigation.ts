"use server";

/**
 * Domain Helper — Navigation（user-facing nav resolver）
 *
 * 對應頁面：/n/[nodeId] — 動態目錄節點 catch-all
 *
 * 用 service client bypass RLS：nav_nodes 不需 RLS 保護、任何登入使用者
 * 可以解析自己 brand 的 nav node（admin 那支在 `navigation-admin.ts`、跟這支對稱）。
 */

import fs from "node:fs/promises";
import path from "node:path";

import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";

export type NavNode = {
  id: string;
  brand_id: string;
  level: number;
  name: string;
  page_kind: "static_html" | "react_route" | "iframe" | "placeholder" | null;
  href: string | null;
  html_storage_path: string | null;
  stitch_screen_id: string | null;
  sprint: string | null;
  is_active: boolean;
};

export async function resolveNavNode(nodeId: string): Promise<NavNode | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .select(
      "id, brand_id, level, name, page_kind, href, html_storage_path, stitch_screen_id, sprint, device, is_active",
    )
    .eq("id", nodeId)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();
  if (error || !data) return null;
  return data as NavNode;
}

const HTML_BUCKET = "nav-html";

/**
 * 售後修護模組進度 — 給 /parts/aftersales flow-diagram landing 用。
 *
 * 撈當前 brand 底下「售後修護」grandparent 子樹下所有 level=3 節點，
 * 按 page_kind 計數產出 KPI + node href→status map（讓 page.tsx 渲染狀態 chip）。
 *
 * 「剩餘 Sessions」「庫存串接點」是 PM 估算值、非 DB 計算 → hardcode。
 */
export type AftersalesModuleProgress = {
  completed_count: number;
  pending_count: number;
  inventory_link_count: number;
  planned_sessions: string;
  /** key = href；value = page_kind（'missing' = 該 href 在 nav_nodes 找不到） */
  node_status: Record<string, NonNullable<NavNode["page_kind"]> | "missing">;
};

const AFTERSALES_ROOT_NAME = "售後修護";

export async function getAftersalesModuleProgress(): Promise<AftersalesModuleProgress> {
  const supabase = createServiceClient();
  const brand_id = (await getActiveScope()).brand_id;

  // 找 grandparent（level=1, name='售後修護'）
  const { data: rootRow } = await supabase
    .from("nav_nodes")
    .select("id")
    .eq("brand_id", brand_id)
    .eq("level", 1)
    .eq("name", AFTERSALES_ROOT_NAME)
    .maybeSingle();

  const fallback: AftersalesModuleProgress = {
    completed_count: 0,
    pending_count: 0,
    inventory_link_count: 4,
    planned_sessions: "2~3",
    node_status: {},
  };

  if (!rootRow?.id) return fallback;

  // 撈所有 level=2 直接子節點 id
  const { data: l2Rows } = await supabase
    .from("nav_nodes")
    .select("id")
    .eq("brand_id", brand_id)
    .eq("parent_id", rootRow.id);

  const l2Ids = (l2Rows ?? []).map((r) => r.id);
  if (l2Ids.length === 0) return fallback;

  // 撈所有 level=3 葉節點
  const { data: leafRows } = await supabase
    .from("nav_nodes")
    .select("href, page_kind")
    .eq("brand_id", brand_id)
    .in("parent_id", l2Ids)
    .eq("is_active", true);

  const leaves = leafRows ?? [];
  let completed = 0;
  let pending = 0;
  const nodeStatus: AftersalesModuleProgress["node_status"] = {};

  for (const row of leaves) {
    if (row.page_kind === "react_route") completed++;
    else pending++;
    if (row.href) nodeStatus[row.href] = row.page_kind ?? "placeholder";
  }

  return {
    completed_count: completed,
    pending_count: pending,
    inventory_link_count: 4,
    planned_sessions: "2~3",
    node_status: nodeStatus,
  };
}

export async function downloadNavHtml(storagePath: string): Promise<string | null> {
  // 支援 `file:` 前綴 → 從專案根目錄 fs-read（給 docs/ 內的原始規格 HTML 用，免上傳 Storage）
  if (storagePath.startsWith("file:")) {
    const rel = storagePath.slice("file:".length);
    // 安全：禁止跳出專案根、禁止絕對路徑
    if (rel.startsWith("/") || rel.includes("..")) {
      console.warn("[nav/n] file: 路徑非法", rel);
      return null;
    }
    try {
      return await fs.readFile(path.join(process.cwd(), rel), "utf8");
    } catch (e) {
      console.warn("[nav/n] file: fs-read 失敗", rel, (e as Error).message);
      return null;
    }
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(HTML_BUCKET).download(storagePath);
  if (error || !data) {
    console.warn("[nav/n] storage download 失敗", storagePath, error?.message);
    return null;
  }
  return await data.text();
}
