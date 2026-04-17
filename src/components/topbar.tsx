"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePageHeader } from "./page-header-context";
import { useSidebar } from "./sidebar-context";
import { useProfile, getInitials } from "@/lib/use-profile";
import { useActiveModule } from "@/lib/use-active-module";

interface TopbarProps {
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSearch }: TopbarProps) {
  const { hideSearch } = usePageHeader();
  const { collapsed, fullHidden } = useSidebar();
  const profile = useProfile();
  const activeModule = useActiveModule();
  const pathname = usePathname();

  // 找到當前頁面的 icon + name
  const currentPage = activeModule?.pages.find(
    (p) => p.href === pathname || pathname.startsWith(p.href + "/")
  );

  return (
    <header
      className={`fixed top-0 right-0 h-16 z-[55] bg-white/80 backdrop-blur-md border-b border-surface-container-high flex items-center px-4 md:px-6 transition-[left] duration-200 ${
        fullHidden ? "left-0" : (collapsed || !activeModule) ? "left-14" : "md:left-[296px] left-14"
      }`}
    >
      {/* Left: DealerOS logo → back to launcher */}
      <div className="w-36 md:w-48 shrink-0 flex items-center min-w-0">
        <Link href="/" className="block group text-center leading-tight">
          <div className="text-sm font-bold text-[#1A1A2E] tracking-widest font-display group-hover:text-[#1A1A2E]/70 transition-colors">
            DealerOS
          </div>
          <div className="text-[8px] font-bold tracking-[0.22em] uppercase group-hover:opacity-80 transition-opacity" style={{ color: "#CC0000" }}>
            Ducati&nbsp;Edition
          </div>
        </Link>
      </div>

      {/* Center: Search — truly centered */}
      {!hideSearch && (
        <div className="flex-1 flex justify-center px-4">
          <div className="relative group w-full max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg group-focus-within:text-[#CC0000]">
              search
            </span>
            <input
              onClick={onOpenSearch}
              readOnly
              className="w-full pl-10 pr-16 py-2 bg-surface-container-low border-none rounded-full text-sm focus:ring-1 focus:ring-[#CC0000]/40 transition-all placeholder:text-slate-400 cursor-pointer"
              placeholder="搜尋客戶、訂單、機車..."
              type="text"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex gap-1">
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">⌘</kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-400 font-sans">K</kbd>
            </div>
          </div>
        </div>
      )}
      {hideSearch && <div className="flex-1" />}

      {/* Right: Actions */}
      <div className="shrink-0 flex items-center justify-end gap-1 md:gap-3 pl-2">
        <Link
          href={`/feedback/tickets/new?url=${encodeURIComponent(pathname ?? "")}`}
          className="p-2 text-violet-600 hover:bg-violet-50 rounded-full transition-all flex items-center gap-1"
          title="回報問題 / 開許願單"
        >
          <span className="material-symbols-outlined">feedback</span>
        </Link>
        <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all relative">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>
        <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-all hidden md:flex">
          <span className="material-symbols-outlined">help_outline</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-[#1A1A2E] overflow-hidden border border-slate-100 cursor-pointer hover:ring-2 hover:ring-[#CC0000] transition-all flex items-center justify-center shrink-0">
          <span className="text-white text-[11px] font-black font-display leading-none">
            {getInitials(profile?.name)}
          </span>
        </div>
      </div>
    </header>
  );
}
