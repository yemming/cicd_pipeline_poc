"use client";

import { useSetPageHeader } from "@/components/page-header-context";

interface Props {
  title: string;
  subtitle?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  hideSearch?: boolean;
}

/**
 * 薄包裝：把 Topbar 內容設定集中在一個 client component 裡，
 * 所有 notifications 子頁共用（避免每頁自己 use client）。
 */
export function NotificationsPageHeader({ title, subtitle, breadcrumb, hideSearch = true }: Props) {
  useSetPageHeader({
    title,
    breadcrumb: breadcrumb ?? [{ label: "通知中心" }, { label: title }],
    hideSearch,
  });

  // 頁首也在 content 區再重複寫一次標題/描述，Topbar 只呈現 breadcrumb
  return (
    <header className="border-b border-outline-variant bg-surface px-6 py-5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>}
    </header>
  );
}
