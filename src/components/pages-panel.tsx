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
import { getCurrentBrand } from "@/lib/brands/current";
import { useSidebar } from "./sidebar-context";
import { useIsAdmin } from "./admin-context";

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

  const fontSizeRaw = useTransform(distance, [-80, 0, 80], [14, 16, 14]);
  const iconSizeRaw = useTransform(distance, [-80, 0, 80], [18, 22, 18]);
  const pyRaw       = useTransform(distance, [-80, 0, 80], [7,  10,  7]);

  const fontSize = useSpring(fontSizeRaw, { mass: 0.1, stiffness: 150, damping: 12 });
  const iconSize = useSpring(iconSizeRaw, { mass: 0.1, stiffness: 150, damping: 12 });
  const py       = useSpring(pyRaw,       { mass: 0.1, stiffness: 150, damping: 12 });

  // 主題切換：active / hover bg 與 text 走 CSS var；hover 用 group-hover 配 :hover bg fallback
  const baseClass = isActive
    ? "flex items-center gap-3 px-4 rounded-lg border-r-2 font-display font-medium text-[color:var(--sidebar-text)]"
    : "flex items-center gap-3 px-4 rounded-lg text-[color:var(--sidebar-text-muted)] hover:text-[color:var(--sidebar-text)] font-display transition-colors pages-panel-row-hover";

  const inner = (
    <motion.div
      ref={ref}
      className={baseClass}
      style={{
        paddingTop: py,
        paddingBottom: py,
        fontSize,
        backgroundColor: isActive ? "var(--sidebar-active)" : undefined,
        ...(isActive && accent ? { borderRightColor: accent } : {}),
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
      {page.device && (
        <span
          className={`text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full ring-1 mr-1.5 shrink-0 ${
            page.device === "mobile"
              ? "ring-emerald-400/60 text-emerald-300"
              : "ring-sky-400/60 text-sky-300"
          }`}
        >
          {page.device === "mobile" ? "M" : "T"}
        </span>
      )}
    </motion.div>
  );

  if (page.comingSoon) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-display cursor-not-allowed opacity-50 text-[color:var(--sidebar-text-muted)]"
      >
        {page.icon && (
          <span className="material-symbols-outlined text-lg">{page.icon}</span>
        )}
        <span className="truncate">{page.name}</span>
        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-medium bg-[color:var(--sidebar-hover)] text-[color:var(--sidebar-text-muted)]">
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
  const isAdmin = useIsAdmin();
  const brand = getCurrentBrand();
  const mouseY = useMotionValue(Infinity);

  if (!activeModule) return null;

  const visiblePages = activeModule.pages.filter((p) => !p.adminOnly || isAdmin);

  // Group pages by `section` while preserving registry order.
  const sections: Array<{ title: string | null; items: ModulePage[] }> = [];
  for (const p of visiblePages) {
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
    for (const p of visiblePages) {
      if (p.comingSoon) continue;
      if (pathname === p.href || pathname.startsWith(p.href + "/")) {
        if (!best || p.href.length > best.length) best = p.href;
      }
    }
    return best;
  })();

  return (
    <aside
      className={`fixed left-14 top-0 h-dvh w-[248px] flex flex-col py-6 z-[55] shadow-xl transition-transform duration-200 ${
        collapsed ? "-translate-x-full" : "translate-x-0"
      }`}
      style={{ backgroundColor: "var(--sidebar-panel-bg)" }}
    >
      {/* Module header */}
      <div className="px-5 mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: activeModule.accent
                ? `${activeModule.accent}22`
                : "color-mix(in srgb, var(--color-brand-primary) 15%, transparent)",
            }}
          >
            <span
              className="material-symbols-outlined text-xl"
              style={{ color: activeModule.accent ?? "var(--color-brand-primary)" }}
            >
              {activeModule.icon}
            </span>
          </div>
          <div className="min-w-0">
            <div
              className="font-display font-bold text-base tracking-tight truncate"
              style={{ color: "var(--sidebar-text)" }}
            >
              {activeModule.name}
            </div>
            {activeModule.description && (
              <div
                className="text-[10px] truncate opacity-70"
                style={{ color: "var(--sidebar-text-muted)" }}
              >
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
              <div
                className="px-4 mb-1 text-[9px] uppercase tracking-[0.15em] font-bold opacity-60"
                style={{ color: "var(--sidebar-text-muted)" }}
              >
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

      {/* Footer — DealerOS 版本宣言（客戶 logo 已搬到 topbar 主位） */}
      <div className="px-3 pt-2 shrink-0">
        <div
          className="mx-1 mb-2 border-t"
          style={{ borderColor: "var(--sidebar-divider)" }}
        />
        <Link
          href="/dashboard"
          className="block leading-tight text-center py-3 hover:opacity-80 transition-opacity"
        >
          <div
            className="text-sm font-bold tracking-widest font-display"
            style={{ color: "var(--sidebar-text)" }}
          >
            DealerOS
          </div>
          <div
            className="text-[8px] font-bold tracking-[0.22em] uppercase mt-0.5"
            style={{ color: "var(--color-brand-primary)" }}
          >
            {brand.shortName}
          </div>
        </Link>
      </div>
    </aside>
  );
}
