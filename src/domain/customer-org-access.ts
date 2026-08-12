/**
 * customer_org_access — 客戶跨經銷商共享主檔的存取記錄
 * （Russell《DealerOS 經銷商層級隔離規則》2026-08-09 §3.3）
 *
 * 「查詢權接觸即取得、取得後永久保留」：RO / 銷售單 / 試乘 建立時呼叫 recordCustomerOrgContact()，
 * 若該經銷商對此客戶尚無記錄則自動建立一筆；已有記錄則不動（保留最早的 first_contact_at）。
 */

import { createClient } from "@/lib/supabase/server";

export type ContactSource = "repair_order" | "sales_order" | "test_drive" | "appointment";

/**
 * 記錄「經銷商 org 與客戶的接觸」。store_id 是實際服務門店（level=3 或更淺），
 * 內部會往上追溯到 level=2 經銷商節點——查詢權歸屬經銷商整體，不是單一門店。
 */
export async function recordCustomerOrgContact(params: {
  customerId: string;
  storeOrgId: string;
  source: ContactSource;
  refId: string;
}): Promise<void> {
  const supabase = await createClient();

  const { data: store } = await supabase
    .from("organizations")
    .select("id, parent_id, level, store_type")
    .eq("id", params.storeOrgId)
    .maybeSingle();
  if (!store) return;

  // 往上走到 level=2（經銷商/直營節點）——warehouses/RO 的 store_id 可能指到 level=3 實際門店
  let dealerOrgId = store.id;
  let cursor = store;
  while (cursor.level > 2 && cursor.parent_id) {
    const { data: parent } = await supabase
      .from("organizations")
      .select("id, parent_id, level, store_type")
      .eq("id", cursor.parent_id)
      .maybeSingle();
    if (!parent) break;
    cursor = parent;
    dealerOrgId = parent.id;
  }

  await supabase
    .from("customer_org_access")
    .upsert(
      {
        customer_id: params.customerId,
        org_id: dealerOrgId,
        first_contact_source: params.source,
        first_contact_ref_id: params.refId,
      } as never,
      { onConflict: "customer_id,org_id", ignoreDuplicates: true },
    );
}
