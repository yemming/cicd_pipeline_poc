"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useActiveModule } from "@/lib/use-active-module";
import type { ModulePage } from "@/lib/modules";
import { useSidebar } from "./sidebar-context";

// ── Dock Row (magnification on mouse proximity) ───────────────────────────────

function DockRow({
  mouseY,
  page,
  isActive,
  accent,
}: {
  mouseY: MotionValue<number>;
  page: ModulePage;
  isActive: boolean;
  accent?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const fontSizeRaw = useTransform(distance, [-80, 0, 80], [13, 15, 13]);
  const iconSizeRaw = useTransform(distance, [-80, 0, 80], [18, 22, 18]);
  const pyRaw       = useTransform(distance, [-80, 0, 80], [7,  10,  7]);

  const fontSize = useSpring(fontSizeRaw, { mass: 0.1, stiffness: 150, damping: 12 });
  const iconSize = useSpring(iconSizeRaw, { mass: 0.1, stiffness: 150, damping: 12 });
  const py       = useSpring(pyRaw,       { mass: 0.1, stiffness: 150, damping: 12 });

  const baseClass = isActive
    ? "flex items-center gap-3 px-4 rounded-lg bg-white/10 text-white border-r-2 font-display font-medium"
    : "flex items-center gap-3 px-4 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 font-display transition-colors";

  const inner = (
    <motion.div
      ref={ref}
      className={baseClass}
      style={{
        paddingTop: py,
        paddingBottom: py,
        fontSize,
        ...(isActive && accent ? { borderRightColor: accent, color: "#fff" } : {}),
      }}
    >
      {page.icon && (
        <motion.span
          className="material-symbols-outlined leading-none shrink-0"
          style={{
            fontSize: iconSize,
            color: isActive && accent ? accent : undefined,
          }}
        >
          {page.icon}
        </motion.span>
      )}
      <span className="truncate flex-1">{page.name}</span>
      {page.device && page.device !== "desktop" && (
        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-white/10 text-white/50 uppercase tracking-wider shrink-0">
          {page.device === "mobile" ? "MOB" : "TAB"}
        </span>
      )}
    </motion.div>
  );

  if (page.comingSoon) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg text-gray-600 text-sm font-display cursor-not-allowed">
        {page.icon && (
          <span className="material-symbols-outlined text-lg">{page.icon}</span>
        )}
        <span className="truncate">{page.name}</span>
        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-medium">
          Soon
        </span>
      </div>
    );
  }

  return <Link href={page.href} className="outline-none block">{inner}</Link>;
}

// ── PagesPanel ────────────────────────────────────────────────────────────────

export function PagesPanel() {
  const pathname = usePathname();
  const activeModule = useActiveModule();
  const { collapsed } = useSidebar();
  const mouseY = useMotionValue(Infinity);

  if (!activeModule) return null;

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

  // Most-specific active page
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
      {/* Module header */}
      <div className="px-5 mb-5">
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

      {/* Page list — dock magnification on mouse proximity */}
      <nav
        className="flex-1 overflow-y-auto px-3 pb-2 pages-panel-nav"
        onMouseMove={(e) => mouseY.set(e.pageY)}
        onMouseLeave={() => mouseY.set(Infinity)}
      >
        {sections.map((section, si) => (
          <div key={`${section.title ?? "default"}-${si}`} className={si > 0 ? "mt-4" : ""}>
            {section.title && (
              <div className="px-4 mb-1 text-[9px] uppercase tracking-[0.15em] text-white/25 font-bold">
                {section.title}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((page) => (
                <DockRow
                  key={page.href}
                  mouseY={mouseY}
                  page={page}
                  isActive={!page.comingSoon && page.href === activeHref}
                  accent={activeModule.accent}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — dealer identity */}
      <div className="px-3 pt-2 shrink-0">
        <div className="mx-1 mb-2 border-t border-white/8" />
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
