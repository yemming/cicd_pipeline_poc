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
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";
import { useSidebar } from "./sidebar-context";
import { useIsAdmin } from "./admin-context";
import { SectionedTree } from "./sections-tree";

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
  const brand = brandConfigs[useActiveBrand()];
  const mouseY = useMotionValue(Infinity);

  if (!activeModule) return null;

  const visiblePages = activeModule.pages.filter((p) => !p.adminOnly || isAdmin);

  // 樣板三層樹模式 — module.sections 由 nav loader 從 nav_nodes.section_group 產生
  const treeSections = activeModule.sections;
  const useTree = Array.isArray(treeSections) && treeSections.length > 0;

  // Group pages by `section` while preserving registry order.（dock fallback 用）
  const sections: Array<{ title: string | null; items: ModulePage[] }> = [];
  if (!useTree) {
    for (const p of visiblePages) {
      const label = p.section ?? null;
      const last = sections[sections.length - 1];
      if (last && last.title === label) {
        last.items.push(p);
      } else {
        sections.push({ title: label, items: [p] });
      }
    }
  }

  // Most-specific active page — 兩個模式都用得到
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
      className={`fixed left-11 top-[52px] h-[calc(100dvh-52px)] w-[200px] flex flex-col pt-3 pb-1 z-[55] shadow-xl transition-[transform,opacity,visibility] duration-200 ${
        collapsed
          ? "-translate-x-[244px] opacity-0 invisible pointer-events-none"
          : "translate-x-0 opacity-100 visible"
      }`}
      style={{ backgroundColor: "var(--sidebar-panel-bg)" }}
    >

      {/* Page list — 樣板樹狀（有 sections）或 dock magnification（fallback）。
         注意不要在 nav 上再加 bg-* — sidebar wrapper 已套 var(--sidebar-panel-bg)，
         往下一律繼承同一個 theme 色，9 套 sidebar theme 才會在每一階都生效。 */}
      {useTree ? (
        <nav className="flex-1 overflow-y-auto pb-2 pages-panel-nav">
          <SectionedTree sections={treeSections!} activePageHref={activeHref} />
        </nav>
      ) : (
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
      )}

      {/* Footer — DealerOS 版本宣言：兩行緊貼、極簡 */}
      <div className="px-3 shrink-0">
        <Link
          href="/dashboard"
          className="block text-center py-0 leading-[1.15] hover:opacity-70 transition-opacity"
        >
          <div
            className="text-[8px] font-medium tracking-[0.18em] uppercase font-display"
            style={{ color: "var(--sidebar-text-muted)" }}
          >
            DealerOS
          </div>
          <div
            className="text-[8px] font-medium tracking-[0.18em] uppercase"
            style={{ color: "var(--color-brand-primary)" }}
          >
            {brand.shortName}
          </div>
        </Link>
      </div>
    </aside>
  );
}
