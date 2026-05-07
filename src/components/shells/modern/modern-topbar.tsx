"use client";

/**
 * Modern shell 的 navy 頂部條 — 52 px 高，固定深藍 (#1A3A5C)，
 * 透過 `--shell-topbar-bg` / `--shell-topbar-fg` 從 ShellLayout 注入。
 *
 * 結構（對應新 HTML 的 .hdr）：
 *   左：DealerOS logo（fallback 到 brand wordmark）+ 麵包屑（從 PageHeaderContext）
 *   右：search trigger + notifications + avatar
 */

import Link from "next/link";
import Image from "next/image";
import { useAppearance } from "@/components/appearance-context";
import { usePageHeader } from "@/components/page-header-context";
import { useSidebar } from "@/components/sidebar-context";
import { useProfile, getInitials } from "@/lib/use-profile";
import { getCurrentBrand } from "@/lib/brands/current";

interface Props {
  onOpenSearch: () => void;
}

export function ModernTopbar({ onOpenSearch }: Props) {
  const { footerBadgeUrl } = useAppearance();
  const { title, breadcrumb, hideSearch } = usePageHeader();
  const { toggle: toggleSidebar, collapsed } = useSidebar();
  const profile = useProfile();
  const brand = getCurrentBrand();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[200] flex items-center px-5 gap-3.5"
      style={{
        height: "var(--shell-topbar-h, 52px)",
        background: "var(--shell-topbar-bg, #1A3A5C)",
        color: "var(--shell-topbar-fg, #FFFFFF)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Hamburger (RWD) */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition"
        aria-label="收合 / 展開導航"
      >
        <span className="material-symbols-outlined text-[20px]">{collapsed ? "menu" : "menu_open"}</span>
      </button>

      {/* Logo: 客戶 footer badge（沒上傳就 fallback brand wordmark） */}
      <Link href="/dashboard" className="flex items-center gap-3.5 group">
        {footerBadgeUrl ? (
          <Image
            src={footerBadgeUrl}
            alt={brand.displayName}
            width={140}
            height={32}
            unoptimized
            className="max-h-7 w-auto object-contain group-hover:opacity-80 transition-opacity"
          />
        ) : (
          <span className="text-[17px] font-bold tracking-[2px] text-white group-hover:opacity-80 transition-opacity">
            {brand.shortName.split(" ")[0].toUpperCase()}
          </span>
        )}
        <span className="hidden md:block w-px h-5 bg-white/20" aria-hidden="true" />
      </Link>

      {/* Breadcrumb / page title */}
      <div className="hidden md:flex items-center gap-2 text-[13px] text-white/60 min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          breadcrumb.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2 min-w-0">
              {idx > 0 && <span className="text-white/30">›</span>}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-white truncate">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-white/85 font-medium truncate">{crumb.label}</span>
              )}
            </span>
          ))
        ) : title ? (
          <span className="text-white/85 font-medium truncate">{title}</span>
        ) : null}
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">
        {!hideSearch && (
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 px-3 h-8 rounded-md bg-white/10 hover:bg-white/15 text-white/75 text-[12px] transition"
            title={`${brand.searchPlaceholder} (⌘K)`}
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            <span className="hidden md:inline">搜尋</span>
            <kbd className="hidden md:inline-flex px-1 py-0.5 rounded bg-white/10 text-[10px] font-sans">⌘K</kbd>
          </button>
        )}
        <button
          className="relative w-7 h-7 rounded-md bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/85 text-[14px] transition"
          aria-label="通知"
        >
          <span className="material-symbols-outlined text-[16px]">notifications</span>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#E24B4A] text-white text-[9px] font-mono flex items-center justify-center">
            3
          </span>
        </button>
        <div
          className="w-7 h-7 rounded-md bg-[#0F6E56] flex items-center justify-center text-white text-[11px] font-semibold cursor-pointer hover:ring-2 hover:ring-white/30 transition"
          title={profile?.name ?? "Profile"}
        >
          {getInitials(profile?.name)}
        </div>
      </div>
    </header>
  );
}
