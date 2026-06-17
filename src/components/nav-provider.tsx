"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { ModuleDef, ModulePage } from "@/lib/modules";
import {
  allPages as helperAllPages,
  findPageByHref as helperFindPageByHref,
  getModuleByKey as helperGetModuleByKey,
  resolveModuleCandidates as helperResolveModuleCandidates,
  resolveModuleFromPathname as helperResolveModuleFromPathname,
} from "@/lib/nav/helpers";

type NavContextValue = {
  modules: ModuleDef[];
  /**
   * 當前 active module（含別名頁的 client-side stickiness）。
   * 元件應優先讀這個，而非自己呼叫 resolveModuleFromPathname——後者只認 pathname、
   * 無法區分別名頁是從哪個入口進來的。
   */
  activeModule: ModuleDef | null;
  getModuleByKey: (key: string) => ModuleDef | undefined;
  resolveModuleFromPathname: (pathname: string) => ModuleDef | null;
  findPageByHref: (href: string) => { module: ModuleDef; page: ModulePage } | null;
  allPages: () => Array<ModulePage & { moduleName: string; moduleKey: string; accent?: string }>;
};

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({
  modules,
  children,
}: {
  modules: ModuleDef[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // sticky：記住上一個 active module key。別名頁（同 pathname 被多 module 宣告）平手時，
  // 若 sticky 仍在候選內就留著——這就是「從哪個入口點進別名頁，就留在那個 module」的語意。
  const [stickyKey, setStickyKey] = useState<string | null>(null);

  const candidates = useMemo(
    () => helperResolveModuleCandidates(modules, pathname),
    [modules, pathname],
  );
  const activeModule = useMemo<ModuleDef | null>(() => {
    if (candidates.length <= 1) return candidates[0] ?? null;
    const stuck = stickyKey ? candidates.find((c) => c.key === stickyKey) : undefined;
    return stuck ?? candidates[0];
  }, [candidates, stickyKey]);

  // 「render 期間調整 state」——React 官方記住上一輪資訊的模式：sticky 落後於 activeModule
  // 一個 render 補上，導航當下 activeModule 用的還是上一個 module（達成 sticky 效果）。
  if (activeModule && activeModule.key !== stickyKey) {
    setStickyKey(activeModule.key);
  }

  const value = useMemo<NavContextValue>(
    () => ({
      modules,
      activeModule,
      getModuleByKey: (key) => helperGetModuleByKey(modules, key),
      resolveModuleFromPathname: (p) => helperResolveModuleFromPathname(modules, p),
      findPageByHref: (href) => helperFindPageByHref(modules, href),
      allPages: () => helperAllPages(modules),
    }),
    [modules, activeModule],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) {
    throw new Error("useNav 必須在 <NavProvider> 內使用 — 確認 (workspace)/layout.tsx 已載入 nav tree");
  }
  return ctx;
}
