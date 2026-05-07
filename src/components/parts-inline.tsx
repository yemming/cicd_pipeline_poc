"use client";

import { useSetPageHeader } from "./page-header-context";
import type { TopbarBreadcrumb } from "./page-header-context";

interface PartsInlineProps {
  /** Pre-loaded body HTML (server-side via fs from public/parts-stitch/{file}.body.html).
   *  Passing `null` renders a graceful fallback — no crash. */
  html: string | null;
  title: string;
  breadcrumb?: TopbarBreadcrumb[];
  fileName?: string;
}

/**
 * Embeds extracted parts design HTML(已剝 chrome、scope 過 CSS 的 .body.html)。
 *
 * 原稿固定 220px sidebar + 桌面 1100px+ 主內容,手機開橫向捲動 banner。
 * CSS 已 scope 在 `.pd` wrapper,不會污染 modern shell。
 */
export function PartsInline({ html, title, breadcrumb, fileName }: PartsInlineProps) {
  useSetPageHeader({
    breadcrumb: breadcrumb ?? [{ label: title }],
  });

  if (html === null) {
    return (
      <div className="max-w-2xl mx-auto pt-16">
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl text-amber-600">
              image_not_supported
            </span>
          </div>
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-sm text-on-surface-variant mb-6">
            找不到設計稿:<code className="text-xs bg-slate-50 px-2 py-0.5 rounded">{fileName}.body.html</code>
          </p>
          <p className="text-xs text-slate-400">
            重跑 <code>python3 scripts/extract-parts-bodies.py</code> 重新生成
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-5 md:-m-6 min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <div className="md:hidden px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm leading-none">swipe</span>
        <span>桌面原稿 · 左右滑可看完整畫面</span>
      </div>
      {/* inline 設計稿內 onclick 需要這些 helpers — 不存在會 throw */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.go = (u) => { if (u) window.location.href = u; };
            window.openPanel = window.closePanel = window.toggleNav = () => {};
            window.openPO = window.openItem = window.openOrder = (id) => {};
          `,
        }}
      />
      <div className="overflow-x-auto">
        <div
          className="min-w-[1100px]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
