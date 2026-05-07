"use client";

/**
 * Modern single-sidebar shell — Indian brand 預設、parts 模組設計版型。
 *
 * 由 SHELL_REGISTRY 在 brand_appearance.shell_layout = 'modern-single-sidebar' 時派發。
 * 全域 overlay (CommandPalette / StickyNotesLayer) 跟鍵盤監聽由 WorkspaceShell 統一管。
 */

import { useSearchControls } from "@/components/search-context";
import { useSidebar } from "@/components/sidebar-context";
import { ModernSidebar } from "./modern-sidebar";
import { ModernTopbar } from "./modern-topbar";

export function ModernShell({ children }: { children: React.ReactNode }) {
  const { open: openSearch } = useSearchControls();
  const { collapsed, fullHidden, setCollapsed, setFullHidden } = useSidebar();

  return (
    <>
      <ModernTopbar onOpenSearch={openSearch} />
      <ModernSidebar />

      {/* RWD backdrop — 行動裝置展開時點擊收回 */}
      {!collapsed && !fullHidden && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-[90] transition-opacity"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}

      {/* fullHidden 時的「拉回」按鈕 */}
      {fullHidden && (
        <button
          onClick={() => setFullHidden(false)}
          className="fixed top-3 -left-5 z-[201] w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm border border-black/10 text-black/40 hover:text-black/70 hover:-left-2 transition-all shadow-sm"
          title="顯示導航列"
        >
          <span className="material-symbols-outlined text-xl">apps</span>
        </button>
      )}

      <main
        className={`min-h-[calc(100dvh-var(--shell-topbar-h,52px))] min-w-0 bg-[#F8F7F4] p-5 md:p-6 transition-[margin-left] duration-200 ${
          fullHidden ? "ml-0" : collapsed ? "ml-0 lg:ml-[var(--shell-sidebar-w,220px)]" : "ml-0 lg:ml-[var(--shell-sidebar-w,220px)]"
        }`}
        style={{
          marginTop: "var(--shell-topbar-h, 52px)",
          ["--shell-left" as string]: fullHidden
            ? "0px"
            : collapsed
              ? "0px"
              : "var(--shell-sidebar-w, 220px)",
        }}
      >
        {children}
      </main>
    </>
  );
}
