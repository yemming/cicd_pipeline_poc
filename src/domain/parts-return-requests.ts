/**
 * Domain helper — 退料閉環（parts_return_requests）
 *
 * 售後修護「取消追加 / 取消工單 / 技師退料 / TL 歸還」會建立「退料待確認記錄」，
 * 庫存不立即回補；倉管在 /parts/receipt/return-in 的 Tab B 實物核對後確認，
 * 庫存才真正回補（full_return）或走損耗核銷（damage_writeoff）。
 *
 * 架構決策（與 Russell 規格的 delta，記於完成報告）：
 *  - 出庫流程（persistPick）未寫 stock_items.metadata.source_addon_id/source_ro_id，
 *    無法可靠回溯具體 lot；故「庫存回補」不採「翻舊 issued 改 return_pending」，
 *    改採與現有 parts-return-in 一致的做法：確認收到時 insert 一筆 available stock_item。
 *  - 退料明細來源改從 repair_order_lines(kind='part') 推導，不依賴出庫 metadata。
 *
 * 天條：UI 禁止直連 supabase；此 domain 內部直連、對外只給 helper。
 */

import { createClient } from "@/lib/supabase/server";

export type ReturnSourceType =
  | "addon_cancel"
  | "addon_partial"
  | "ro_cancel"
  | "tech_unused"
  | "tl_return";

export type ReturnRequestStatus = "pending" | "confirmed" | "overdue";
export type ReturnConfirmType = "full_return" | "damage_writeoff";

export type ReturnRequestRow = {
  id: string;
  source_type: ReturnSourceType;
  source_ro_id: string | null;
  source_addon_id: string | null;
  source_line_id: string | null;
  item_id: string | null;
  part_name: string;
  part_code: string | null;
  qty_requested: number;
  qty_confirmed: number | null;
  return_type: ReturnConfirmType;
  status: ReturnRequestStatus;
  requested_by: string | null;
  requested_at: string;
  return_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  warehouse_note: string | null;
  due_by: string;
  overdue_notified_at: string | null;
  shortfall_writeoff_id: string | null;
  metadata: Record<string, unknown> | null;
  brand_id: string;
  store_id: string | null;
  created_at: string;
  /** join 用：申請人姓名 / 工單號（list 時補） */
  source_ro_code?: string | null;
  requested_by_name?: string | null;
};

export type NewReturnRequest = {
  source_type: ReturnSourceType;
  source_ro_id?: string | null;
  source_addon_id?: string | null;
  source_line_id?: string | null;
  item_id?: string | null;
  part_name: string;
  part_code?: string | null;
  qty_requested: number;
  return_reason?: string | null;
  requested_by?: string | null;
  store_id?: string | null;
  /** 回補時要 insert 回的倉庫；不給則確認時取品牌預設備件倉 */
  warehouse_id?: string | null;
  unit_cost?: number | null;
};

export type ReturnRequestFilter = {
  source_ro_id?: string;
  status?: ReturnRequestStatus;
  source_type?: ReturnSourceType;
};

/**
 * 挑品牌的預設「備件倉」用於庫存回補（避開保固暫存倉 / 寄存倉）。
 */
export async function getDefaultPartsWarehouseId(
  brand: string,
  storeId?: string | null,
): Promise<string | null> {
  const sb = await createClient();
  const q = sb
    .from("warehouses")
    .select("id, code, store_id")
    .eq("brand_id", brand)
    .not("code", "ilike", "%WTY%")
    .not("code", "ilike", "%CONS%")
    .not("code", "ilike", "%WARRANTY%")
    .order("code", { ascending: true });
  const { data } = await q;
  const rows = (data ?? []) as Array<{ id: string; store_id: string | null }>;
  if (rows.length === 0) {
    // 退一步：任何該品牌倉庫
    const { data: any } = await sb
      .from("warehouses")
      .select("id")
      .eq("brand_id", brand)
      .limit(1);
    return ((any ?? [])[0] as { id: string } | undefined)?.id ?? null;
  }
  if (storeId) {
    const matched = rows.find((r) => r.store_id === storeId);
    if (matched) return matched.id;
  }
  return rows[0].id;
}

/**
 * 批次建立退料待確認記錄（pending）。各取消流程共用入口。
 * 由 server action 內呼叫；自帶 brand / due_by。
 */
export async function createReturnRequestsBatch(
  rows: NewReturnRequest[],
  ctx: { brand: string; due_by: string },
): Promise<{ ids: string[] }> {
  if (rows.length === 0) return { ids: [] };
  const sb = await createClient();
  const payload = rows.map((r) => ({
    source_type: r.source_type,
    source_ro_id: r.source_ro_id ?? null,
    source_addon_id: r.source_addon_id ?? null,
    source_line_id: r.source_line_id ?? null,
    item_id: r.item_id ?? null,
    part_name: r.part_name,
    part_code: r.part_code ?? null,
    qty_requested: r.qty_requested,
    status: "pending" as const,
    return_type: "full_return" as const,
    requested_by: r.requested_by ?? null,
    return_reason: r.return_reason ?? null,
    due_by: ctx.due_by,
    brand_id: ctx.brand,
    store_id: r.store_id ?? null,
    metadata: {
      warehouse_id: r.warehouse_id ?? null,
      unit_cost: r.unit_cost ?? 0,
    },
  }));
  const { data, error } = await sb
    .from("parts_return_requests")
    .insert(payload)
    .select("id");
  if (error) {
    console.error("[parts-return-requests] createBatch error", error);
    return { ids: [] };
  }
  return { ids: ((data ?? []) as Array<{ id: string }>).map((d) => d.id) };
}

/** 列表（給 Tab B board / API route）。補上工單號與申請人姓名。 */
export async function listReturnRequests(
  filter: ReturnRequestFilter = {},
): Promise<ReturnRequestRow[]> {
  const sb = await createClient();
  let q = sb
    .from("parts_return_requests")
    .select("*")
    .order("due_by", { ascending: true })
    .order("requested_at", { ascending: true });
  if (filter.source_ro_id) q = q.eq("source_ro_id", filter.source_ro_id);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.source_type) q = q.eq("source_type", filter.source_type);
  const { data, error } = await q;
  if (error) {
    console.error("[parts-return-requests] list error", error);
    return [];
  }
  const rows = (data ?? []) as ReturnRequestRow[];

  // 補工單號
  const roIds = [...new Set(rows.map((r) => r.source_ro_id).filter(Boolean))] as string[];
  const roMap = new Map<string, string>();
  if (roIds.length > 0) {
    const { data: ros } = await sb
      .from("repair_orders")
      .select("id, ro_code")
      .in("id", roIds);
    for (const ro of (ros ?? []) as Array<{ id: string; ro_code: string }>) {
      roMap.set(ro.id, ro.ro_code);
    }
  }
  // 補申請人姓名
  const userIds = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))] as string[];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: emps } = await sb
      .from("employees")
      .select("user_id, name")
      .in("user_id", userIds);
    for (const e of (emps ?? []) as Array<{ user_id: string | null; name: string | null }>) {
      if (e.user_id) nameMap.set(e.user_id, e.name ?? "");
    }
  }
  return rows.map((r) => ({
    ...r,
    source_ro_code: r.source_ro_id ? roMap.get(r.source_ro_id) ?? null : null,
    requested_by_name: r.requested_by ? nameMap.get(r.requested_by) ?? null : null,
  }));
}

export type ReturnRequestsSummary = {
  pending: number;
  overdue: number;
  confirmed_today: number;
};

/** Tab B KPI。*/
export async function getReturnRequestsSummary(): Promise<ReturnRequestsSummary> {
  const rows = await listReturnRequests();
  const summary: ReturnRequestsSummary = { pending: 0, overdue: 0, confirmed_today: 0 };
  const todayPrefix = todayTaipeiDatePrefix();
  for (const r of rows) {
    if (r.status === "pending") summary.pending += 1;
    else if (r.status === "overdue") summary.overdue += 1;
    else if (r.status === "confirmed" && (r.confirmed_at ?? "").length > 0) {
      // 粗略以 UTC 比對日期前綴（demo 足夠）
      if ((r.confirmed_at ?? "").startsWith(todayPrefix)) summary.confirmed_today += 1;
    }
  }
  return summary;
}

function todayTaipeiDatePrefix(): string {
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, "0");
  const d = String(taipei.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 查單一品項的可用庫存量（status='available' 的 qty 加總，brand 由 RLS 過濾）。給 stock-balance API 驗閉環用。 */
export async function getAvailableQtyForItem(itemId: string): Promise<number> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("stock_items")
    .select("qty")
    .eq("item_id", itemId)
    .eq("status", "available");
  if (error) {
    console.error("[parts-return-requests] getAvailableQty error", error);
    return 0;
  }
  return ((data ?? []) as Array<{ qty: number | null }>).reduce(
    (sum, r) => sum + Number(r.qty ?? 0),
    0,
  );
}

export async function getReturnRequestById(
  id: string,
): Promise<ReturnRequestRow | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("parts_return_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as ReturnRequestRow) ?? null;
}
