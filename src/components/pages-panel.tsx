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
    return null;
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
      className={`fixed left-14 top-0 h-dvh w-60 bg-[#1A1A2E] flex flex-col py-6 z-[55] shadow-xl transition-transform duration-200 ${
        collapsed ? "-translate-x-full" : "translate-x-0"
      }`}
    >

      {/* DealerOS Logo → back to launcher */}
      <div className="px-5 mb-5">
        <Link href="/" className="block mb-5 group text-center">
          <div className="text-xl font-bold text-white tracking-widest font-display group-hover:text-white/80 transition-colors">
            DealerOS
          </div>
          <div className="text-[10px] font-medium tracking-[0.25em] uppercase opacity-80 group-hover:opacity-100 transition-opacity" style={{ color: "#CC0000" }}>
            Ducati&nbsp;Edition
          </div>
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
      <nav className="flex-1 overflow-y-auto px-3 pb-2 pages-panel-nav">
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

      {/* Footer actions */}
      <div className="px-3 pt-2 shrink-0">
        {/* 教學 */}
        <Link
          href="/onboarding"
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 text-sm font-display transition-colors"
        >
          <span className="material-symbols-outlined text-lg">school</span>
          <span>教學導覽</span>
        </Link>

        {/* 登出 */}
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 text-sm font-display transition-colors"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            <span>登出</span>
          </button>
        </form>

        {/* Divider */}
        <div className="mx-4 my-2 border-t border-white/8" />

        {/* Dealer identity */}
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: "#CC0000" }}
          >
            <span className="material-symbols-outlined text-sm">two_wheeler</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-white text-xs font-bold truncate">Ducati Taipei</span>
            <span className="text-gray-500 text-[10px]">Official Dealer</span>
          </div>
        </div>
      </div>
    </aside>
  );
}


