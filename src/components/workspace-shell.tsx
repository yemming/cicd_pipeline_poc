"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleRail } from "@/components/module-rail";
import { PagesPanel } from "@/components/pages-panel";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { PageHeaderProvider } from "@/components/page-header-context";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { StickyNotesLayer } from "@/components/sticky-notes/sticky-notes-layer";
import { useActiveModule } from "@/lib/use-active-module";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <PageHeaderProvider>
      <SidebarProvider>
        <Shell>{children}</Shell>
      </SidebarProvider>
    </PageHeaderProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed, toggle, fullHidden, setFullHidden } = useSidebar();
  const activeModule = useActiveModule();
  const onLauncher = !activeModule;
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return (
    <>
      {!fullHidden && <ModuleRail />}
      {!fullHidden && <PagesPanel />}
      <Topbar onOpenSearch={openSearch} />

      {!collapsed && !fullHidden && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-30 transition-opacity"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      {fullHidden && (
        <button
          onClick={() => setFullHidden(false)}
          className="fixed top-3 -left-5 z-[70] w-10 h-10 flex items-center justify-center rounded-full bg-white/60 backdrop-blur-sm border border-black/8 text-black/30 hover:text-black/60 hover:-left-2 transition-all shadow-sm"
          title="顯示導航列"
        >
          <span className="material-symbols-outlined text-xl">apps</span>
        </button>
      )}

      <main
        className={`mt-16 min-h-[calc(100dvh-4rem)] min-w-0 bg-[#F5F5F5] p-4 md:p-6 lg:p-8 transition-[margin-left] duration-200 ${
          fullHidden ? "ml-0" : onLauncher || collapsed ? "ml-14" : "lg:ml-[296px] ml-14"
        }`}
        style={{
          ["--shell-left" as string]: fullHidden ? "0px" : onLauncher || collapsed ? "3.5rem" : "18.5rem",
        }}
      >
        {children}
      </main>

      <CommandPalette open={searchOpen} onClose={closeSearch} />
      <StickyNotesLayer />
    </>
  );
}
