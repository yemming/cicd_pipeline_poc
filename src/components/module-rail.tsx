"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { modules } from "@/lib/modules";
import { useSidebar } from "./sidebar-context";

export function ModuleRail() {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const activeKey = pathname.split("/")[1] || null;
  const onLauncher = !activeKey;

  return (
    <nav className="fixed left-0 top-0 h-dvh w-14 bg-[#0F0F1F] flex flex-col items-center py-3 z-[60] border-r border-white/5 overflow-hidden">
      {/* Launcher / Home */}
      <RailLink
        href="/"
        label="主地圖"
        icon="apps"
        active={onLauncher}
      />

      <div className="h-px w-8 bg-white/10 my-3" />

      {/* Modules */}
      <div className="flex flex-col items-center gap-1 flex-1 overflow-y-auto">
        {modules.map((m) => (
          <RailLink
            key={m.key}
            href={m.comingSoon ? undefined : m.home}
            label={m.comingSoon ? `${m.name}（即將推出）` : m.name}
            icon={m.icon}
            active={activeKey === m.key}
            disabled={m.comingSoon}
            accent={m.accent}
            onActiveClick={activeKey === m.key ? toggle : undefined}
          />
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-1 mt-2">
        <RailLink href="/onboarding" label="新手導覽" icon="school" active={activeKey === "onboarding"} />
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors group relative"
            title="登出"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            <Tooltip>登出</Tooltip>
          </button>
        </form>
      </div>
    </nav>
  );
}

function RailLink({
  href,
  label,
  icon,
  active,
  disabled,
  accent,
  onActiveClick,
}: {
  href?: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
  onActiveClick?: () => void;
}) {
  const base =
    "w-10 h-10 flex items-center justify-center rounded-lg transition-colors group relative";
  const state = disabled
    ? "text-gray-600 cursor-not-allowed"
    : active
    ? "bg-white/10 text-tertiary-container"
    : "text-gray-400 hover:text-white hover:bg-white/5";

  const content = (
    <>
      <span
        className="material-symbols-outlined text-xl"
        style={active && accent ? { color: accent } : undefined}
      >
        {icon}
      </span>
      {active && (
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-l"
          style={{ backgroundColor: accent ?? "#C9A84C" }}
        />
      )}
      <Tooltip>{label}</Tooltip>
    </>
  );

  if (!href || disabled) {
    return (
      <div className={`${base} ${state}`} aria-disabled={disabled || undefined}>
        {content}
      </div>
    );
  }

  // 已選中的模組：點擊 toggle panel，不重新導航
  if (active && onActiveClick) {
    return (
      <button onClick={onActiveClick} className={`${base} ${state}`} title={label}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href} className={`${base} ${state}`}>
      {content}
    </Link>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded bg-[#1A1A2E] text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50">
      {children}
    </span>
  );
}
