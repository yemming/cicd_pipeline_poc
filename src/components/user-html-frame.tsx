"use client";

import { useSetPageHeader } from "./page-header-context";
import type { TopbarBreadcrumb } from "./page-header-context";

interface UserHtmlFrameProps {
  /** 完整可獨立渲染的 HTML 字串（含 <html>/<head>/<body>），會塞進 iframe srcdoc */
  html: string;
  title: string;
  breadcrumb?: TopbarBreadcrumb[];
}

/**
 * 使用者上傳的 HTML 用 iframe 渲染（srcdoc）— 與外殼 CSS 完全隔離。
 *
 * 為什麼不用 <StitchInline> 的 dangerouslySetInnerHTML：
 *   - 使用者 HTML 通常是自帶 shell 的完整單頁 app（自己的 header / 100vh / position:fixed）
 *   - 注入到 React DOM 會污染外殼：reset 全域 body 樣式、fixed 元素蓋過 topbar、
 *     100vh 不跟 sidebar 寬度連動
 *   - iframe 給它一個獨立 viewport，自然解決
 *
 * sandbox 策略：
 *   - allow-scripts：允許 inline JS（互動式表單需要）
 *   - allow-forms：允許表單送出
 *   - allow-modals：允許 alert/confirm
 *   - **不開 allow-same-origin**：iframe 變 null origin，禁止 JS 對父站打 API/讀 cookie
 *   - **不開 allow-top-navigation**：禁止跳走父視窗
 */
export function UserHtmlFrame({ html, title, breadcrumb }: UserHtmlFrameProps) {
  useSetPageHeader({
    breadcrumb: breadcrumb ?? [{ label: title }],
  });

  return (
    <div className="-mx-4 -my-4 md:-m-8 h-[calc(100dvh-4rem)]">
      <iframe
        srcDoc={html}
        title={title}
        sandbox="allow-scripts allow-forms allow-modals"
        className="w-full h-full border-0 bg-white"
      />
    </div>
  );
}
