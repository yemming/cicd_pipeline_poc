/**
 * 動態目錄節點 catch-all。
 *
 * Phase 3 admin UI 會建這類節點：
 *   - page_kind=static_html → 從 Supabase Storage 抓 HTML，用 <StitchInline> 渲染
 *   - page_kind=iframe      → 直接 iframe 外部 URL
 *   - page_kind=placeholder → 用 <PlaceholderPage> 顯示「Coming Soon」
 *   - page_kind=react_route → 應該被 loader 改寫成原 href，理論上不會走到這裡；
 *                             為了容錯仍處理：直接 redirect。
 */

import { notFound, redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { UserHtmlFrame } from "@/components/user-html-frame";
import { PlaceholderPage } from "@/components/placeholder-page";

import { getActiveScope } from "@/lib/scope/active-scope";
type NavNode = {
  id: string;
  brand_id: string;
  level: number;
  name: string;
  page_kind: "static_html" | "react_route" | "iframe" | "placeholder" | null;
  href: string | null;
  html_storage_path: string | null;
  stitch_screen_id: string | null;
  sprint: string | null;
  is_active: boolean;
};

const HTML_BUCKET = "nav-html";

async function loadHtmlBody(storagePath: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(HTML_BUCKET).download(storagePath);
  if (error || !data) {
    console.warn("[nav/n] storage download 失敗", storagePath, error?.message);
    return null;
  }
  return await data.text();
}

export default async function NavNodePage({
  params,
}: {
  params: Promise<{ nodeId: string }>;
}) {
  const { nodeId } = await params;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .select(
      "id, brand_id, level, name, page_kind, href, html_storage_path, stitch_screen_id, sprint, device, is_active",
    )
    .eq("id", nodeId)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    notFound();
  }

  const node = data as NavNode;
  if (node.level !== 3) {
    notFound();
  }

  switch (node.page_kind) {
    case "react_route":
      // 不應該走到這裡（loader 會直接給原 href）；保險起見導過去
      if (node.href) redirect(node.href);
      return <PlaceholderPage title={node.name} description="此頁尚未指定路由" />;

    case "iframe":
      if (!node.href) {
        return <PlaceholderPage title={node.name} description="iframe 缺少網址" />;
      }
      return (
        <div className="-mx-4 -my-4 md:-m-8 h-[calc(100dvh-4rem)]">
          <iframe src={node.href} className="w-full h-full border-0" title={node.name} />
        </div>
      );

    case "static_html": {
      if (!node.html_storage_path) {
        return <PlaceholderPage title={node.name} description="尚未上傳 HTML" />;
      }
      const html = await loadHtmlBody(node.html_storage_path);
      if (html === null) {
        return <PlaceholderPage title={node.name} description="HTML 載入失敗" />;
      }
      // 兼容兩種儲存格式：
      //   舊版（已被 strip 過）：<style>...</style>\n<body innerHTML 片段>
      //   新版（保留完整 HTML）：完整 <!DOCTYPE html>...</html>
      // 沒有 <html> 開頭就幫它包一份完整 doc
      const doc = /<html[\s>]/i.test(html)
        ? html
        : `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"></head><body>${html}</body></html>`;
      return (
        <UserHtmlFrame
          html={doc}
          title={node.name}
          breadcrumb={[{ label: node.name }]}
        />
      );
    }

    case "placeholder":
    default:
      return <PlaceholderPage title={node.name} description="此頁尚在規劃中" />;
  }
}
