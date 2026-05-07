"use client";

import { createContext, useContext, useMemo } from "react";
import {
  type SidebarTheme,
  getSidebarTheme,
  themeToCssVars,
} from "@/lib/brands/sidebar-themes";
import {
  paletteCssVars,
  resolveBrandColors,
  type ResolvedBrandColors,
} from "@/lib/brands/brand-palettes";
import {
  type ShellLayout,
  type ShellLayoutKey,
  getShellLayout,
  shellLayoutToCssVars,
} from "@/lib/brands/shell-layouts";

export type AppearanceValue = {
  dashboardTagline: string;
  footerBadgeUrl: string | null;
  sidebarThemeKey: string;
  sidebarTheme: SidebarTheme;
  brandPaletteKey: string;
  customPalette: { primary?: string; accent?: string } | null;
  brandColors: ResolvedBrandColors;
  shellLayoutKey: ShellLayoutKey;
  shellLayout: ShellLayout;
  shellOptions: Record<string, unknown>;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function AppearanceProvider({
  dashboardTagline,
  footerBadgeUrl,
  sidebarThemeKey,
  brandPaletteKey,
  customPalette,
  shellLayoutKey,
  shellOptions,
  children,
}: {
  dashboardTagline: string;
  footerBadgeUrl: string | null;
  sidebarThemeKey: string;
  brandPaletteKey: string;
  customPalette: { primary?: string; accent?: string } | null;
  shellLayoutKey: string;
  shellOptions: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const value = useMemo<AppearanceValue>(() => {
    const theme = getSidebarTheme(sidebarThemeKey);
    const brandColors = resolveBrandColors(brandPaletteKey, customPalette);
    const layout = getShellLayout(shellLayoutKey);
    return {
      dashboardTagline,
      footerBadgeUrl,
      sidebarThemeKey: theme.key,
      sidebarTheme: theme,
      brandPaletteKey,
      customPalette,
      brandColors,
      shellLayoutKey: layout.key,
      shellLayout: layout,
      shellOptions,
    };
  }, [
    dashboardTagline,
    footerBadgeUrl,
    sidebarThemeKey,
    brandPaletteKey,
    customPalette,
    shellLayoutKey,
    shellOptions,
  ]);

  // 把 sidebar theme + brand palette + shell layout 三組 CSS var 一併塞到外層 div
  const cssVars = {
    ...themeToCssVars(value.sidebarTheme),
    ...paletteCssVars(value.brandColors),
    ...shellLayoutToCssVars(value.shellLayout),
  } as React.CSSProperties;

  return (
    <AppearanceContext.Provider value={value}>
      {/* 不用 display:contents — 某些瀏覽器/邊角情況不會把 inline CSS var 傳到子層；
          普通 div 沒 layout 副作用（裡面是 fixed 元素 + <main>），但 var 一定傳得下去。 */}
      <div style={cssVars}>{children}</div>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error(
      "useAppearance 必須在 <AppearanceProvider> 內使用 — 確認 (workspace)/layout.tsx 已載入",
    );
  }
  return ctx;
}
