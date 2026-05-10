/**
 * Server actions for /admin/navigation — admin 編輯目錄樹 + 上傳 HTML。
 *
 * 所有 mutation：
 *   1. 以 requireFeedbackAdmin 守門
 *   2. 用 service role client 寫 DB（明確帶 brand_id 而非靠 RLS）
 *   3. revalidatePath('/', 'layout') — 讓所有 workspace 路由重新讀 nav tree
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
const NAV_HTML_BUCKET = "nav-html";

function normalizeHref(raw: string | null): string | null {
  if (!raw) return raw;
  if (raw.length > 1 && raw.endsWith("/")) return raw.replace(/\/+$/, "");
  return raw;
}

async function requireAdmin() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理者可以操作目錄");
  return userId;
}

function fields(fd: FormData) {
  function s(key: string): string | null {
    const v = fd.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }
  function n(key: string): number | null {
    const v = fd.get(key);
    if (typeof v !== "string" || v.trim() === "") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  }
  function b(key: string): boolean {
    const v = fd.get(key);
    return v === "true" || v === "on" || v === "1";
  }
  return { s, n, b };
}

function refreshAll() {
  // nav 樹由 (workspace)/layout 載入；改了之後整個 layout subtree 都要重 render
  revalidatePath("/", "layout");
}

/** HTML 上傳專用 — 只 bust 該 nav 動態路徑，不 revalidate 整個 layout（avoid 把 nav tree + appearance 整套重撈）。 */
function refreshUploadedHtml(nodeId: string) {
  // /n/[id] 是放 static HTML 的 catch-all 路由，重新驗證確保訪客拿到新檔
  revalidatePath(`/n/${nodeId}`);
}

// ──────────────────────────────────────────────────────────
// CRUD：node
// ──────────────────────────────────────────────────────────

export async function createNavNode(fd: FormData): Promise<{ id: string }> {
  const userId = await requireAdmin();
  const { s, n, b } = fields(fd);

  const level = n("level");
  if (level !== 1 && level !== 2 && level !== 3) {
    throw new Error("level 必須是 1 / 2 / 3");
  }
  const parentId = s("parent_id"); // null 表示 root（level=1）
  const name = s("name");
  if (!name) throw new Error("名稱必填");

  const supabase = createServiceClient();

  // 自動算 sort_order：取同 parent 同層既有的 max + 1，避免新節點全擠在 0 撞號
  let nextSort = n("sort_order");
  if (nextSort == null) {
    const siblingsQuery = supabase
      .from("nav_nodes")
      .select("sort_order")
      .eq("brand_id", (await getActiveScope()).brand_id)
      .eq("level", level)
      .order("sort_order", { ascending: false })
      .limit(1);
    const finalQuery = parentId
      ? siblingsQuery.eq("parent_id", parentId)
      : siblingsQuery.is("parent_id", null);
    const { data: top } = await finalQuery.maybeSingle();
    nextSort = top ? (top.sort_order as number) + 1 : 0;
  }

  const insert: Record<string, unknown> = {
    brand_id: (await getActiveScope()).brand_id,
    parent_id: parentId,
    level,
    sort_order: nextSort,
    name,
    icon: s("icon"),
    emoji: s("emoji"),
    accent: s("accent"),
    description: s("description"),
    created_by: userId,
  };

  if (level === 1) {
    insert.module_key = s("module_key");
    insert.permission = s("permission");
    insert.home = s("home");
  }

  if (level === 3) {
    const pageKind = s("page_kind") ?? "placeholder";
    if (!["static_html", "react_route", "iframe", "placeholder"].includes(pageKind)) {
      throw new Error("page_kind 不合法");
    }
    insert.page_kind = pageKind;
    insert.href = normalizeHref(s("href"));
    insert.stitch_screen_id = s("stitch_screen_id");
    insert.sprint = s("sprint");
    insert.is_admin_only = b("is_admin_only");
    insert.coming_soon = b("coming_soon");
  }

  const { data, error } = await supabase
    .from("nav_nodes")
    .insert(insert)
    .select("id")
    .single();
  if (error || !data) throw new Error(`新增失敗：${error?.message ?? "unknown"}`);

  refreshAll();
  return { id: data.id };
}

export async function updateNavNode(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const { s, n, b } = fields(fd);

  // level 由 client 帶上來，避免多打一次 DB 拿同一筆 row。安全性靠 UPDATE 的 WHERE：
  // .eq("brand_id", brand).eq("level", level) — client 亂改 level 會讓 0 row affected 進而 throw。
  const levelRaw = fd.get("level");
  const level = typeof levelRaw === "string" ? Number(levelRaw) : NaN;
  if (level !== 1 && level !== 2 && level !== 3) {
    throw new Error("level 不合法");
  }

  // is_active 一定讀得到（CheckBox 元件會額外送 hidden=false 當 fallback，所以
  // 不管勾或不勾 fd 都會有這個 key）。早期版本用 fd.has() 守衛，但因為標準
  // checkbox 不勾就不送，等於只能開不能關 — 這就是「儲存沒反應」的元凶。
  const patch: Record<string, unknown> = {
    name: s("name"),
    icon: s("icon"),
    emoji: s("emoji"),
    accent: s("accent"),
    description: s("description"),
    is_active: b("is_active"),
    sort_order: n("sort_order") ?? undefined,
  };

  if (level === 1) {
    patch.module_key = s("module_key");
    patch.permission = s("permission");
    patch.home = s("home");
  }

  if (level === 3) {
    const pageKind = s("page_kind");
    if (pageKind) {
      if (!["static_html", "react_route", "iframe", "placeholder"].includes(pageKind)) {
        throw new Error("page_kind 不合法");
      }
      patch.page_kind = pageKind;
    }
    if (fd.has("href")) patch.href = normalizeHref(s("href"));
    if (fd.has("stitch_screen_id")) patch.stitch_screen_id = s("stitch_screen_id");
    if (fd.has("sprint")) patch.sprint = s("sprint");
    patch.is_admin_only = b("is_admin_only");
    patch.coming_soon = b("coming_soon");
  }

  // 過濾 undefined（避免不小心把欄位清掉）
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  );

  const supabase = createServiceClient();
  const { data: updated, error } = await supabase
    .from("nav_nodes")
    .update(cleaned)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("level", level)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`更新失敗：${error.message}`);
  if (!updated) throw new Error("節點不存在或不能跨品牌操作");

  refreshAll();
}

export async function deleteNavNode(id: string): Promise<void> {
  await requireAdmin();

  const supabase = createServiceClient();

  // 先把該節點 + 所有子孫節點的 html_storage_path 撈出來，刪 storage
  const { data: subtree } = await supabase
    .from("nav_nodes")
    .select("id, html_storage_path, brand_id")
    .or(`id.eq.${id},parent_id.eq.${id}`); // 一階子節點；DB cascade 會處理更深的

  if (subtree && subtree.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const wrongBrand = subtree.find((r) => r.brand_id !== _brandId);
    if (wrongBrand) throw new Error("不能跨品牌操作");
    const paths = subtree
      .map((r) => r.html_storage_path)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await supabase.storage.from(NAV_HTML_BUCKET).remove(paths);
    }
  }

  // CASCADE 會把整個子樹帶走
  const { error } = await supabase.from("nav_nodes").delete().eq("id", id);
  if (error) throw new Error(`刪除失敗：${error.message}`);

  refreshAll();
}

// ──────────────────────────────────────────────────────────
// 排序
// ──────────────────────────────────────────────────────────

export async function moveNavNode(id: string, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data: me, error } = await supabase
    .from("nav_nodes")
    .select("id, parent_id, level, brand_id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error || !me) throw new Error("節點不存在");
  if (me.brand_id !== (await getActiveScope()).brand_id) throw new Error("不能跨品牌操作");

  // 載入完整同層 sibling 清單（同 brand / 同 level / 同 parent）
  let siblingsQ = supabase
    .from("nav_nodes")
    .select("id, sort_order")
    .eq("brand_id", me.brand_id)
    .eq("level", me.level);
  siblingsQ = me.parent_id
    ? siblingsQ.eq("parent_id", me.parent_id)
    : siblingsQ.is("parent_id", null);
  const { data: siblings, error: sibErr } = await siblingsQ;
  if (sibErr || !siblings) throw new Error("載入兄弟節點失敗");

  // 穩定排序：sort_order 主鍵、id 次鍵（避免 tie 時隨機）
  const ordered = [...siblings].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const idx = ordered.findIndex((n) => n.id === me.id);
  if (idx < 0) return;
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= ordered.length) return; // 邊界

  // in-array swap
  [ordered[idx], ordered[targetIdx]] = [ordered[targetIdx], ordered[idx]];

  // 整批重新編號 0..N-1（同時消滅 tie，未來不會再出狀況）
  // 只 update 真的有改的 row 以節省 round-trip
  await Promise.all(
    ordered.map((n, i) =>
      n.sort_order === i
        ? Promise.resolve()
        : supabase.from("nav_nodes").update({ sort_order: i }).eq("id", n.id),
    ),
  );

  refreshAll();
}

// ──────────────────────────────────────────────────────────
// HTML upload (level=3, page_kind=static_html)
// ──────────────────────────────────────────────────────────

/**
 * 使用者的 HTML 會被丟進 iframe srcdoc 渲染（CSS 與外殼完全隔離），
 * 所以這裡只需做「資安最小清理」：
 *   - 拿掉外連 <link>（避免拉外站 CSS）
 *   - 拿掉 <meta http-equiv="refresh">（避免被劫持轉址）
 *   - 拿掉 <iframe> 內嵌（避免 nested iframe 載入外站）
 * 保留：<style> + 全部 inline <script>（iframe sandbox 會關掉 same-origin，
 * 攔住 JS 對外打 API；互動性如 tab 切換、計算機都能用）。
 */
function processUploadedHtml(html: string): string {
  return html
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\s+http-equiv=["']?refresh["']?[^>]*>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
}

export async function uploadHtmlForNode(nodeId: string, fd: FormData): Promise<void> {
  await requireAdmin();

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("沒有選到檔案");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("檔案超過 5 MB");
  }

  const raw = await file.text();
  const processed = processUploadedHtml(raw);

  const supabase = createServiceClient();

  const { data: node, error: readErr } = await supabase
    .from("nav_nodes")
    .select("id, brand_id, html_storage_path")
    .eq("id", nodeId)
    .maybeSingle();
  if (readErr || !node) throw new Error("節點不存在");
  if (node.brand_id !== (await getActiveScope()).brand_id) throw new Error("不能跨品牌操作");

  // 檔名：{brand}/{nodeId}.body.html — 同節點 re-upload 會覆蓋舊檔
  const storagePath = `${node.brand_id}/${nodeId}.body.html`;

  const { error: uploadErr } = await supabase.storage
    .from(NAV_HTML_BUCKET)
    .upload(storagePath, processed, {
      contentType: "text/html",
      upsert: true,
    });
  if (uploadErr) throw new Error(`上傳失敗：${uploadErr.message}`);

  // 更新 node：page_kind=static_html + html_storage_path
  const { error: updateErr } = await supabase
    .from("nav_nodes")
    .update({
      page_kind: "static_html",
      html_storage_path: storagePath,
      // href 在 static_html 模式下沒意義；清掉避免混淆
      href: null,
    })
    .eq("id", nodeId);
  if (updateErr) throw new Error(`更新節點失敗：${updateErr.message}`);

  // 不再 revalidate 整個 layout — 只 bust /n/[id] 那條動態路由的 cache。
  // layout 全 bust 會把 nav tree + appearance 整套重撈，dev mode 加上 force-dynamic
  // 會卡好幾秒 spinner；HTML 上傳只動到該頁的內容，不需要全 layout 重渲。
  refreshUploadedHtml(nodeId);
}
