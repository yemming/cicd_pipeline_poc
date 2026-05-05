/**
 * Seed nav_nodes from the static `modules` array in `@/lib/modules`.
 *
 * Runs server-side via service role (bypasses RLS). Idempotent — wipes the
 * brand's existing nav_nodes then re-inserts. Designed to be invoked from
 * `/api/admin/seed-nav-tree` once per brand during the Phase 2 cutover.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { modules as STATIC_MODULES } from "@/lib/modules";
import type { ModuleDef, ModulePage } from "@/lib/modules";

export interface SeedResult {
  brandId: string;
  modulesInserted: number;
  sectionsInserted: number;
  pagesInserted: number;
}

export async function seedNavTreeFromStaticModules(brandId: string): Promise<SeedResult> {
  const supabase = createServiceClient();

  // 1. wipe existing brand 的 nav_nodes（cascade 會把子節點一起帶走）
  const { error: deleteErr } = await supabase
    .from("nav_nodes")
    .delete()
    .eq("brand_id", brandId);
  if (deleteErr) throw new Error(`清空 nav_nodes 失敗：${deleteErr.message}`);

  let modulesInserted = 0;
  let sectionsInserted = 0;
  let pagesInserted = 0;

  // 2. 對每個 module 插 level=1 row → 走 pages 陣列建 level=2/3
  let modSort = 0;
  for (const mod of STATIC_MODULES as ModuleDef[]) {
    const { data: modRow, error: modErr } = await supabase
      .from("nav_nodes")
      .insert({
        brand_id: brandId,
        parent_id: null,
        level: 1,
        sort_order: modSort++,
        name: mod.name,
        icon: mod.icon ?? null,
        accent: mod.accent ?? null,
        description: mod.description ?? null,
        module_key: mod.key,
        permission: mod.permission ?? null,
        home: mod.home,
      })
      .select("id")
      .single();
    if (modErr || !modRow) {
      throw new Error(`插入 module ${mod.key} 失敗：${modErr?.message ?? "unknown"}`);
    }
    modulesInserted++;

    // 3. walk pages 陣列，依 section 切分
    let currentSectionId: string | null = null;
    let currentSectionName: string | null = null;
    let secSort = 0;
    let pageSort = 0;

    for (const page of mod.pages as ModulePage[]) {
      const sectionName = page.section ?? null;

      // section 變了 → 創建新 section（或回到無 section 模式）
      if (sectionName !== currentSectionName) {
        if (sectionName) {
          const { data: secRow, error: secErr } = await supabase
            .from("nav_nodes")
            .insert({
              brand_id: brandId,
              parent_id: modRow.id,
              level: 2,
              sort_order: secSort++,
              name: sectionName,
            })
            .select("id")
            .single();
          if (secErr || !secRow) {
            throw new Error(`插入 section ${sectionName} 失敗：${secErr?.message ?? "unknown"}`);
          }
          currentSectionId = secRow.id;
          sectionsInserted++;
        } else {
          currentSectionId = null;
        }
        currentSectionName = sectionName;
        pageSort = 0; // 每個新 section 內 page 重新排序
      }

      // 插入 page (level=3)，預設 page_kind=react_route（既有 ducati seed 全是現有路由）
      const { error: pageErr } = await supabase
        .from("nav_nodes")
        .insert({
          brand_id: brandId,
          parent_id: currentSectionId ?? modRow.id,
          level: 3,
          sort_order: pageSort++,
          name: page.name,
          icon: page.icon ?? null,
          page_kind: "react_route",
          href: page.href,
          stitch_screen_id: page.stitchScreenId ?? null,
          sprint: page.sprint ?? null,
          device: page.device ?? null,
          is_admin_only: page.adminOnly ?? false,
          coming_soon: page.comingSoon ?? false,
        });
      if (pageErr) {
        throw new Error(`插入 page ${page.name} 失敗：${pageErr.message}`);
      }
      pagesInserted++;
    }
  }

  return { brandId, modulesInserted, sectionsInserted, pagesInserted };
}
