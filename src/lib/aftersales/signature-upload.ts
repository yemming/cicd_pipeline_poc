/**
 * signature-upload.ts — RP2 簽名 Storage 上傳輔助。
 *
 * 規格（02_重大修改方案 RP2）：
 *   - 前端已壓縮：canvas → JPEG 70% / 最長邊 ≤ 1200px（在 signature-canvas.tsx 做）
 *   - 後端這裡：把 base64 dataURL 轉 Buffer → 上傳到 `ro-signatures` bucket
 *   - 路徑：{brand_id}/ro-signatures/{entity}/{entity_id}/{uuid}.jpg
 *   - 回傳公開 URL（bucket 是 public，直接 getPublicUrl）
 *   - 資料庫只存 URL，不存 base64
 *
 * TODO promote to typed column/table (needs DDL) — 目前 screenshot_url 存在 metadata jsonb。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";

export const SIGNATURE_BUCKET = "ro-signatures";

/**
 * 上傳一張 base64 JPEG dataURL 簽名圖到 Storage，回傳公開 URL。
 *
 * @param dataUrl      - `data:image/jpeg;base64,....` 格式（前端 canvas 已壓縮）
 * @param brand        - brand_id，用於路徑前綴（brand 隔離）
 * @param entity       - 實體種類，例如 "pre-inspection" / "ro-checkout" / "final-inspection"
 * @param entityId     - 實體 UUID，用於路徑
 * @param sigRole      - 簽名人角色標識，例如 "sa" / "customer" / "inspector"（影響檔名）
 * @returns            - 公開 URL 或 null（若上傳失敗；吞錯，不卡主流程）
 */
export async function uploadSignatureDataUrl(
  dataUrl: string,
  brand: string,
  entity: string,
  entityId: string,
  sigRole: string,
): Promise<string | null> {
  try {
    // 支援 png（舊資料）與 jpeg（新規格）
    const isJpeg = dataUrl.startsWith("data:image/jpeg");
    const isPng = dataUrl.startsWith("data:image/png");
    if (!isJpeg && !isPng) {
      // 不是已知圖片格式，可能是舊的 URL（已上傳），直接回傳
      if (dataUrl.startsWith("http")) return dataUrl;
      console.warn("[signature-upload] 非 dataURL 格式，略過上傳");
      return null;
    }

    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    const buffer = Buffer.from(base64, "base64");
    const mime = isJpeg ? "image/jpeg" : "image/png";
    const ext = isJpeg ? "jpg" : "png";

    const now = Date.now();
    const path = `${brand}/${entity}/${entityId}/${sigRole}-${now}.${ext}`;

    const supabase = await createClient();
    const { error: upErr } = await supabase.storage
      .from(SIGNATURE_BUCKET)
      .upload(path, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (upErr) {
      console.error("[signature-upload] 上傳失敗", upErr.message);
      return null;
    }

    const { data: pub } = supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (e) {
    console.error("[signature-upload] 例外", e);
    return null;
  }
}

/**
 * 判斷字串是否已是 Storage URL（避免重複上傳）。
 * 已上傳過的值（https://...supabase.co/storage/v1/...）直接 pass through。
 */
export function isStorageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("https://") || value.startsWith("http://");
}
