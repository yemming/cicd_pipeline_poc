"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePageHeader } from "./page-header-context";
import { useAppearance } from "./appearance-context";
import { TopbarSearch } from "./topbar-search";
import { useProfile, getInitials } from "@/lib/use-profile";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";
import { ScopeSwitcher } from "./scope-switcher";
import { NotificationBell } from "./notification-bell";

interface TopbarProps {
  onOpenSearch: () => void;
}

export function Topbar({ onOpenSearch }: TopbarProps) {
  const { hideSearch, breadcrumb } = usePageHeader();
  const profile = useProfile();
  const activeBrand = useActiveBrand();
  const brand = brandConfigs[activeBrand];
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

        {/* Breadcrumb：對齊右側 metadata 字級 text-[10.5px]；最後一項白、前面 70% 透明。
            Mobile：只露最後 2 個（父 › 子），更早期的層級 md+ 才顯示，避免螢幕窄被擠壓。 */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1.5 min-w-0 text-[10.5px] leading-tight">
            {breadcrumb.map((b, i) => {
              const isLast = i === breadcrumb.length - 1;
              const isSecondToLast = i === breadcrumb.length - 2;
              const mobileVisible = isLast || isSecondToLast;
              return (
                <span
                  key={`${i}-${b.label}`}
                  className={`items-center gap-1.5 min-w-0 ${
                    mobileVisible ? "flex" : "hidden md:flex"
                  }`}
                >
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

      {/* Center segment：寬度 ≥ lg (1024px) 就出現 inline 全域搜尋（dropdown 在 input 下方就地展開，不再彈 overlay）。
          窄於 lg 整段藏起、改用右側放大鏡 icon → CommandPalette overlay。 */}
      {!hideSearch && (
        <div className="hidden lg:flex shrink-0 justify-center px-3 lg:w-[280px] xl:w-[380px] 2xl:w-[460px]">
          <TopbarSearch placeholder={brand.searchPlaceholder} />
        </div>
      )}

      {/* Right segment：metadata + actions（含 search icon，無論寬度都保留，行動裝置時為唯一入口） */}
      <div className="flex-1 flex items-center justify-end gap-0.5 md:gap-2 pl-1 md:pl-2 min-w-0">
        {/* 品牌 / 門店 切換器：吃 ScopeContext，可下拉切換 */}
        <div className="hidden md:flex shrink-0 items-center gap-1.5">
          <ScopeSwitcher />
          {/* 法人 chip 已拿掉（feedback ticket #8bc5bad2）：
              當前 1:1 brand-subsidiary 對映下，subsidiary.short_name（如「DealerOS Indian」）
              跟左側 brand logo 視覺重複、且把 Global Search 擠掉。
              要重新啟用：當系統升級成多 subsidiary per brand、user 需要切換時，
              改成 dropdown / pill 樣式（建議改用 subsidiary.metadata.short_label 而非 short_name 避免再混 brand 名）。 */}
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
        {/* RP8 站內通知中心鈴鐺：每 30s 輪詢站內通知、顯示未讀 badge + 下拉清單 */}
        <NotificationBell />
        <QuickAddFeedbackButton />
        <Link
          href="/me/profile"
          title={profile?.name ? `${profile.name} — 個人設定` : "個人設定"}
          className="w-7 h-7 md:w-8 md:h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-white/50 transition-all flex items-center justify-center shrink-0"
          style={{ backgroundColor: profile?.avatar_url ? undefined : "#0F6E56" }}
        >
          {profile?.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.name ?? "個人設定"}
              width={32}
              height={32}
              unoptimized
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-[10px] md:text-[11px] font-black font-display leading-none">
              {getInitials(profile?.name)}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

/** Topbar 快捷：新增意見單，自動把當前頁網址帶過去 prefill 表單的「網址」欄 */
function QuickAddFeedbackButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams?.toString();
  const currentUrl = qs ? `${pathname}?${qs}` : pathname;
  const href = `/feedback/tickets/new?url=${encodeURIComponent(currentUrl ?? "/")}`;
  return (
    <Link
      href={href}
      title="新增意見單（自動帶當前頁網址）"
      aria-label="新增意見單"
      className="p-1.5 md:p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all inline-flex items-center justify-center"
    >
      <span className="material-symbols-outlined text-[20px] md:text-[22px]">add_comment</span>
    </Link>
  );
}
