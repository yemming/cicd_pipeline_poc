"use client";

import { createContext, useContext } from "react";

/**
 * 全站搜尋（CommandPalette）控制器 — 由 WorkspaceShell 提供。
 *
 * Shell variants（classic / modern）裡的 Topbar 用 useSearchControls() 拿到
 * openSearch / toggleSearch；CommandPalette 本體只在 WorkspaceShell mount 一次，
 * 不會因為 shell layout 切換而 unmount。
 */

export type SearchControls = {
  open: () => void;
  toggle: () => void;
};

export const SearchContext = createContext<SearchControls | null>(null);

export function useSearchControls(): SearchControls {
  return (
    useContext(SearchContext) ?? {
      open: () => {},
      toggle: () => {},
    }
  );
}
