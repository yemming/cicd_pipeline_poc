"use client";

import { useEffect } from "react";

/**
 * Next.js 16 把 DevTools 浮動按鈕（左下角小白點）藏在 `<nextjs-portal>` 的
 * Shadow DOM 裡，`devIndicators: false` 關不掉、外部 CSS 也穿不進去。
 * 這裡在 dev 模式下用 MutationObserver 監聽 portal 出現，往它的 shadowRoot
 * 注入一行 CSS，只隱藏 `[data-nextjs-dev-tools-button]` 和 `[data-indicator-status]`——
 * 錯誤紅屏（error overlay）還是會正常出現。
 *
 * Production build 不會載入 DevTools，整個元件也會被 tree-shake。
 */
export function HideNextDevTools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const CSS = `
      [data-nextjs-dev-tools-button],
      [data-indicator-status] {
        display: none !important;
      }
    `;

    const inject = (host: Element) => {
      const sr = (host as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (!sr) return;
      if (sr.querySelector("style[data-hide-next-devtools]")) return;
      const style = document.createElement("style");
      style.setAttribute("data-hide-next-devtools", "true");
      style.textContent = CSS;
      sr.appendChild(style);
    };

    const scan = () => {
      document.querySelectorAll("nextjs-portal").forEach(inject);
    };

    scan();

    // Interval fallback: portals may appear after initial scan (async custom element init)
    const interval = setInterval(scan, 300);
    const stopInterval = setTimeout(() => clearInterval(interval), 8000);

    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(stopInterval);
    };
  }, []);

  return null;
}
