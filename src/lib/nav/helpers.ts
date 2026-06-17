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

/**
 * 回傳所有「最長 href 前綴平手」匹配當前 pathname 的 module 候選（去重）。
 *
 * 為什麼要回多個：同一個頁面可能被多個 module 以別名方式宣告（例如「料件主檔」
 * /parts/setup/items 同時掛在「進銷存」和「會計/List 主檔」兩個 module 下）。
 * 純 pathname 解析無法區分「使用者從哪個入口進來」，所以這裡把平手候選全給出去，
 * 由上層（NavProvider）用 client-side stickiness 決定留在哪個 module。
 *
 * 候選排序：canonical（key === pathname 第一段）優先，當作冷啟動 / 無 sticky 時的預設。
 */
export function resolveModuleCandidates(
  modules: ModuleDef[],
  pathname: string,
): ModuleDef[] {
  if (!pathname) return [];

  // 1. 哪些 module 裡有 page 的 href 對到當前 pathname（取最長前綴平手的那一群）
  let bestLen = -1;
  const byPage: ModuleDef[] = [];
  for (const m of modules) {
    let mLen = -1;
    for (const p of m.pages) {
      if (!p.href) continue;
      const exact = p.href === pathname;
      const isParent = pathname.startsWith(p.href + "/");
      if (exact || isParent) mLen = Math.max(mLen, p.href.length);
    }
    if (mLen < 0) continue;
    if (mLen > bestLen) {
      bestLen = mLen;
      byPage.length = 0;
      byPage.push(m);
    } else if (mLen === bestLen) {
      byPage.push(m);
    }
  }
  if (byPage.length > 0) return canonicalFirst(byPage, pathname);

  // 2. module.home 符合（用戶剛點 module icon、還沒走進任何 page）
  const byHome = modules.filter(
    (m) => m.home && (m.home === pathname || pathname.startsWith(m.home + "/")),
  );
  if (byHome.length > 0) return canonicalFirst(byHome, pathname);

  // 3. Legacy fallback：URL segment 對 module_key（給寫死路由的舊頁面用）
  const seg = pathname.split("/")[1];
  if (!seg) return [];
  const key = SEGMENT_MODULE_OVERRIDES[seg] ?? seg;
  const m = modules.find((mm) => mm.key === key);
  return m ? [m] : [];
}

/** canonical（key === pathname 第一段）排到最前，作為無 sticky 時的預設選擇 */
function canonicalFirst(cands: ModuleDef[], pathname: string): ModuleDef[] {
  if (cands.length <= 1) return cands;
  const seg = pathname.split("/")[1];
  const key = seg ? (SEGMENT_MODULE_OVERRIDES[seg] ?? seg) : null;
  if (!key) return cands;
  const idx = cands.findIndex((m) => m.key === key);
  if (idx <= 0) return cands;
  return [cands[idx], ...cands.slice(0, idx), ...cands.slice(idx + 1)];
}

export function resolveModuleFromPathname(
  modules: ModuleDef[],
  pathname: string,
): ModuleDef | null {
  return resolveModuleCandidates(modules, pathname)[0] ?? null;
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
