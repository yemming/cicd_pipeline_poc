"use client";

/**
 * Classic dual-rail shell — Ducati 原本的殼。
 *
 * 從 src/components/workspace-shell.tsx 的 Shell function 抽出；
 * 全域 CommandPalette overlay 跟鍵盤監聽搬到 WorkspaceShell，
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
  const { collapsed, fullHidden, setFullHidden } = useSidebar();
  const activeModule = useActiveModule();
  const onLauncher = !activeModule;
  const { open: openSearch } = useSearchControls();

  return (
    <>
      {!fullHidden && <ModuleRail />}
      {!fullHidden && <PagesPanel />}
      <Topbar onOpenSearch={openSearch} />

      {/* fullHidden 時整條 nav 都收掉，左緣只剩這個低調小 tab（仿 Excel sheet 標籤，
          貼齊左邊、右側圓角、中間小三角貼飾）。按一下回復導航。 */}
      {fullHidden && (
        <button
          onClick={() => setFullHidden(false)}
          className="fixed top-1/2 -translate-y-1/2 left-0 z-[70] w-3.5 h-7 rounded-r-md bg-black/15 hover:bg-black/35 flex items-center justify-center transition-colors"
          title="顯示導航列"
          aria-label="顯示導航列"
        >
          <span className="material-symbols-outlined text-[12px] text-white leading-none -mr-0.5">
            chevron_right
          </span>
        </button>
      )}

      <main
        className={`mt-[52px] min-h-[calc(100dvh-52px)] min-w-0 bg-[#F5F5F5] p-4 md:p-6 lg:p-8 transition-[margin-left] duration-200 ${
          fullHidden ? "ml-0" : onLauncher || collapsed ? "ml-11" : "ml-[244px]"
        }`}
        style={{
          ["--shell-left" as string]: fullHidden ? "0px" : onLauncher || collapsed ? "2.75rem" : "15.25rem",
        }}
      >
        {children}
      </main>
    </>
  );
}
