"use client";

import { useEffect, useRef, useState } from "react";
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
import { modules } from "@/lib/modules";
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

function VerticalDock({ items }: { items: DockItem[] }) {
  const mouseY = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseY.set(e.pageY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      className="flex flex-col items-center gap-1"
    >
      {items.map((item) => (
        <IconContainer mouseY={mouseY} key={item.title} {...item} />
      ))}
    </motion.div>
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
  const [hovered, setHovered] = useState(false);
  const [tooltipY, setTooltipY] = useState(0);
  const dismissTimerRef = useRef<number | null>(null);

  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const sizeTransform   = useTransform(distance, [-100, 0, 100], [28, 52, 28]);
  const iconSizeTransform = useTransform(distance, [-100, 0, 100], [14, 26, 14]);

  const size     = useSpring(sizeTransform,     { mass: 0.1, stiffness: 150, damping: 12 });
  const iconSize = useSpring(iconSizeTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  useEffect(() => () => {
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
  }, []);

  const clearDismissTimer = () => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const handlePointerEnter = (e: React.PointerEvent) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds) setTooltipY(bounds.top + bounds.height / 2);
    setHovered(true);
    clearDismissTimer();
    // 觸控裝置的 pointerleave 經常 fire 不到（手指抬起就離開元素），
    // 設 auto-dismiss 避免 tooltip state stuck 殘留。滑鼠靠 pointerLeave 即時清。
    if (e.pointerType !== "mouse") {
      dismissTimerRef.current = window.setTimeout(() => setHovered(false), 1200);
    }
  };

  const handlePointerLeave = () => {
    setHovered(false);
    clearDismissTimer();
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
        {hovered && (
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
  const activeKey = pathname.split("/")[1] || null;
  const onLauncher = !activeKey;

  const activeModule = modules.find((m) => m.key === activeKey);
  const currentPage  = activeModule?.pages.find(
    (p) => p.href === pathname || pathname.startsWith(p.href + "/")
  );
  const isDevicePage = !!currentPage?.device && currentPage.device !== "desktop";

  if (fullHidden) return null;

  const topItems: DockItem[] = [
    {
      title: isDevicePage ? "隱藏導航列" : "主地圖",
      icon: <MatIcon name="apps" />,
      href: isDevicePage ? undefined : "/",
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
