/**
 * Server-only nav tree loader.
 *
 * Reads nav_nodes for the given brand and returns the same `ModuleDef[]` shape
 * that consumers used to import directly from `@/lib/modules`. Once Phase 2 lands
 * fully, callers should `useNav()` (client) or `await loadNavTree(brand.key)` (server).
 */

import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import type { ModuleDef, ModulePage } from "@/lib/modules";

type NavNodeRow = {
  id: string;
  brand_id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  sort_order: number;
  name: string;
  icon: string | null;
  accent: string | null;
  description: string | null;
  module_key: string | null;
  permission: string | null;
  home: string | null;
  page_kind: "static_html" | "react_route" | "iframe" | "placeholder" | null;
  href: string | null;
  html_storage_path: string | null;
  stitch_screen_id: string | null;
  sprint: string | null;
  device: "tablet" | "mobile" | null;
  is_admin_only: boolean;
  coming_soon: boolean;
  is_active: boolean;
};

function rowToPage(row: NavNodeRow, sectionName: string | undefined): ModulePage {
  // page_kind=react_route 沿用 row.href；其他 kind 一律導到 catch-all /n/{id}
  const href =
    row.page_kind === "react_route" && row.href
      ? row.href
      : `/n/${row.id}`;
  const page: ModulePage = {
    name: row.name,
    href,
  };
  if (row.icon) page.icon = row.icon;
  if (row.coming_soon) page.comingSoon = true;
  if (row.stitch_screen_id) page.stitchScreenId = row.stitch_screen_id;
  if (sectionName) page.section = sectionName;
  if (row.sprint) page.sprint = row.sprint;
  if (row.device) page.device = row.device;
  if (row.is_admin_only) page.adminOnly = true;
  return page;
}

function buildModuleDef(
  modRow: NavNodeRow,
  childrenByParent: Map<string, NavNodeRow[]>,
): ModuleDef {
  const directChildren = childrenByParent.get(modRow.id) ?? [];
  const pages: ModulePage[] = [];

  for (const child of directChildren) {
    if (child.level === 3) {
      pages.push(rowToPage(child, undefined));
    } else if (child.level === 2) {
      const grandchildren = childrenByParent.get(child.id) ?? [];
      for (const gc of grandchildren) {
        if (gc.level === 3) pages.push(rowToPage(gc, child.name));
      }
    }
  }

  const def: ModuleDef = {
    id: modRow.id,
    key: modRow.module_key ?? modRow.id,
    name: modRow.name,
    icon: modRow.icon ?? "apps",
    home: modRow.home ?? (pages[0]?.href ?? "/dashboard"),
    pages,
  };
  if (modRow.accent) def.accent = modRow.accent;
  if (modRow.description) def.description = modRow.description;
  if (modRow.permission) def.permission = modRow.permission;
  return def;
}

/**
 * 載入指定 brand 的 nav tree。React.cache 以同一 request 內共用結果。
 */
export const loadNavTree = cache(async (brandKey: string): Promise<ModuleDef[]> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .select("*")
    .eq("brand_id", brandKey)
    .eq("is_active", true)
    .order("level")
    .order("sort_order");

  if (error) {
    console.error("[nav/loader] 載入失敗", error);
    return [];
  }

  const rows = (data ?? []) as NavNodeRow[];
  if (rows.length === 0) return [];

  const childrenByParent = new Map<string, NavNodeRow[]>();
  const modules: NavNodeRow[] = [];
  for (const row of rows) {
    if (row.level === 1) {
      modules.push(row);
    } else if (row.parent_id) {
      const arr = childrenByParent.get(row.parent_id) ?? [];
      arr.push(row);
      childrenByParent.set(row.parent_id, arr);
    }
  }

  // 雙保險：每個 parent 的 children 再依 sort_order 排一次
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  modules.sort((a, b) => a.sort_order - b.sort_order);

  return modules.map((m) => buildModuleDef(m, childrenByParent));
});
