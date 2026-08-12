import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

/**
 * 經銷商層級隔離的判斷結果（Russell《DealerOS 經銷商層級隔離規則》2026-08-09 第一節）。
 *
 * `dealerOrgId` 只有在使用者的 level=2 祖先 `store_type='dealer'` 時才有值——
 * `store_type='direct'`（碩文 / demo Indian 這種同公司多據點）代表沒有「獨立經銷商」邊界，
 * 維持既有品牌內全域可見（不是本文件要處理的隔離場景），回傳 null。
 */
export type DealerScope = {
  /** 代理商/集團層級：不受經銷商邊界限制，看得到品牌下所有資料 */
  isGroupLevel: boolean;
  /** 使用者所屬的經銷商 org id；null = 非經銷商情境（direct 直營或無 assignment） */
  dealerOrgId: string | null;
};

export async function resolveDealerScope(brandId: string): Promise<DealerScope> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (isAdmin) return { isGroupLevel: true, dealerOrgId: null };
  if (!userId) return { isGroupLevel: false, dealerOrgId: null };

  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("user_assignments")
    .select("scope_type, scope_id, expires_at")
    .eq("user_id", userId);

  const now = Date.now();
  const active = (assignments ?? []).filter(
    (a) => !a.expires_at || new Date(a.expires_at).getTime() > now,
  );

  const isGroupLevel = active.some(
    (a) =>
      a.scope_type === "group" ||
      (a.scope_type === "brand" && a.scope_id === brandId),
  );
  if (isGroupLevel) return { isGroupLevel: true, dealerOrgId: null };

  const { data: dealerOrgId } = await supabase.rpc("get_user_dealer_org_id", {
    p_brand_id: brandId,
  });
  if (!dealerOrgId) return { isGroupLevel: false, dealerOrgId: null };

  const { data: org } = await supabase
    .from("organizations")
    .select("id, store_type")
    .eq("id", dealerOrgId)
    .maybeSingle();

  return {
    isGroupLevel: false,
    dealerOrgId: org?.store_type === "dealer" ? org.id : null,
  };
}
