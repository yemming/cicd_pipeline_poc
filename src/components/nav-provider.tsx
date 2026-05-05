"use client";

import { createContext, useContext, useMemo } from "react";
import type { ModuleDef, ModulePage } from "@/lib/modules";
import {
  allPages as helperAllPages,
  findPageByHref as helperFindPageByHref,
  getModuleByKey as helperGetModuleByKey,
  resolveModuleFromPathname as helperResolveModuleFromPathname,
} from "@/lib/nav/helpers";

type NavContextValue = {
  modules: ModuleDef[];
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
  const value = useMemo<NavContextValue>(
    () => ({
      modules,
      getModuleByKey: (key) => helperGetModuleByKey(modules, key),
      resolveModuleFromPathname: (pathname) => helperResolveModuleFromPathname(modules, pathname),
      findPageByHref: (href) => helperFindPageByHref(modules, href),
      allPages: () => helperAllPages(modules),
    }),
    [modules],
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
