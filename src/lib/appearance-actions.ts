/**
 * Server actions for /admin/navigation appearance editor。
 *
 * 三個動作：
 *   - updateBrandAppearance：tagline + sidebar_theme
 *   - uploadBrandBadge：上傳 footer badge 圖檔到 brand-assets bucket
 *   - removeBrandBadge：清掉 badge（顯示 blank）
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getBrandKey } from "@/lib/brands/current";
import { SIDEBAR_THEMES } from "@/lib/brands/sidebar-themes";
import { BRAND_PALETTES, isValidHex } from "@/lib/brands/brand-palettes";

const BRAND_ASSETS_BUCKET = "brand-assets";

async function requireAdmin() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理者可以調整品牌外觀");
  return userId;
}

function refreshAll() {
  revalidatePath("/", "layout");
}

async function ensureRow(brandId: string) {
  const supabase = createServiceClient();
  await supabase.from("brand_appearance").upsert(
    { brand_id: brandId },
    { onConflict: "brand_id", ignoreDuplicates: true },
  );
}

export async function updateBrandAppearance(fd: FormData): Promise<void> {
  const userId = await requireAdmin();
  const brandId = getBrandKey();
  await ensureRow(brandId);

  const tagline = (fd.get("dashboard_tagline") ?? "").toString().trim();
  const themeKey = (fd.get("sidebar_theme") ?? "").toString().trim();
  const paletteKey = (fd.get("brand_palette") ?? "").toString().trim();
  const customPrimary = (fd.get("custom_primary") ?? "").toString().trim();
  const customAccent = (fd.get("custom_accent") ?? "").toString().trim();

  if (themeKey && !SIDEBAR_THEMES.some((t) => t.key === themeKey)) {
    throw new Error(`不認識的 sidebar 主題：${themeKey}`);
  }
  if (
    paletteKey &&
    paletteKey !== "custom" &&
    !BRAND_PALETTES.some((p) => p.key === paletteKey)
  ) {
    throw new Error(`不認識的主顏色：${paletteKey}`);
  }
  if (paletteKey === "custom") {
    if (!isValidHex(customPrimary) || !isValidHex(customAccent)) {
      throw new Error("自訂主顏色需要兩個合法 #RRGGBB hex 值");
    }
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  // 空字串 → null（表示 fallback 到預設）
  patch.dashboard_tagline = tagline === "" ? null : tagline;
  if (themeKey) patch.sidebar_theme = themeKey;
  if (paletteKey) patch.brand_palette = paletteKey;
  if (paletteKey === "custom") {
    patch.custom_palette = { primary: customPrimary, accent: customAccent };
  } else if (paletteKey) {
    // 切換回 preset 時清掉 custom，避免下次切回 custom 看到舊值困惑
    patch.custom_palette = null;
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("brand_appearance")
    .update(patch)
    .eq("brand_id", brandId);
  if (error) throw new Error(`儲存失敗：${error.message}`);

  refreshAll();
}

const ALLOWED_BADGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

export async function uploadBrandBadge(fd: FormData): Promise<{ url: string }> {
  const userId = await requireAdmin();
  const brandId = getBrandKey();
  await ensureRow(brandId);

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("沒有選到檔案");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("圖檔超過 5 MB");
  }
  if (!ALLOWED_BADGE_MIME.has(file.type)) {
    throw new Error(`不支援的圖檔格式：${file.type || "未知"}`);
  }

  const supabase = createServiceClient();

  // 檔名固定：{brand}/footer-badge-{ts}.{ext}（ts 避開 CDN cache）
  const ext = mimeToExt(file.type);
  const ts = Date.now();
  const path = `${brandId}/footer-badge-${ts}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BRAND_ASSETS_BUCKET)
    .upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadErr) throw new Error(`上傳失敗：${uploadErr.message}`);

  // 取舊路徑準備刪除（避免累積垃圾檔）
  const { data: oldRow } = await supabase
    .from("brand_appearance")
    .select("footer_badge_path")
    .eq("brand_id", brandId)
    .maybeSingle();
  const oldPath = oldRow?.footer_badge_path ?? null;

  const { data: pub } = supabase.storage.from(BRAND_ASSETS_BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updateErr } = await supabase
    .from("brand_appearance")
    .update({
      footer_badge_url: publicUrl,
      footer_badge_path: path,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("brand_id", brandId);
  if (updateErr) throw new Error(`更新失敗：${updateErr.message}`);

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([oldPath]);
  }

  refreshAll();
  return { url: publicUrl };
}

export async function removeBrandBadge(): Promise<void> {
  const userId = await requireAdmin();
  const brandId = getBrandKey();

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("brand_appearance")
    .select("footer_badge_path")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (row?.footer_badge_path) {
    await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([row.footer_badge_path]);
  }

  await supabase
    .from("brand_appearance")
    .update({
      footer_badge_url: null,
      footer_badge_path: null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("brand_id", brandId);

  refreshAll();
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}
