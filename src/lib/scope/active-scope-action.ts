"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const SCOPE_COOKIE = "dealeros_scope";
const SCOPE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * 寫入 active scope cookie。
 *
 * B5 起 cookie 結構升級為 `{ brand_id, subsidiary_id?, store_id }`：
 *   - subsidiary_id 可選；省略時 getActiveScope() 會 fallback 到 brands.default_subsidiary_id
 *   - 當前 1:1 brand-subsidiary 對映下 UI 沒切換 dropdown，subsidiary_id 留作未來擴充
 *   - 切 brand 時建議直接傳 null/undefined 讓 server 重新算，避免殘留舊 subsidiary
 */
export async function setActiveScopeAction(
  brand_id: string,
  store_id: string | null,
  subsidiary_id?: string | null,
): Promise<{ ok: true }> {
  const cookieStore = await cookies();
  const payload: {
    brand_id: string;
    store_id: string | null;
    subsidiary_id?: string;
  } = { brand_id, store_id };
  if (subsidiary_id) payload.subsidiary_id = subsidiary_id;
  cookieStore.set(SCOPE_COOKIE, JSON.stringify(payload), {
    maxAge: SCOPE_COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
