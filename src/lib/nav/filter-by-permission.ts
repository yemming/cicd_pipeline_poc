import "server-only";

import type { ModuleDef, ModulePage, ParentGroup, SectionGroup } from "@/lib/modules";

/**
 * 依使用者權限把 nav tree 過濾乾淨 —— 沒權限的頁/模組直接從側欄拿掉（含 ModuleRail icon），
 * 而不是顯示後讓人點到「無權限」死路。
 *
 * 鏡射 page 端的兩種 guard：
 *   - `page.permission`（對應 hasPermission(PERMISSIONS.X)）→ 缺權限就藏
 *   - `page.adminOnly`（對應 isAdmin / app_admins）→ 非 admin 就藏
 *
 * 規則：
 *   - 無 permission 且非 adminOnly 的頁 → 永遠顯示（安全預設，不會誤藏沒掛 guard 的頁）
 *   - admin（getUserPermissions 回 ALL + isAdmin=true）→ 全部看得到
 *   - 一個 parent / section / module 底下沒有任何可見頁 → 整塊 prune（rail 也不顯示）
 */

function pageVisible(p: ModulePage, perms: Set<string>, isAdmin: boolean): boolean {
  if (p.adminOnly && !isAdmin) return false;
  if (p.permission && !perms.has(p.permission)) return false;
  return true;
}

export function filterNavByPermission(
  modules: ModuleDef[],
  perms: Set<string>,
  isAdmin: boolean,
): ModuleDef[] {
  const out: ModuleDef[] = [];

  for (const m of modules) {
    const pages = m.pages.filter((p) => pageVisible(p, perms, isAdmin));

    let sections: SectionGroup[] | undefined;
    if (m.sections) {
      const keptSections: SectionGroup[] = [];
      for (const sec of m.sections) {
        const keptParents: ParentGroup[] = [];
        for (const par of sec.parents) {
          const isDirectLink = !!par.href && par.children.length === 0;
          if (isDirectLink) {
            // 直連 parent（如「庫存查詢」）→ 用自身 permission 判定
            if (!par.permission || isAdmin || perms.has(par.permission)) {
              keptParents.push(par);
            }
            continue;
          }
          const children = par.children.filter((p) => pageVisible(p, perms, isAdmin));
          if (children.length > 0) keptParents.push({ ...par, children });
        }
        if (keptParents.length > 0) keptSections.push({ ...sec, parents: keptParents });
      }
      sections = keptSections;
    }

    const hasContent = pages.length > 0 || (sections != null && sections.length > 0);
    if (!hasContent) continue;

    // home 若指向已被藏的頁 → 改用第一個可見頁，避免點模組落到無權限頁
    const visibleHrefs = new Set(pages.map((p) => p.href));
    const home = visibleHrefs.has(m.home) ? m.home : (pages[0]?.href ?? m.home);

    out.push({ ...m, home, pages, ...(sections ? { sections } : {}) });
  }

  return out;
}
