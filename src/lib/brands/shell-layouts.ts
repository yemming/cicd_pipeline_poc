/**
 * Shell layout — 全站定案版型（dual-rail + navy topbar）。
 *
 * 設計收斂於 2026-05：所有 brand 統一這一套殼，admin UI 不再讓使用者選版型。
 * 仍保留 SHELL_LAYOUTS 陣列形式，方便 appearance-context / workspace-shell 既有 dispatch
 * 邏輯不需大改，DB 欄位 `brand_appearance.shell_layout` 也維持原 schema。
 */

export type ShellLayoutKey = "classic-dual-rail";

export type ShellLayout = {
  key: ShellLayoutKey;
  name: string;
  description: string;
  variant: "classic";

  railWidth: number;
  sidebarWidth: number;
  topbarHeight: number;

  topbarVariant: "navy-fixed";
  navStyle: "two-rail";
  iconSet: "material-symbols";

  topbarBg: string | null;
  topbarFg: string | null;
};

export const SHELL_LAYOUTS: ShellLayout[] = [
  {
    key: "classic-dual-rail",
    name: "雙軌經典",
    description: "56 px 模組軌 + 248 px 頁面面板 + 52 px navy topbar",
    variant: "classic",
    railWidth: 56,
    sidebarWidth: 248,
    topbarHeight: 52,
    topbarVariant: "navy-fixed",
    navStyle: "two-rail",
    iconSet: "material-symbols",
    topbarBg: "#1A3A5C",
    topbarFg: "#FFFFFF",
  },
];

export const DEFAULT_SHELL_LAYOUT_KEY: ShellLayoutKey = "classic-dual-rail";

export function getShellLayout(_key?: string | null): ShellLayout {
  return SHELL_LAYOUTS[0];
}

export function shellLayoutToCssVars(layout: ShellLayout): Record<string, string> {
  return {
    "--shell-rail-w": `${layout.railWidth}px`,
    "--shell-sidebar-w": `${layout.sidebarWidth}px`,
    "--shell-topbar-h": `${layout.topbarHeight}px`,
    ...(layout.topbarBg ? { "--shell-topbar-bg": layout.topbarBg } : {}),
    ...(layout.topbarFg ? { "--shell-topbar-fg": layout.topbarFg } : {}),
  };
}
