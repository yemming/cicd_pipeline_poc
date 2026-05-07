"use client";

/**
 * Classic dual-rail shell — Ducati 原本的殼。
 *
 * 從 src/components/workspace-shell.tsx 的 Shell function 抽出；
 * 全域 overlay (CommandPalette / StickyNotesLayer) 跟鍵盤監聽搬到 WorkspaceShell，
 * shell 內部只負責 sidebar / topbar / main 三件事。
 *
 * 由 SHELL_REGISTRY 在 brand_appearance.shell_layout = 'classic-dual-rail' 時派發。
 */

import { ModuleRail } from "@/components/module-rail";
import { PagesPanel } from "@/components/pages-panel";
import { Topbar } from "@/components/topbar";
import { useSidebar } from "@/components/sidebar-context";
import { useSearchControls } from "@/components/search-context";
import { useActiveModule } from "@/lib/use-active-module";

export function ClassicShell({ children }: { children: React.ReactNode }) {
  const { collapsed, setCollapsed, fullHidden, setFullHidden } = useSidebar();
  const activeModule = useActiveModule();
  const onLauncher = !activeModule;
  const { open: openSearch } = useSearchControls();

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
          fullHidden ? "ml-0" : onLauncher || collapsed ? "ml-14" : "lg:ml-[304px] ml-14"
        }`}
        style={{
          ["--shell-left" as string]: fullHidden ? "0px" : onLauncher || collapsed ? "3.5rem" : "19rem",
        }}
      >
        {children}
      </main>
    </>
  );
}
