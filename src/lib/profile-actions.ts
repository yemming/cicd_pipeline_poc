"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { BRAND_PALETTES, isValidHex } from "@/lib/brands/brand-palettes";
import { SIDEBAR_THEMES } from "@/lib/brands/sidebar-themes";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const AVATAR_BUCKET = "user-avatars";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "尚未登入" };
  return { ok: true, userId };
}

// 整個 layout 都需要 revalidate — 改了顏色 / sidebar 主題會影響 (workspace) layout 的 AppearanceProvider
function refreshLayout() {
  revalidatePath("/", "layout");
}

async function ensureProfileRow(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
}

// ──────────────────────────────────────────────────────────
// 基本資料：姓名 / 地址
// ──────────────────────────────────────────────────────────

export type ProfileBasicInput = {
  name?: string | null;
  address?: string | null;
};

export async function updateProfileBasicAction(
  input: ProfileBasicInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const { userId } = auth;
  await ensureProfileRow(userId);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) {
    const trimmed = (input.name ?? "").trim();
    if (!trimmed) return { ok: false, error: "姓名不可為空" };
    if (trimmed.length > 80) return { ok: false, error: "姓名過長（≤80 字元）" };
    patch.name = trimmed;
  }

  if (input.address !== undefined) {
    const addr = input.address?.trim() ?? "";
    if (addr.length > 240) return { ok: false, error: "地址過長（≤240 字元）" };
    patch.address = addr || null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  refreshLayout();
  return { ok: true, data: { id: userId } };
}

// ──────────────────────────────────────────────────────────
// 外觀：個人 override 品牌主色 / sidebar 主題
// ──────────────────────────────────────────────────────────

export type AppearanceInput = {
  preferred_palette_key?: string | null;
  preferred_custom_palette?: { primary: string; accent: string } | null;
  preferred_sidebar_theme_key?: string | null;
};

export async function updateAppearanceAction(
  input: AppearanceInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const { userId } = auth;
  await ensureProfileRow(userId);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.preferred_palette_key !== undefined) {
    const k = input.preferred_palette_key;
    if (
      k !== null &&
      k !== "custom" &&
      !BRAND_PALETTES.some((p) => p.key === k)
    ) {
      return { ok: false, error: `不認識的主色：${k}` };
    }
    patch.preferred_palette_key = k;
  }

  if (input.preferred_custom_palette !== undefined) {
    if (input.preferred_custom_palette === null) {
      patch.preferred_custom_palette = null;
    } else {
      const { primary, accent } = input.preferred_custom_palette;
      if (!isValidHex(primary) || !isValidHex(accent)) {
        return { ok: false, error: "自訂主色需要兩個合法 #RRGGBB hex" };
      }
      patch.preferred_custom_palette = { primary, accent };
    }
  }

  if (input.preferred_sidebar_theme_key !== undefined) {
    const k = input.preferred_sidebar_theme_key;
    if (k !== null && !SIDEBAR_THEMES.some((t) => t.key === k)) {
      return { ok: false, error: `不認識的 sidebar 主題：${k}` };
    }
    patch.preferred_sidebar_theme_key = k;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  refreshLayout();
  return { ok: true, data: { id: userId } };
}

// ──────────────────────────────────────────────────────────
// 偏好：預設首頁 / 預設品牌
// ──────────────────────────────────────────────────────────

export type PreferencesInput = {
  default_landing_path?: string | null;
  default_brand_id?: string | null;
};

export async function updatePreferencesAction(
  input: PreferencesInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const { userId } = auth;
  await ensureProfileRow(userId);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.default_landing_path !== undefined) {
    const p = input.default_landing_path?.trim() ?? "";
    if (p && !p.startsWith("/")) {
      return { ok: false, error: "預設首頁需以 / 開頭" };
    }
    if (p.length > 200) return { ok: false, error: "路徑過長（≤200 字元）" };
    patch.default_landing_path = p || null;
  }

  if (input.default_brand_id !== undefined) {
    const b = input.default_brand_id?.trim() ?? "";
    if (b.length > 32) return { ok: false, error: "品牌代碼過長" };
    patch.default_brand_id = b || null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  refreshLayout();
  return { ok: true, data: { id: userId } };
}

// ──────────────────────────────────────────────────────────
// 大頭貼：上傳 / 移除
// ──────────────────────────────────────────────────────────

export async function uploadAvatarAction(
  fd: FormData,
): Promise<ActionResult<{ avatar_url: string; avatar_path: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const { userId } = auth;
  await ensureProfileRow(userId);

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "未提供有效的圖檔" };
  }
  if (!AVATAR_MIME.has(file.type)) {
    return {
      ok: false,
      error: `不支援的圖片格式：${file.type || "未知"}（僅接受 JPG/PNG/WebP/GIF）`,
    };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: `圖檔過大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 5MB`,
    };
  }

  const supabase = await createClient();
  const ts = Date.now();
  const ext = mimeToExt(file.type);
  // userId 必須是 path 第一層 — 對應 storage RLS folder check
  const storagePath = `${userId}/avatar-${ts}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (upErr) return { ok: false, error: `上傳失敗：${upErr.message}` };

  const { data: pub } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(storagePath);
  const avatarUrl = pub.publicUrl;

  const { data: oldRow } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();
  const oldPath = oldRow?.avatar_path ?? null;

  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      avatar_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updErr) {
    await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);
    return { ok: false, error: `更新主檔失敗：${updErr.message}` };
  }

  if (oldPath && oldPath !== storagePath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }

  refreshLayout();
  return { ok: true, data: { avatar_url: avatarUrl, avatar_path: storagePath } };
}

export async function removeAvatarAction(): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const { userId } = auth;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (row?.avatar_path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([row.avatar_path]);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: null,
      avatar_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  refreshLayout();
  return { ok: true, data: { id: userId } };
}

// ──────────────────────────────────────────────────────────
// 安全：修改密碼
// ──────────────────────────────────────────────────────────

export async function updatePasswordAction(input: {
  newPassword: string;
  confirm: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  if (!input.newPassword) return { ok: false, error: "密碼不可為空" };
  if (input.newPassword.length < 8) {
    return { ok: false, error: "密碼至少 8 個字元" };
  }
  if (input.newPassword.length > 200) {
    return { ok: false, error: "密碼過長" };
  }
  if (input.newPassword !== input.confirm) {
    return { ok: false, error: "兩次輸入不一致" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (error) return { ok: false, error: `修改失敗：${error.message}` };

  return { ok: true, data: { id: auth.userId } };
}

function mimeToExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}
