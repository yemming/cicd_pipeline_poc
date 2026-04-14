"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveModule } from "@/lib/use-active-module";
import type { ModulePage } from "@/lib/modules";
import { useSidebar } from "./sidebar-context";

export function PagesPanel() {
  const pathname = usePathname();
  const activeModule = useActiveModule();
  const { collapsed, toggle } = useSidebar();

  if (!activeModule) {
    return <LauncherPanel collapsed={collapsed} toggle={toggle} />;
  }

  // Group pages by `section` while preserving registry order.
  const sections: Array<{ title: string | null; items: ModulePage[] }> = [];
  for (const p of activeModule.pages) {
    const label = p.section ?? null;
    const last = sections[sections.length - 1];
    if (last && last.title === label) {
      last.items.push(p);
    } else {
      sections.push({ title: label, items: [p] });
    }
  }

  // Pick the single most-specific active page — prevents parent routes like
  // /sales/customers from staying lit when on /sales/customers/tags.
  const activeHref: string | null = (() => {
    let best: string | null = null;
    for (const p of activeModule.pages) {
      if (p.comingSoon) continue;
      if (pathname === p.href || pathname.startsWith(p.href + "/")) {
        if (!best || p.href.length > best.length) best = p.href;
      }
    }
    return best;
  })();

  return (
    <aside
      className={`fixed left-14 top-0 h-screen w-60 bg-[#1A1A2E] flex flex-col py-6 z-40 shadow-xl transition-transform duration-200 ${
        collapsed ? "-translate-x-full" : "translate-x-0"
      }`}
    >
      {/* Collapse handle — hanging off right edge */}
      <CollapseHandle collapsed={collapsed} toggle={toggle} />

      {/* Back to launcher */}
      <div className="px-5 mb-5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors mb-5"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          <span>主地圖</span>
        </Link>

        {/* Module header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: activeModule.accent
                ? `${activeModule.accent}22`
                : "rgba(204,0,0,0.15)",
            }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ color: activeModule.accent ?? "#CC0000" }}
            >
              {activeModule.icon}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-white font-display font-bold text-base tracking-tight truncate">
              {activeModule.name}
            </div>
            {activeModule.description && (
              <div className="text-white/40 text-[10px] truncate">
                {activeModule.description}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Page list (grouped by section) */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {sections.map((section, si) => (
          <div key={`${section.title ?? "default"}-${si}`} className={si > 0 ? "mt-4" : ""}>
            {section.title && (
              <div className="px-4 mb-1 text-[9px] uppercase tracking-[0.15em] text-white/25 font-bold">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((page) => {
                const isActive = !page.comingSoon && page.href === activeHref;

                if (page.comingSoon) {
                  return (
                    <div
                      key={page.href}
                      className="flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 text-sm font-display cursor-not-allowed"
                      aria-disabled="true"
                    >
                      {page.icon && (
                        <span className="material-symbols-outlined text-lg">
                          {page.icon}
                        </span>
                      )}
                      <span className="truncate">{page.name}</span>
                      <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-medium">
                        Soon
                      </span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    className={
                      isActive
                        ? "flex items-center gap-3 px-4 py-2 rounded-lg bg-white/10 text-white border-r-2 text-sm font-display font-medium transition-all"
                        : "flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 text-sm font-display transition-colors"
                    }
                    style={
                      isActive && activeModule.accent
                        ? { borderRightColor: activeModule.accent, color: "#fff" }
                        : undefined
                    }
                  >
                    {page.icon && (
                      <span
                        className="material-symbols-outlined text-lg"
                        style={isActive && activeModule.accent ? { color: activeModule.accent } : undefined}
                      >
                        {page.icon}
                      </span>
                    )}
                    <span className="truncate flex-1">{page.name}</span>
                    {page.device && page.device !== "desktop" && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-white/10 text-white/50 uppercase tracking-wider">
                        {page.device === "ipad" ? "iPad" : page.device === "tablet" ? "Tab" : "Mob"}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 pt-4 border-t border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-lg">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: "#CC0000" }}
          >
            <span className="material-symbols-outlined text-base">two_wheeler</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-white text-xs font-bold truncate">
              Ducati Taipei
            </span>
            <span className="text-gray-500 text-[10px]">Official Dealer</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function LauncherPanel({ collapsed, toggle }: { collapsed: boolean; toggle: () => void }) {
  return (
    <aside
      className={`fixed left-14 top-0 h-screen w-60 bg-[#1A1A2E] flex flex-col py-6 z-40 shadow-xl transition-transform duration-200 ${
        collapsed ? "-translate-x-full" : "translate-x-0"
      }`}
    >
      <CollapseHandle collapsed={collapsed} toggle={toggle} />
      <div className="px-6">
        <div className="text-2xl font-bold text-white tracking-widest font-display">
          DealerOS
        </div>
        <div className="text-xs font-medium tracking-tight mt-1 opacity-80 uppercase" style={{ color: "#CC0000" }}>
          Ducati Edition
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <span className="material-symbols-outlined text-white/15 text-6xl mb-4">
          apps
        </span>
        <div className="text-white/70 text-sm font-medium mb-1">選擇一個應用</div>
        <div className="text-white/30 text-xs leading-relaxed">
          點擊左側圖示
          <br />
          或右方磁磚開始
        </div>
      </div>

      <div className="px-5 pt-4 border-t border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-lg">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: "#CC0000" }}
          >
            <span className="material-symbols-outlined text-base">two_wheeler</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-white text-xs font-bold truncate">
              Ducati Taipei
            </span>
            <span className="text-gray-500 text-[10px]">Official Dealer</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function CollapseHandle({
  collapsed,
  toggle,
}: {
  collapsed: boolean;
  toggle: () => void;
}) {
  return (
    <button
      onClick={toggle}
      className="hidden md:flex absolute -right-3 top-20 w-6 h-10 items-center justify-center rounded-r-lg bg-[#1A1A2E] hover:bg-[#CC0000] text-white/70 hover:text-white shadow-md transition-colors z-10 border-l-0 border border-white/10"
      title={collapsed ? "展開側邊欄（⌘B）" : "收合側邊欄（⌘B）"}
      aria-label={collapsed ? "展開側邊欄" : "收合側邊欄"}
    >
      <span className="material-symbols-outlined text-base">
        {collapsed ? "chevron_right" : "chevron_left"}
      </span>
    </button>
  );
}
