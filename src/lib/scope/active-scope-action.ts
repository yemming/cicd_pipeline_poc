"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const SCOPE_COOKIE = "dealeros_scope";
const SCOPE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function setActiveScopeAction(
  brand_id: string,
  store_id: string | null,
): Promise<{ ok: true }> {
  const cookieStore = await cookies();
  cookieStore.set(SCOPE_COOKIE, JSON.stringify({ brand_id, store_id }), {
    maxAge: SCOPE_COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
