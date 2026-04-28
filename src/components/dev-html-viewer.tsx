"use client";

import { useEffect, useRef, useState } from "react";
import { useSetPageHeader } from "./page-header-context";
import type { TopbarBreadcrumb } from "./page-header-context";

interface DevHtmlViewerProps {
  /** Filename under /public/dev-html/, without leading slash (e.g. "preflight-ro-v1.html") */
  file: string;
  title: string;
  breadcrumb?: TopbarBreadcrumb[];
  /** 1024px iPad / 820px tablet / 390px mobile / undefined = stretch */
  device?: "desktop" | "tablet" | "ipad" | "mobile";
  /** Source path on disk for "在編輯器開啟" link */
  sourcePath?: string;
}

/**
 * Embeds a self-contained design HTML (under /public/dev-html/) as a live iframe.
 * 用於「新功能開發區」展示尚未轉譯成 React 的 docs/*.html 設計稿。
 */
export function DevHtmlViewer({
  file,
  title,
  breadcrumb,
  device = "ipad",
  sourcePath,
}: DevHtmlViewerProps) {
  useSetPageHeader({
    breadcrumb: breadcrumb ?? [{ label: "新功能開發區" }, { label: title }],
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    const t = setTimeout(() => {
      if (loading) setFailed(true);
    }, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const src = `/dev-html/${file}`;

  const frameWidth =
    device === "mobile" ? 390 :
    device === "ipad" ? 1024 :
    device === "tablet" ? 820 :
    undefined;

  return (
    <div className="w-full -m-8 min-h-[calc(100dvh-4rem)] bg-[#F5F5F5] flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-8 py-3 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
            <span className="material-symbols-outlined text-xs" style={{ fontSize: 12 }}>
              science
            </span>
            開發中
          </span>
          <span className="text-sm font-display font-bold text-on-surface truncate">
            {title}
          </span>
          {device !== "desktop" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
              {device}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {sourcePath && (
            <span className="hidden sm:inline text-[11px] font-mono text-slate-400 truncate max-w-[280px]">
              {sourcePath}
            </span>
          )}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontSize: 14 }}>
              open_in_new
            </span>
            新分頁開啟
          </a>
        </div>
      </div>

      <div className="flex-1 relative flex items-stretch justify-center p-6 overflow-auto">
        {loading && !failed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-amber-500 animate-spin" />
              <span className="text-xs font-medium font-display">載入設計稿中…</span>
            </div>
          </div>
        )}

        {failed && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
            <span className="material-symbols-outlined text-4xl text-slate-300">
              broken_image
            </span>
            <span className="text-sm">HTML 載入失敗</span>
            <button
              onClick={() => {
                setFailed(false);
                setLoading(true);
                if (iframeRef.current) iframeRef.current.src = src;
              }}
              className="text-xs text-amber-700 underline"
            >
              重試
            </button>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="bg-white rounded-2xl shadow-lg border border-slate-200"
          style={{
            width: frameWidth ? `${frameWidth}px` : "100%",
            maxWidth: "100%",
            minHeight: "calc(100dvh - 8rem)",
            opacity: loading ? 0 : 1,
            transition: "opacity 200ms",
          }}
          onLoad={() => setLoading(false)}
          onError={() => setFailed(true)}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
