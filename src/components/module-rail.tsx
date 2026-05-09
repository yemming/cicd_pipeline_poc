"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useNav } from "./nav-provider";
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        "relative flex aspect-square items-center justify-center rounded-xl transition-colors module-rail-icon",
        active ? "module-rail-icon-active" : ""
      )}
    >
      {/* Tooltip — 用 portal render 到 body，跳出 ModuleRail 的 z-[55] stacking
            context（否則 PagesPanel 同 z-[55] 蓋掉，z-[200] 在 nav 內部 cap 失效） */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                style={{ top: tooltipY, left: 56 }}
                className="pointer-events-none fixed -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800/95 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white shadow-xl z-[9999]"
              >
                {title}
                {/* 左指向小三角，補 Mac 風格氣泡感 */}
                <span
                  className="absolute right-full top-1/2 -translate-y-1/2 border-y-[5px] border-r-[5px] border-y-transparent border-r-slate-800/95"
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* Active pip */}
      {active && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-l"
          style={{ backgroundColor: accent ?? "var(--color-brand-accent)" }}
        />
      )}

      {/* Icon */}
      <motion.div
        style={{ width: iconSize, height: iconSize, color: "var(--sidebar-text)" }}
        className="flex items-center justify-center"
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
  const { modules, resolveModuleFromPathname } = useNav();

  // resolveModuleFromPathname handles URL-segment overrides (e.g. /feedback → settings)
  const activeModule = resolveModuleFromPathname(pathname);
  // 用 id（uuid，DB-driven 唯一）優先；舊 hardcoded 才 fallback 到 key
  const activeIdent = activeModule ? (activeModule.id ?? activeModule.key) : null;

  if (fullHidden) return null;

  // 主地圖入口已經跟 topbar 左上的 Logo 重複，rail 上不再放，避免認知壓力。

  // 點擊行為：
  //   - active module icon → toggle PagesPanel（收 / 展），不 navigate
  //   - non-active module icon → navigate 到該 module home
  //   - comingSoon → 不可點
  const moduleItems: DockItem[] = modules.map((m) => {
    const ident = m.id ?? m.key;
    const isActive = activeIdent !== null && activeIdent === ident;
    const isToggle = isActive && !m.comingSoon;
    return {
      title: m.comingSoon ? `${m.name}（即將推出）` : m.name,
      icon: <MatIcon name={m.icon} color={isActive ? m.accent : undefined} />,
      href: isToggle ? undefined : (m.comingSoon ? undefined : m.home),
      onClick: isToggle ? toggle : undefined,
      active: isActive,
      accent: m.accent,
    };
  });

  // 左下 chevron — 把整條 navigation 縮成左邊小球（fullHidden）。
  // PagesPanel 收/展請點 active module icon。
  const bottomItems: DockItem[] = [
    {
      title: "隱藏導航列",
      icon: <MatIcon name="chevron_left" />,
      onClick: () => setFullHidden(true),
    },
  ];

  return (
    <nav
      className="fixed left-0 top-[52px] h-[calc(100dvh-52px)] w-11 flex flex-col items-center py-3 z-[55] border-r"
      style={{
        backgroundColor: "var(--sidebar-rail-bg)",
        borderColor: "var(--sidebar-divider)",
      }}
    >
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
            className="module-rail-logout w-7 h-7 flex items-center justify-center rounded-xl transition-colors group relative"
            style={{ color: "var(--sidebar-text-muted)" }}
            title="登出"
          >
            <MatIcon name="logout" />
            <span
              className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-50 [@media(hover:none)]:hidden"
              style={{ backgroundColor: "var(--sidebar-panel-bg)", color: "var(--sidebar-text)" }}
            >
              登出
            </span>
          </button>
        </form>
      </div>
    </nav>
  );
}
