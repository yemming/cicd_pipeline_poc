"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleRail } from "@/components/module-rail";
import { PagesPanel } from "@/components/pages-panel";
import { Topbar } from "@/components/topbar";
import { CommandPalette } from "@/components/command-palette";
import { PageHeaderProvider } from "@/components/page-header-context";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageHeaderProvider>
      <SidebarProvider>
        <Shell>{children}</Shell>
      </SidebarProvider>
    </PageHeaderProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed, toggle } = useSidebar();
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
      <ModuleRail />
      <PagesPanel />
      <Topbar onOpenSearch={openSearch} />

      {/* Backdrop — mobile only, shown when PagesPanel is expanded (overlay mode) */}
      {!collapsed && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30 transition-opacity"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      <main
        className={`mt-16 min-h-[calc(100dvh-4rem)] bg-[#F5F5F5] p-4 md:p-8 transition-[margin-left] duration-200 ${
          collapsed ? "ml-14" : "md:ml-[296px] ml-14"
        }`}
      >
        {children}
      </main>

      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </>
  );
}
