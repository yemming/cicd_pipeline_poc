import { brands } from "./registry";
import type { BrandConfig, BrandKey } from "./types";

const DEFAULT_BRAND: BrandKey = "ducati";

/**
 * 解析當前部署的品牌 key。
 *
 * 設計：兩份獨立部署（Zeabur service per brand），同 codebase 用 env 切換。
 * 同時支援 server 與 client：
 *   - server: 讀 process.env.BRAND_KEY（優先）
 *   - client: 讀 process.env.NEXT_PUBLIC_BRAND_KEY（build-time inline）
 *
 * 兩個 env 都未設時 fallback 'ducati'，確保現有單品牌 demo 行為不變。
 */
export function getBrandKey(): BrandKey {
  const raw =
    process.env.BRAND_KEY ??
    process.env.NEXT_PUBLIC_BRAND_KEY ??
    DEFAULT_BRAND;
  if (raw in brands) return raw as BrandKey;
  return DEFAULT_BRAND;
}

export function getCurrentBrand(): BrandConfig {
  return brands[getBrandKey()];
}
