"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";
import { modules, resolveModuleFromPathname } from "@/lib/modules";
import { useSidebar } from "./sidebar-context";

// ── Vertical Floating Dock (adapted from Aceternity UI) ─────────────────────

type DockItem = {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  accent?: string;
};

// 共用單一 hovered 的 context —— iOS Safari 對 touch 會 fire 假的 pointerenter
// 但永遠不 fire pointerleave，若每個 IconContainer 各自持有 hovered state，跳頁時
// 舊頁 tooltip 會累積在新頁（用戶看到的多個泡泡同時浮著）。
// 把 state 提升到 VerticalDock 共享：任何時刻全 rail 只能一個 tooltip。
type ModuleHoverState = {
  hovered: string | null;
  setHovered: (title: string | null) => void;
};
const ModuleHoverContext = createContext<ModuleHoverState | null>(null);

function VerticalDock({ items }: { items: DockItem[] }) {
  const mouseY = useMotionValue(Infinity);
  const [hovered, setHovered] = useState<string | null>(null);
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);

  // 跳頁時強制清掉 hovered，避免 iOS Safari 沒 fire pointerleave 造成 stuck。
  useEffect(() => {
    setHovered(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname]);

  // 觸控裝置再加 auto-dismiss 800ms 保底（滑鼠 user 繼續走 pointerleave 即時清）。
  useEffect(() => {
    if (hovered === null) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: none)").matches) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setHovered(null), 800);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hovered]);

  return (
    <ModuleHoverContext.Provider value={{ hovered, setHovered }}>
      <motion.div
        onMouseMove={(e) => mouseY.set(e.pageY)}
        onMouseLeave={() => mouseY.set(Infinity)}
        className="flex flex-col items-center gap-1"
      >
        {items.map((item) => (
          <IconContainer mouseY={mouseY} key={item.title} {...item} />
        ))}
      </motion.div>
    </ModuleHoverContext.Provider>
  );
}

function IconContainer({
  mouseY,
  title,
  icon,
  href,
  onClick,
  active,
  accent,
}: DockItem & { mouseY: MotionValue }) {
  const ref = useRef<HTMLDivElement>(null);
  const hoverCtx = useContext(ModuleHoverContext);
  const isHovered = hoverCtx?.hovered === title;
  const [tooltipY, setTooltipY] = useState(0);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const sizeTransform   = useTransform(distance, [-100, 0, 100], [28, 52, 28]);
  const iconSizeTransform = useTransform(distance, [-100, 0, 100], [14, 26, 14]);

  const size     = useSpring(sizeTransform,     { mass: 0.1, stiffness: 150, damping: 12 });
  const iconSize = useSpring(iconSizeTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  const handlePointerEnter = () => {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds) setTooltipY(bounds.top + bounds.height / 2);
    hoverCtx?.setHovered(title);
  };

  const handlePointerLeave = () => {
    // 只在 still active 時清，避免 race 把別人的 tooltip 誤清。
    if (hoverCtx?.hovered === title) hoverCtx.setHovered(null);
  };

  const inner = (
    <motion.div
      ref={ref}
      style={{ width: size, height: size }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-xl transition-colors",
        active ? "bg-white/15" : "hover:bg-white/8"
      )}
    >
      {/* Tooltip — fixed position to escape overflow:hidden containers */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            style={{ top: tooltipY, left: 68 }}
            className="pointer-events-none fixed -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-700/90 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white shadow-lg z-[200]"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active pip */}
      {active && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-l"
          style={{ backgroundColor: accent ?? "#C9A84C" }}
        />
      )}

      {/* Icon */}
      <motion.div
        style={{ width: iconSize, height: iconSize }}
        className="flex items-center justify-center text-white"
      >
        {icon}
      </motion.div>
    </motion.div>
  );

  if (onClick)
    return <button onClick={onClick} className="outline-none">{inner}</button>;
  if (href)
    return <Link href={href} className="outline-none">{inner}</Link>;
  return inner;
}

// ── ModuleRail ───────────────────────────────────────────────────────────────

function MatIcon({ name, color }: { name: string; color?: string }) {
  return (
    <span
      className="material-symbols-outlined leading-none"
      style={{ fontSize: "inherit", color: color ?? "currentColor" }}
    >
      {name}
    </span>
  );
}

export function ModuleRail() {
  const pathname  = usePathname();
  const { toggle, fullHidden, setFullHidden } = useSidebar();
  const rawSegment = pathname.split("/")[1] || null;
  const onLauncher = !rawSegment || rawSegment === "dashboard";

  // resolveModuleFromPathname handles URL-segment overrides (e.g. /feedback → settings)
  const activeModule = resolveModuleFromPathname(pathname);
  const activeKey = activeModule?.key ?? null;

  const currentPage  = activeModule?.pages.find(
    (p) => p.href === pathname || pathname.startsWith(p.href + "/")
  );
  const isDevicePage = !!currentPage?.device && currentPage.device !== "desktop";

  if (fullHidden) return null;

  const topItems: DockItem[] = [
    {
      title: isDevicePage ? "隱藏導航列" : "主地圖",
      icon: <MatIcon name="apps" />,
      href: isDevicePage ? undefined : "/dashboard",
      onClick: isDevicePage ? () => setFullHidden(true) : undefined,
      active: onLauncher,
    },
  ];

  const moduleItems: DockItem[] = modules.map((m) => ({
    title: m.comingSoon ? `${m.name}（即將推出）` : m.name,
    icon: <MatIcon name={m.icon} color={activeKey === m.key ? m.accent : undefined} />,
    href: m.comingSoon ? undefined : m.home,
    onClick: activeKey === m.key ? toggle : undefined,
    active: activeKey === m.key,
    accent: m.accent,
  }));

  const bottomItems: DockItem[] = [
    {
      title: "新手導覽",
      icon: <MatIcon name="school" />,
      href: "/onboarding",
      active: activeKey === "onboarding",
    },
  ];

  return (
    <nav className="fixed left-0 top-0 h-dvh w-14 bg-[#0F0F1F] flex flex-col items-center py-3 z-[60] border-r border-white/5">
      {/* Top: Launcher */}
      <VerticalDock items={topItems} />

      <div className="h-px w-6 bg-white/10 my-2" />

      {/* Modules */}
      <div className="flex-1 overflow-y-auto overflow-x-visible w-full flex flex-col items-center">
        <VerticalDock items={moduleItems} />
      </div>

      {/* Bottom */}
      <div className="mt-2 flex flex-col items-center gap-1">
        <VerticalDock items={bottomItems} />

        {/* Logout (form, can't be in DockItem easily) */}
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-7 h-7 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/8 transition-colors group relative"
            title="登出"
          >
            <MatIcon name="logout" />
            <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-[#1A1A2E] px-2.5 py-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-50 [@media(hover:none)]:hidden">
              登出
            </span>
          </button>
        </form>
      </div>
    </nav>
  );
}
