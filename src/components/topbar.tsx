"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePageHeader } from "./page-header-context";
import { useAppearance } from "./appearance-context";
import { TopbarSearch } from "./topbar-search";
import { useProfile, getInitials } from "@/lib/use-profile";
import { getCurrentBrand } from "@/lib/brands/current";

interface TopbarProps {
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSearch }: TopbarProps) {
  const { hideSearch, breadcrumb } = usePageHeader();
  const profile = useProfile();
  const brand = getCurrentBrand();
  const { footerBadgeUrl } = useAppearance();

  // 內容捲動時把 topbar 變半透明 + 加 backdrop blur，讓底下內容能透出來
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  return (
    <header
      className={`fixed top-0 left-0 right-0 h-[52px] z-[60] flex items-center px-4 md:px-6 border-b border-white/10 transition-[background-color,backdrop-filter] duration-200 ${
        scrolled ? "backdrop-blur-md shadow-sm" : ""
      }`}
      style={{
        // 主色綁定 brand_palette；捲動時用 color-mix 推半透明 + blur 讓底下內容透出
        backgroundColor: scrolled
          ? "color-mix(in srgb, var(--color-brand-primary) 78%, transparent)"
          : "var(--color-brand-primary)",
      }}
    >
      {/* Left segment（吃滿剩餘空間）：logo + breadcrumb */}
      <div className="flex-1 flex items-center min-w-0 gap-2 md:gap-3">
        {/* Logo：max-h-9 (36px) 對齊 52px topbar */}
        <div className="w-24 md:w-32 lg:w-40 shrink-0 flex items-center min-w-0 px-1">
          <Link href="/dashboard" className="block group leading-tight w-full">
            {footerBadgeUrl ? (
              <Image
                src={footerBadgeUrl}
                alt={brand.displayName}
                width={240}
                height={56}
                unoptimized
                className="max-h-9 w-auto max-w-full object-contain group-hover:opacity-80 transition-opacity brightness-0 invert"
              />
            ) : (
              <div className="text-center">
                <div className="text-sm font-bold text-white tracking-widest font-display group-hover:text-white/80 transition-colors">
                  DealerOS
                </div>
                <div className="text-[8px] font-bold tracking-[0.22em] uppercase group-hover:opacity-80 transition-opacity text-white/60">
                  {brand.shortName}
                </div>
              </div>
            )}
          </Link>
        </div>

        {/* Breadcrumb：對齊右側 metadata 字級 text-[10.5px]；最後一項白、前面 70% 透明 */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="hidden md:flex items-center gap-1.5 min-w-0 text-[10.5px] leading-tight">
            {breadcrumb.map((b, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <span key={`${i}-${b.label}`} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && (
                    <span className="text-white/40 select-none shrink-0">›</span>
                  )}
                  {b.href && !isLast ? (
                    <Link
                      href={b.href}
                      className="text-white/70 hover:text-white transition-colors truncate"
                    >
                      {b.label}
                    </Link>
                  ) : (
                    <span
                      className={`truncate ${
                        isLast ? "text-white font-medium" : "text-white/70"
                      }`}
                    >
                      {b.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
        )}
      </div>

      {/* Center segment：寬度 ≥ 1400px 才出現 inline 全域搜尋（dropdown 在 input 下方就地展開，不再彈 overlay）。
          窄於 1400px 整段藏起、改用右側放大鏡 icon → CommandPalette overlay。 */}
      {!hideSearch && (
        <div className="hidden min-[1400px]:flex shrink-0 justify-center px-3 min-[1400px]:w-[380px] 2xl:w-[460px]">
          <TopbarSearch placeholder={brand.searchPlaceholder} />
        </div>
      )}

      {/* Right segment：metadata + actions（含 search icon，無論寬度都保留，行動裝置時為唯一入口） */}
      <div className="flex-1 flex items-center justify-end gap-0.5 md:gap-2 pl-1 md:pl-2 min-w-0">
        {/* 品牌 / 門店 一條橫排，slash 分隔。whitespace-nowrap + shrink-0 避免被中央 search 擠到折行 */}
        <div className="hidden md:flex items-center leading-tight text-[10.5px] text-white font-medium whitespace-nowrap shrink-0">
          <span>{brand.displayName}</span>
          <span className="mx-1.5 text-white/40">/</span>
          <span>台北直營店</span>
        </div>
        {/* 淡白 vertical divider —— 把 metadata 與右側互動 icons 視覺分群 */}
        <div className="hidden md:block w-px h-7 bg-white/20 mx-1" />
        {/* Global search：純 icon，點開 CommandPalette */}
        {!hideSearch && (
          <button
            onClick={onOpenSearch}
            className="p-1.5 md:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all"
            title={brand.searchPlaceholder}
          >
            <span className="material-symbols-outlined text-[20px] md:text-[22px]">search</span>
          </button>
        )}
        <button className="p-1.5 md:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all relative">
          <span className="material-symbols-outlined text-[20px] md:text-[22px]">notifications</span>
          <span
            className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-1.5 h-1.5 md:w-2 md:h-2 bg-red-400 rounded-full border-2"
            style={{ borderColor: "var(--color-brand-primary)" }}
          />
        </button>
        <div
          className="w-7 h-7 md:w-8 md:h-8 rounded-full overflow-hidden cursor-pointer hover:ring-2 hover:ring-white/50 transition-all flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#0F6E56" }}
        >
          <span className="text-white text-[10px] md:text-[11px] font-black font-display leading-none">
            {getInitials(profile?.name)}
          </span>
        </div>
      </div>
    </header>
  );
}
