"use client";

import { useSetPageHeader } from "./page-header-context";
import type { TopbarBreadcrumb } from "./page-header-context";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: string;
  breadcrumb?: TopbarBreadcrumb[];
}

export function PlaceholderPage({
  title,
  description = "此頁面規格撰寫中，畫面完成後會從 Stitch 同步進來。",
  icon = "construction",
  breadcrumb,
}: PlaceholderPageProps) {
  useSetPageHeader({
    breadcrumb: breadcrumb ?? [{ label: title }],
  });

  return (
    <div className="max-w-3xl mx-auto pt-12">
      <div className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 text-center">
        <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-on-surface-variant text-4xl">
            {icon}
          </span>
        </div>
        <h1 className="text-3xl font-bold font-display text-on-surface mb-3">
          {title}
        </h1>
        <p className="text-on-surface-variant text-sm max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
