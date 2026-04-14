"use client";

import Link from "next/link";
import { usePageHeader } from "./page-header-context";
import { useSidebar } from "./sidebar-context";
import { useProfile, getInitials } from "@/lib/use-profile";

interface TopbarProps {
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSearch }: TopbarProps) {
  const { title, tabs, breadcrumb, hideSearch } = usePageHeader();
  const { collapsed } = useSidebar();
  const profile = useProfile();

  const today = new Date();
  const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")} ${weekdays[today.getDay()]}`;

  const hasTabs = tabs && tabs.length > 0;
  const hasBreadcrumb = breadcrumb && breadcrumb.length > 0;

  return (
    <header
      className={`fixed top-0 right-0 h-16 z-40 bg-white/80 backdrop-blur-md border-b border-surface-container-high flex justify-between items-center px-4 md:px-8 transition-[left] duration-200 ${
        collapsed ? "left-14" : "md:left-[296px] left-14"
      }`}
    >
      {/* Left: toggle + title + tabs, or breadcrumb */}
      <div className="flex items-center gap-4 md:gap-8 min-w-0">
        {title && (
          <span className="text-lg font-black text-[#1A1A2E] font-display whitespace-nowrap">
            {title}
          </span>
        )}

        {hasTabs ? (
          <nav className="flex gap-6">
            {tabs!.map((tab) => {
              if (tab.active) {
                return (
                  <span
                    key={tab.label}
                    className="text-tertiary-container font-bold border-b-2 border-tertiary-container pb-1 font-display text-sm"
                  >
                    {tab.label}
                  </span>
                );
              }
              if (tab.href) {
                return (
                  <Link
                    key={tab.label}
                    href={tab.href}
                    className="text-[#1A1A2E]/60 font-display text-sm hover:text-[#1A1A2E] transition-all"
                  >
                    {tab.label}
                  </Link>
                );
              }
              return (
                <button
                  key={tab.label}
                  onClick={tab.onClick}
                  className="text-[#1A1A2E]/60 font-display text-sm hover:text-[#1A1A2E] transition-all"
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        ) : hasBreadcrumb ? (
          <nav className="flex items-center text-sm font-medium">
            {breadcrumb!.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center">
                {i > 0 && (
                  <span className="material-symbols-outlined text-slate-300 mx-2 text-base">
                    chevron_right
                  </span>
                )}
                {crumb.href ? (
                  <Link href={crumb.href} className="text-slate-400 hover:text-on-surface transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-on-surface font-bold">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
      </div>

      {/* Center: Search */}
      {!hideSearch && (
        <div className="flex-1 max-w-md px-12">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within:text-[#CC0000]">
              search
            </span>
            <input
              onClick={onOpenSearch}
              readOnly
              className="w-full pl-10 pr-12 py-2 bg-surface-container-low border-none rounded-full text-sm focus:ring-1 focus:ring-[#CC0000]/40 transition-all placeholder:text-slate-400 cursor-pointer"
              placeholder="搜尋客戶、訂單、機車... ⌘K"
              type="text"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">
                ⌘
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">
                K
              </kbd>
            </div>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all relative">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all">
            <span className="material-symbols-outlined">help_outline</span>
          </button>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-500 hidden lg:inline">
            {dateStr}
          </span>
          <div className="w-8 h-8 rounded-full bg-[#1A1A2E] overflow-hidden border border-slate-100 cursor-pointer hover:ring-2 hover:ring-[#CC0000] transition-all flex items-center justify-center">
            <span className="text-white text-[11px] font-black font-display leading-none">
              {getInitials(profile?.name)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
