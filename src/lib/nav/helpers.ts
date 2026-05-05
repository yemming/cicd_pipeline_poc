/**
 * Pure functions over a ModuleDef[] tree — used by both server loader and
 * the client-side NavProvider context.
 *
 * These mirror the helpers that used to live in `@/lib/modules`, but take
 * the modules array as parameter so the source of truth can be DB-backed.
 */

import type { ModuleDef, ModulePage } from "@/lib/modules";

// Pathname segment → module key overrides（保留與舊 modules.ts 同行為）
const SEGMENT_MODULE_OVERRIDES: Record<string, string> = {
  feedback: "settings",
};

export function getModuleByKey(modules: ModuleDef[], key: string): ModuleDef | undefined {
  return modules.find((m) => m.key === key);
}

export function resolveModuleFromPathname(
  modules: ModuleDef[],
  pathname: string,
): ModuleDef | null {
  if (!pathname) return null;

  // 1. 先看哪個模組裡有 page 的 href 對到當前 pathname（最精準）
  //    這條 path 涵蓋 admin 自建的目錄結構，不再受 URL segment 跟 module_key 必須一致的限制
  let bestMatch: { module: ModuleDef; matchLength: number } | null = null;
  for (const m of modules) {
    for (const p of m.pages) {
      if (!p.href) continue;
      const exact = p.href === pathname;
      const isParent = pathname.startsWith(p.href + "/");
      if (exact || isParent) {
        const len = p.href.length;
        if (!bestMatch || len > bestMatch.matchLength) {
          bestMatch = { module: m, matchLength: len };
        }
      }
    }
  }
  if (bestMatch) return bestMatch.module;

  // 2. 看 module.home 是否符合（例如用戶剛點 module icon 還沒走進任何 page）
  for (const m of modules) {
    if (m.home && (m.home === pathname || pathname.startsWith(m.home + "/"))) {
      return m;
    }
  }

  // 3. Legacy fallback：URL segment 對 module_key（給寫死路由的舊頁面用）
  const seg = pathname.split("/")[1];
  if (!seg) return null;
  const key = SEGMENT_MODULE_OVERRIDES[seg] ?? seg;
  return modules.find((m) => m.key === key) ?? null;
}

export function findPageByHref(
  modules: ModuleDef[],
  href: string,
): { module: ModuleDef; page: ModulePage } | null {
  for (const m of modules) {
    const p = m.pages.find((p) => p.href === href);
    if (p) return { module: m, page: p };
  }
  return null;
}

/** Flattened page list for CommandPalette / global search */
export function allPages(
  modules: ModuleDef[],
): Array<ModulePage & { moduleName: string; moduleKey: string; accent?: string }> {
  return modules.flatMap((m) =>
    m.pages.map((p) => ({
      ...p,
      moduleName: m.name,
      moduleKey: m.key,
      accent: m.accent,
    })),
  );
}
