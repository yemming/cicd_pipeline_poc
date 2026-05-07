"use client";

/**
 * WorkspaceShell — `(workspace)` route group 共用的根殼。
 *
 * 三件事：
 *   1. PageHeaderProvider + SidebarProvider 包外層，讓兩種 shell variant 共用 context
 *   2. 全域 overlay（CommandPalette / StickyNotesLayer）+ ⌘K / ⌘B 鍵盤監聽
 *   3. ShellRouter 從 useAppearance() 取 shellLayoutKey 派發 SHELL_REGISTRY 變體
 *
 * 切換 shell variant 時用 `key={shellLayoutKey}` 強制 unmount，
 * 避免 CSS var 殘留 / sidebar 內部 state 漏到不同 layout。
 */

import { useCallback, useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { PageHeaderProvider } from "@/components/page-header-context";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { StickyNotesLayer } from "@/components/sticky-notes/sticky-notes-layer";
import { useAppearance } from "@/components/appearance-context";
import { SearchContext } from "@/components/search-context";
import { SHELL_REGISTRY } from "@/components/shells";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <PageHeaderProvider>
      <SidebarProvider>
        <ShellRouter>{children}</ShellRouter>
      </SidebarProvider>
    </PageHeaderProvider>
  );
}

function ShellRouter({ children }: { children: React.ReactNode }) {
  const { shellLayoutKey } = useAppearance();
  const { toggle: toggleSidebar } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const toggleSearch = useCallback(() => setSearchOpen((prev) => !prev), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleSearch();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, toggleSearch]);

  const Component = SHELL_REGISTRY[shellLayoutKey];

  return (
    <SearchContext.Provider value={{ open: openSearch, toggle: toggleSearch }}>
      {/* key 強制 unmount/mount — 切 shell 不會殘留 CSS var 或 sidebar 內部 state */}
      <Component key={shellLayoutKey}>{children}</Component>
      <CommandPalette open={searchOpen} onClose={closeSearch} />
      <StickyNotesLayer />
    </SearchContext.Provider>
  );
}
