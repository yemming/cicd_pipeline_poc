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
import type { ModuleDef, ModulePage, ParentGroup, SectionGroup } from "@/lib/modules";

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
  is_admin_only: boolean;
  coming_soon: boolean;
  is_active: boolean;
  emoji: string | null;
  section_group: string | null;
  section_group_color: string | null;
  badge: string | null;
  collapsed: boolean | null;
};

function normalizeHref(raw: string): string {
  // 1. 砍掉 query string / hash — usePathname() 只回 pathname，若 DB 存
  //    "/crm/sales/survey-templates?kind=sales" 會讓 resolveModuleFromPathname
  //    跟 PagesPanel 的 activeHref 都比對失敗，導致 ParentGroup 全部收合。
  //    page-level default param 用 searchParams 解，nav href 只該存 pathname。
  let h = raw;
  const qIdx = h.search(/[?#]/);
  if (qIdx >= 0) h = h.slice(0, qIdx);
  // 2. Next.js 預設會把瀏覽器 URL 的末尾斜線拿掉；DB 若不小心存了 "/foo/" 會讓
  //    resolver 跟 PagesPanel 比對失敗（活生生案例：/admin/navigation/ → sidebar 不見）。
  if (h.length > 1 && h.endsWith("/")) h = h.replace(/\/+$/, "");
  return h;
}

function rowToPage(row: NavNodeRow, sectionName: string | undefined): ModulePage {
  // page_kind=react_route 沿用 row.href；其他 kind 一律導到 catch-all /n/{id}
  const href =
    row.page_kind === "react_route" && row.href
      ? normalizeHref(row.href)
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
  if (row.is_admin_only) page.adminOnly = true;
  if (row.permission) page.permission = row.permission;
  if (row.badge) page.badge = row.badge;
  return page;
}

function buildModuleDef(
  modRow: NavNodeRow,
  childrenByParent: Map<string, NavNodeRow[]>,
): ModuleDef {
  const directChildren = childrenByParent.get(modRow.id) ?? [];
  const pages: ModulePage[] = [];

  // 第一輪：判斷此 module 是否使用樣板的三層樹（section header → parent group → leaf）
  // 只要有任一 L2 wrapper 就走樹狀模式（不一定要設 section_group），讓 admin 加新 L2
  // 不必先想好 section 分區也能立刻顯示為可收折節點。
  let useSections = false;
  for (const child of directChildren) {
    if (child.level === 2) {
      useSections = true;
      break;
    }
  }

  const sectionsMap = new Map<string, SectionGroup>();

  for (const child of directChildren) {
    if (child.level === 3) {
      // module 直掛 page（legacy fallback，不走 section_group）
      pages.push(rowToPage(child, undefined));
    } else if (child.level === 2) {
      const grandchildren = childrenByParent.get(child.id) ?? [];
      const childPages: ModulePage[] = [];
      for (const gc of grandchildren) {
        if (gc.level === 3) {
          // sections 模式：把 leaf 自己的 section_group 當「分類註記」(── xxx ──) 帶進
          //   page.section，由 SectionedTree 在同一 parent group 內、leaf 之間插入灰色小標
          //   （目錄結構規範 v3.0 §二：分類註記不是節點、是視覺分組標題）。
          // 舊模式 fallback：把 level=2 name 當 section 字串塞進 page。
          const sectionName = useSections ? (gc.section_group ?? undefined) : child.name;
          const p = rowToPage(gc, sectionName);
          pages.push(p);
          childPages.push(p);
        }
      }

      if (useSections) {
        const sgName = child.section_group ?? "(其他)";
        const sgColor = child.section_group_color ?? undefined;
        let sec = sectionsMap.get(sgName);
        if (!sec) {
          sec = { title: sgName, parents: [] };
          if (sgColor) sec.color = sgColor;
          sectionsMap.set(sgName, sec);
        }
        const parent: ParentGroup = {
          name: child.name,
          children: childPages,
        };
        if (child.icon) parent.icon = child.icon;
        if (child.emoji) parent.emoji = child.emoji;
        if (child.badge) parent.badge = child.badge;
        if (child.collapsed) parent.collapsed = true;

        // direct-link parent（自己有 href、無 children）— 樣板「庫存查詢」「模組導覽總覽」
        if (child.page_kind === "react_route" && child.href && childPages.length === 0) {
          const dlHref = normalizeHref(child.href);
          parent.href = dlHref;
          if (child.permission) parent.permission = child.permission;
          // 同步加進 flat pages（供 PagesPanel/CommandPalette 看見）
          const dl: ModulePage = { name: child.name, href: dlHref };
          if (child.icon) dl.icon = child.icon;
          if (child.permission) dl.permission = child.permission;
          if (child.badge) dl.badge = child.badge;
          pages.push(dl);
        }
        sec.parents.push(parent);
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
  if (useSections) def.sections = Array.from(sectionsMap.values());
  if (modRow.accent) def.accent = modRow.accent;
  if (modRow.description) def.description = modRow.description;
  if (modRow.permission) def.permission = modRow.permission;
  return def;
}

/**
 * 載入指定 brand 的 nav tree。React.cache 以同一 request 內共用結果。
 *
 * Brand-level module ACL：`brand_modules.enabled = false` 的 module 整個剃掉，
 * 包含其所有 level=2 / level=3 後代。沒設定 row 預設 enabled=true（向後相容）。
 */
export const loadNavTree = cache(async (brandKey: string): Promise<ModuleDef[]> => {
  const supabase = createServiceClient();
  const [{ data, error }, { data: modulesAcl }] = await Promise.all([
    supabase
      .from("nav_nodes")
      .select("*")
      .eq("brand_id", brandKey)
      .eq("is_active", true)
      .order("level")
      .order("sort_order"),
    supabase
      .from("brand_modules")
      .select("module_key, enabled")
      .eq("brand_id", brandKey),
  ]);

  if (error) {
    console.error("[nav/loader] 載入失敗", error);
    return [];
  }

  const rows = (data ?? []) as NavNodeRow[];
  if (rows.length === 0) return [];

  // brand_modules: enabled=false 的 module_key 列為 disabled
  const disabledModules = new Set<string>(
    (modulesAcl ?? [])
      .filter((m) => m.enabled === false)
      .map((m) => m.module_key as string),
  );

  const childrenByParent = new Map<string, NavNodeRow[]>();
  const modules: NavNodeRow[] = [];
  for (const row of rows) {
    if (row.level === 1) {
      // 該 brand 將此 module 關閉 → 整個剃掉
      if (row.module_key && disabledModules.has(row.module_key)) continue;
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
