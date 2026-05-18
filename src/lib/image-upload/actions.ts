"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  ENTITY_CONFIGS,
  ENTITY_IMAGE_MAX_BYTES,
  ENTITY_IMAGE_MIME,
  type EntityKey,
} from "./config";
import { buildStoragePath, extractStoragePath } from "./helpers";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function bust(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

async function loadCurrent(
  entity: EntityKey,
  entityId: string,
): Promise<
  | { ok: true; brand: string; current: string | string[] | null }
  | { ok: false; error: string }
> {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) return { ok: false, error: `未知的 entity 類型：${entity}` };
  if (!entityId) return { ok: false, error: "缺少資料列 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from(cfg.table)
    .select(`id, ${cfg.column}`)
    .eq("id", entityId)
    .eq("brand_id", brand)
    .single();

  if (error || !data) return { ok: false, error: "找不到該筆資料" };
  const row = data as unknown as Record<string, unknown>;
  const current = (row[cfg.column] ?? null) as string | string[] | null;
  return { ok: true, brand, current };
}

export async function uploadEntityImageAction(
  entity: EntityKey,
  entityId: string,
  fd: FormData,
): Promise<ActionResult<{ url: string; images?: string[] }>> {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) return { ok: false, error: `未知的 entity 類型：${entity}` };
  await requirePermission(cfg.permission);

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "未提供有效的圖檔" };
  }
  if (!ENTITY_IMAGE_MIME.has(file.type)) {
    return {
      ok: false,
      error: `不支援的圖片格式：${file.type || "未知"}（僅接受 JPG / PNG / WebP / GIF）`,
    };
  }
  if (file.size > ENTITY_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: `圖檔過大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 10MB`,
    };
  }

  const loaded = await loadCurrent(entity, entityId);
  if (!loaded.ok) return loaded;
  const { brand, current } = loaded;

  if (cfg.mode === "multi") {
    const arr = Array.isArray(current) ? current : [];
    if (cfg.maxImages && arr.length >= cfg.maxImages) {
      return {
        ok: false,
        error: `最多只能上傳 ${cfg.maxImages} 張圖片`,
      };
    }
  }

  const supabase = await createClient();
  const storagePath = buildStoragePath(entity, brand, entityId, file.type);

  const { error: upErr } = await supabase.storage
    .from(cfg.bucket)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (upErr) return { ok: false, error: `上傳失敗：${upErr.message}` };

  const { data: pub } = supabase.storage
    .from(cfg.bucket)
    .getPublicUrl(storagePath);
  const url = pub.publicUrl;

  let nextValue: string | string[];
  if (cfg.mode === "single") {
    nextValue = url;
  } else {
    const arr = Array.isArray(current) ? current : [];
    nextValue = [...arr, url];
  }

  const { error: updErr } = await supabase
    .from(cfg.table)
    .update({ [cfg.column]: nextValue })
    .eq("id", entityId)
    .eq("brand_id", brand);

  if (updErr) {
    await supabase.storage.from(cfg.bucket).remove([storagePath]);
    return { ok: false, error: `更新主檔失敗：${updErr.message}` };
  }

  if (cfg.mode === "single" && typeof current === "string" && current) {
    const oldPath = extractStoragePath(current, cfg.bucket);
    if (oldPath) {
      await supabase.storage.from(cfg.bucket).remove([oldPath]);
    }
  }

  bust(cfg.revalidate(entityId));

  return {
    ok: true,
    data: {
      url,
      images: cfg.mode === "multi" ? (nextValue as string[]) : undefined,
    },
  };
}

export async function removeEntityImageAction(
  entity: EntityKey,
  entityId: string,
  imageUrl?: string,
): Promise<ActionResult<{ images?: string[] }>> {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) return { ok: false, error: `未知的 entity 類型：${entity}` };
  await requirePermission(cfg.permission);

  const loaded = await loadCurrent(entity, entityId);
  if (!loaded.ok) return loaded;
  const { brand, current } = loaded;

  const supabase = await createClient();
  let nextValue: string | string[] | null = null;
  const toDeletePaths: string[] = [];

  if (cfg.mode === "single") {
    if (typeof current === "string" && current) {
      const p = extractStoragePath(current, cfg.bucket);
      if (p) toDeletePaths.push(p);
    }
    nextValue = null;
  } else {
    const arr = Array.isArray(current) ? current : [];
    if (!imageUrl) return { ok: false, error: "請指定要移除的圖片" };
    const next = arr.filter((u) => u !== imageUrl);
    if (next.length === arr.length) {
      return { ok: false, error: "找不到要移除的圖片" };
    }
    const p = extractStoragePath(imageUrl, cfg.bucket);
    if (p) toDeletePaths.push(p);
    nextValue = next;
  }

  const { error: updErr } = await supabase
    .from(cfg.table)
    .update({ [cfg.column]: nextValue })
    .eq("id", entityId)
    .eq("brand_id", brand);

  if (updErr) return { ok: false, error: `更新失敗：${updErr.message}` };

  if (toDeletePaths.length > 0) {
    await supabase.storage.from(cfg.bucket).remove(toDeletePaths);
  }

  bust(cfg.revalidate(entityId));
  return {
    ok: true,
    data: {
      images:
        cfg.mode === "multi" && Array.isArray(nextValue)
          ? (nextValue as string[])
          : undefined,
    },
  };
}

export async function reorderEntityImagesAction(
  entity: EntityKey,
  entityId: string,
  order: string[],
): Promise<ActionResult<{ images: string[] }>> {
  const cfg = ENTITY_CONFIGS[entity];
  if (!cfg) return { ok: false, error: `未知的 entity 類型：${entity}` };
  if (cfg.mode !== "multi") {
    return { ok: false, error: "此 entity 不支援多張圖片排序" };
  }
  await requirePermission(cfg.permission);

  const loaded = await loadCurrent(entity, entityId);
  if (!loaded.ok) return loaded;
  const { brand, current } = loaded;
  const arr = Array.isArray(current) ? current : [];

  if (order.length !== arr.length || !order.every((u) => arr.includes(u))) {
    return { ok: false, error: "排序資料不一致，請重新整理頁面" };
  }

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from(cfg.table)
    .update({ [cfg.column]: order })
    .eq("id", entityId)
    .eq("brand_id", brand);

  if (updErr) return { ok: false, error: `更新失敗：${updErr.message}` };

  bust(cfg.revalidate(entityId));
  return { ok: true, data: { images: order } };
}
