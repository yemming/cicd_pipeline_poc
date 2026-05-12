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
