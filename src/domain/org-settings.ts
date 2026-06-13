import "server-only";

/**
 * Domain Helper — Org Settings（per-brand 組織模式 · org_mode）
 *
 * G3-A（集團 Phase 2，2026-06-01）新增；2026-06-13 改為 per-brand（海德生回覆問題二）。
 *   org_mode=3 → 三層（集團→法人→門店，海德生 Indian）
 *   org_mode=4 → 四層（集團→法人→區域→門店，碩文 DUCATI）
 *
 * 為什麼 per-brand：DealerOS 是多品牌通用平台，三層的海德生與四層的碩文必須並存。
 * 全域單一 org_mode 會讓系統只能服務其中一種層級。改存 brand_config.metadata.org_mode，
 * 每個品牌各自宣告層級；org tree 依此 collapse/展開「區域」層（改 config 不改 code）。
 *
 * 資料落點：brand_config.metadata.org_mode（每 brand 一筆）。讀走 anon client，
 * 寫走 server action（is_app_admin gate）。天條：UI 不直連 supabase。
 */

import { createClient } from "@/lib/supabase/server";
import { resolveOrgMode } from "@/domain/brand-config";

export type OrgSettings = {
  brandId: string;
  brandName: string;
  orgMode: 3 | 4;
};

/** 撈某品牌的 org_mode 設定。查無 brand_config → 預設四層（最大層級）。 */
export async function getOrgSettings(brandId: string): Promise<OrgSettings | null> {
  if (!brandId) return null;
  const client = await createClient();
  const { data } = await client
    .from("brand_config")
    .select("brand_id, brand_name, metadata")
    .eq("brand_id", brandId)
    .maybeSingle();
  const row = data as
    | { brand_id: string; brand_name: string | null; metadata: Record<string, unknown> | null }
    | null;
  return {
    brandId,
    brandName: row?.brand_name ?? brandId,
    orgMode: resolveOrgMode(row?.metadata),
  };
}

/** 撈所有品牌的 org_mode（給 getOrgStructure 做 region collapse 用）。回 Map<brandId, 3|4>。 */
export async function getOrgModeByBrand(): Promise<Map<string, 3 | 4>> {
  const client = await createClient();
  const { data } = await client.from("brand_config").select("brand_id, metadata");
  const m = new Map<string, 3 | 4>();
  for (const r of (data ?? []) as Array<{ brand_id: string; metadata: Record<string, unknown> | null }>) {
    m.set(r.brand_id, resolveOrgMode(r.metadata));
  }
  return m;
}
