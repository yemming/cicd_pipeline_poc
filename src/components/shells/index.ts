/**
 * Shell registry — 全站統一使用 ClassicShell（dual-rail + navy topbar）。
 *
 * 2026-05 設計收斂後不再支援多 variant，但 SHELL_REGISTRY 形式保留，
 * workspace-shell.tsx 維持以 useAppearance().shellLayoutKey 派發的程式結構。
 */

import type { ComponentType } from "react";
import type { ShellLayoutKey } from "@/lib/brands/shell-layouts";
import { ClassicShell } from "./classic/classic-shell";

export const SHELL_REGISTRY: Record<
  ShellLayoutKey,
  ComponentType<{ children: React.ReactNode }>
> = {
  "classic-dual-rail": ClassicShell,
};

export { ClassicShell } from "./classic/classic-shell";
