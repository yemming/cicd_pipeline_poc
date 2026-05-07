/**
 * Shell registry — 由 brand_appearance.shell_layout 決定當前 brand 用哪一套。
 *
 * 加新 variant 流程：
 *   1. SHELL_LAYOUTS（src/lib/brands/shell-layouts.ts）加 key
 *   2. 在 src/components/shells/<variant>/ 建一份 <ComponentName>.tsx
 *   3. 進這份註冊表 import + 寫進 SHELL_REGISTRY
 *
 * Type assertion 確保 key 對齊 ShellLayoutKey enum，少一個就 tsc fail。
 */

import type { ComponentType } from "react";
import type { ShellLayoutKey } from "@/lib/brands/shell-layouts";
import { ClassicShell } from "./classic/classic-shell";
import { ModernShell } from "./modern/modern-shell";

export const SHELL_REGISTRY: Record<
  ShellLayoutKey,
  ComponentType<{ children: React.ReactNode }>
> = {
  "classic-dual-rail": ClassicShell,
  "modern-single-sidebar": ModernShell,
};

export { ClassicShell } from "./classic/classic-shell";
export { ModernShell } from "./modern/modern-shell";
