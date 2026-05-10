import { brands } from "./registry";
import type { BrandConfig, BrandKey } from "./types";

const DEFAULT_BRAND: BrandKey = "ducati";

/**
 * @deprecated server code 改用 `getActiveScope()` from `@/lib/scope/active-scope`，
 * 它會吃 cookie + user_assignments 算當前使用者作用中的 brand；env 只當 fallback。
 *
 * 此 function 仍保留：
 *   - client 端 build-time 取 NEXT_PUBLIC_BRAND_KEY 用
 *   - 沒登入 / 無 cookie 的最後 fallback
 */
export function getBrandKey(): BrandKey {
  const raw =
    process.env.BRAND_KEY ??
    process.env.NEXT_PUBLIC_BRAND_KEY ??
    DEFAULT_BRAND;
  if (raw in brands) return raw as BrandKey;
  return DEFAULT_BRAND;
}

/** @deprecated client component 改用 `useActiveBrand()` from `@/lib/scope/scope-context`。 */
export function getCurrentBrand(): BrandConfig {
  return brands[getBrandKey()];
}
