"use client";

/**
 * Domain helper — RS03B 中古車庫存 Realtime 訂閱（client-side hook）
 *
 * 包裝 Supabase Realtime，讓 RS03B 看板不直接 import @/lib/supabase。
 * 用途：PD 整備工單關單後把 used_car_inventory.status 從 pending_recon
 * 轉成 available，讓已開啟的 RS03B 分頁不必手動整頁刷新就能看到。
 *
 * 依 brand_scoped_select RLS（user_has_brand(brand_id)），不帶 filter 訂閱
 * 也只會收到使用者有權限看的 row，不需要額外傳 brand_id。
 */

import { createClient } from "@/lib/supabase/client";

type CleanupFn = () => void;

/** 訂閱 used_car_inventory 的 UPDATE 事件（狀態變更）。 */
export function subscribeUsedCarInventoryChanges(onChange: () => void): CleanupFn {
  const sb = createClient();

  const channel = sb
    .channel("used_car_inventory:status")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "used_car_inventory",
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
