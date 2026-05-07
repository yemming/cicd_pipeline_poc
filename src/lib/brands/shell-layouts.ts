/**
 * Shell layout variant — 整套 UI shell 的「結構性」選項
 *
 * 跟 sidebar-themes.ts 不同：sidebar themes 只控制 CSS 色票（rail/panel/text 等
 * CSS var），shell layout 控制的是「結構」— sidebar 寬度、topbar 高度、單層 vs
 * 雙層導航、icon set 偏好。
 *
 * 兩個 variant：
 *   - classic-dual-rail   = Ducati 既有殼（56 px module rail + 248 px pages panel
 *                          + 64 px white topbar + Aceternity 動態 dock）
 *   - modern-single-sidebar = Indian 新殼（220 px 單層 light sidebar + 52 px navy
 *                            topbar + 展開式二級菜單 + emoji-or-material icon）
 *
 * 切到 modern 時 navy `#1A3A5C` topbar 是「結構特徵」寫死在這，不進 SIDEBAR_THEMES。
 * 使用者在 modern 殼內仍可切 9 套 sidebar 主題，但深色那 4 套會在 admin UI 軟提示
 * 對比不佳（compatibleSidebarThemes 白名單）。
 */

export type ShellLayoutKey = "classic-dual-rail" | "modern-single-sidebar";

export type ShellLayout = {
  key: ShellLayoutKey;
  name: string;
  description: string;
  variant: "classic" | "modern";

  // 結構參數（給 CSS var 跟元件 layout 吃）
  railWidth: number; // 56 (classic) | 0 (modern, 無 rail)
  sidebarWidth: number; // 248 (classic pages panel) | 220 (modern)
  topbarHeight: number; // 64 (classic) | 52 (modern)

  // Topbar / Sidebar 行為旗標
  topbarVariant: "white-on-light" | "navy-fixed";
  navStyle: "two-rail" | "expandable-tree";
  iconSet: "material-symbols" | "emoji-or-material";

  // CSS var fallback（modern shell 的 navy topbar 寫死在這）
  // null = 沿用 sidebarTheme rail（classic 預設行為）
  topbarBg: string | null;
  topbarFg: string | null;

  // 與 sidebarTheme 的相容性 — admin appearance-editor 用此給軟白名單 tooltip
  compatibleSidebarThemes: "all" | string[];
};

export const SHELL_LAYOUTS: ShellLayout[] = [
  {
    key: "classic-dual-rail",
    name: "雙軌經典",
    description: "56 px 模組軌 + 248 px 頁面面板 + 64 px topbar — Ducati 預設",
    variant: "classic",
    railWidth: 56,
    sidebarWidth: 248,
    topbarHeight: 64,
    topbarVariant: "white-on-light",
    navStyle: "two-rail",
    iconSet: "material-symbols",
    topbarBg: null,
    topbarFg: null,
    compatibleSidebarThemes: "all",
  },
  {
    key: "modern-single-sidebar",
    name: "單欄現代",
    description: "220 px 單層 sidebar + 52 px navy topbar + 二級展開菜單 — Indian 庫存模組設計",
    variant: "modern",
    railWidth: 0,
    sidebarWidth: 220,
    topbarHeight: 52,
    topbarVariant: "navy-fixed",
    navStyle: "expandable-tree",
    iconSet: "emoji-or-material",
    topbarBg: "#1A3A5C",
    topbarFg: "#FFFFFF",
    // light theme 配 modern 殼的 navy topbar 對比剛好；deep theme 4 套會被 admin 軟警告
    compatibleSidebarThemes: [
      "quartz-light",
      "frost",
      "alpine-light",
      "antique",
      "pixel",
    ],
  },
];

export const DEFAULT_SHELL_LAYOUT_KEY: ShellLayoutKey = "classic-dual-rail";

export function getShellLayout(key: string | null | undefined): ShellLayout {
  if (!key) return SHELL_LAYOUTS[0];
  return SHELL_LAYOUTS.find((s) => s.key === key) ?? SHELL_LAYOUTS[0];
}

/**
 * 把 shell layout 結構參數轉成 CSS 變數，跟 sidebar theme 的 var 一起塞進
 * AppearanceProvider 外層 div。
 */
export function shellLayoutToCssVars(layout: ShellLayout): Record<string, string> {
  return {
    "--shell-rail-w": `${layout.railWidth}px`,
    "--shell-sidebar-w": `${layout.sidebarWidth}px`,
    "--shell-topbar-h": `${layout.topbarHeight}px`,
    // topbarBg/Fg 為 null 時不寫 var（讓 classic 殼的 topbar 自己決定背景）
    ...(layout.topbarBg ? { "--shell-topbar-bg": layout.topbarBg } : {}),
    ...(layout.topbarFg ? { "--shell-topbar-fg": layout.topbarFg } : {}),
  };
}

/**
 * Sidebar theme 是否在當前 shell layout 的相容白名單內。
 * admin appearance-editor 用此判斷要不要給 tooltip 警告。
 */
export function isSidebarThemeCompatibleWithShell(
  sidebarThemeKey: string,
  shellLayout: ShellLayout,
): boolean {
  if (shellLayout.compatibleSidebarThemes === "all") return true;
  return shellLayout.compatibleSidebarThemes.includes(sidebarThemeKey);
}
