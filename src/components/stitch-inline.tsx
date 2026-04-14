"use client";

import { useSetPageHeader } from "./page-header-context";
import type { TopbarBreadcrumb } from "./page-header-context";

interface StitchInlineProps {
  /** Pre-loaded body HTML (read server-side via fs from public/stitch/{id}.body.html).
   *  Passing `null` renders a graceful fallback — no crash. */
  html: string | null;
  title: string;
  breadcrumb?: TopbarBreadcrumb[];
  sprint?: string;
  device?: "desktop" | "tablet" | "ipad" | "mobile";
  screenId?: string;
}

/**
 * Embeds pre-extracted Stitch body HTML directly into the page DOM (no iframe).
 * Because our Tailwind tokens match Stitch's, classes apply cleanly.
 *
 * Advantages over <StitchViewer>:
 *  - No iframe double-scroll, no sandbox overhead, no auth headaches
 *  - Styles inherit from our globals.css (true RWD)
 *  - Content is in the DOM — editable via devtools / code without rebuilds
 *
 * The user workflow to upgrade a page:
 *   1) Edit public/stitch/{id}.html directly, run strip-stitch-chrome.py
 *   2) Re-run scripts/extract-stitch-bodies.py to refresh *.body.html
 *   3) Or replace this page.tsx with a hand-written Faithful Clone (see /sales/showroom)
 */
export function StitchInline({ html, title, breadcrumb, sprint, device, screenId }: StitchInlineProps) {
  useSetPageHeader({
    breadcrumb: breadcrumb ?? [{ label: title }],
  });

  if (html === null) {
    return <MissingStitch title={title} sprint={sprint} device={device} screenId={screenId} />;
  }

  return (
    <div className="-m-8 bg-background text-on-surface min-h-[calc(100dvh-4rem)]">
      <div
        className="stitch-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function MissingStitch({
  title,
  sprint,
  device,
  screenId,
}: {
  title: string;
  sprint?: string;
  device?: string;
  screenId?: string;
}) {
  return (
    <div className="max-w-2xl mx-auto pt-16">
      <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center">
        <div className="w-20 h-20 rounded-full bg-[#CC0000]/10 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl text-[#CC0000]">
            image_not_supported
          </span>
        </div>
        <h1 className="text-2xl font-bold font-display text-on-surface mb-2">{title}</h1>
        <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
          這頁的 Stitch 原稿還沒下載下來，或者 Stitch 專案裡這個畫面目前是空的草稿。
        </p>
        <div className="inline-flex items-center gap-4 text-xs text-slate-400 font-mono bg-slate-50 rounded-lg px-4 py-2">
          {sprint && <span>{sprint}</span>}
          {device && <span className="uppercase">{device}</span>}
          {screenId && <span className="truncate max-w-[200px]">{screenId.slice(0, 8)}…</span>}
        </div>
      </div>
    </div>
  );
}
