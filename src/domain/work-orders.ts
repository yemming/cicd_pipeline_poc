/**
 * 維修工單 admin 後台 helper — server-only。
 *
 * 涵蓋 /admin/master-data/work-orders/[id] 編輯頁需要的 fetch：
 *   - 工單行（work_order_items）
 *   - active 倉庫（發料對話框用）
 *   - 該工單已發料 issue 列表（避免重複發料）
 *
 * 注意：
 *   - getWorkOrderById 仍在 lib/master-data/queries.ts，B5 收尾再整併
 *   - listActiveWarehouses 暫放這裡（自包），B5 dedupe 時再決定要不要搬到 warehouse.ts
 *   - server actions 在 lib/master-data/workorder-actions.ts，不動
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { Warehouse, WorkOrderItem } from "@/lib/parts/types";

export type WorkOrderIssueSummary = {
  id: string;
  gi_no: string;
  status: string;
  qty_issued_total: number;
  amount_total: number;
  warehouse_id: string;
  issue_date: string;
};

export async function listActiveWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listActiveWarehouses: ${error.message}`);
  return data ?? [];
}

export async function listWorkOrderItems(workOrderId: string): Promise<WorkOrderItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_order_items")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("work_order_id", workOrderId)
    .order("line_no");
  if (error) throw new Error(`listWorkOrderItems: ${error.message}`);
  return data ?? [];
}

export type WorkOrderWithRO = {
  id: string;
  ro_no: string | null;
  repair_order_id: string | null;
  repair_order: { id: string; ro_code: string } | null;
};

export async function getWorkOrderWithRepairOrder(
  workOrderId: string,
): Promise<WorkOrderWithRO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, ro_no, repair_order_id, repair_orders(id, ro_code)")
    .eq("id", workOrderId)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    ro_no: string | null;
    repair_order_id: string | null;
    repair_orders: { id: string; ro_code: string } | null;
  };
  return {
    id: row.id,
    ro_no: row.ro_no,
    repair_order_id: row.repair_order_id,
    repair_order: row.repair_orders ?? null,
  };
}

export async function listIssuesForWorkOrder(
  roId: string,
): Promise<WorkOrderIssueSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select(
      "id, gi_no, status, qty_issued_total, amount_total, warehouse_id, issue_date",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("ro_id", roId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listIssuesForWorkOrder: ${error.message}`);
  return (data ?? []) as WorkOrderIssueSummary[];
}

// ─────────────────────────────────────────────────────────────
// TL 借用測試工單 → work_orders 橋接（Russell 6/17 補充要求項目一）
//
// 為什麼：TL 借料必須走正式 /parts/issue/repair-pick 倉管發料流程
//   （倉管是零件庫房絕對管理人、任何進出都要經其簽核），不是在 tl-close
//   自行逐行出料的捷徑。repair-pick 的清單與預覽都以 work_orders +
//   work_order_items(kind='parts') 驅動，而 TL 是一筆 repair_orders、
//   原本不會產生 work_orders → 永遠不出現在倉管的領料清單。
//
// 本 helper 把 TL repair_order「橋接」成一筆 work_orders（repair_order_id
//   回填）+ 依當前 part lines 同步 work_order_items，TL 便自動進倉管的
//   待領料清單，倉管對它正式發料（persistPick 扣庫、記 stock_issues、認 COGS）。
//
// 冪等：依 repair_order_id 找既有橋接工單，沒有才建；work_order_items 全量
//   重建（只動本橋接工單的 kind='parts' 行），所以 SA 加 / 改 / 刪借料明細
//   後重呼叫即同步最新。
// ─────────────────────────────────────────────────────────────

export type TlBridgeResult =
  | { ok: true; work_order_id: string; parts_line_count: number }
  | { ok: false; error: string };

export async function syncTlWorkOrderBridge(roId: string): Promise<TlBridgeResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 驗 RO 為 TL + 同 brand
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, ro_code, prefix_p1, customer_id, vehicle_id, created_by")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return { ok: false, error: "找不到工單或無權存取" };
  if (ro.prefix_p1 !== "TL") return { ok: false, error: "非 TL 工單，不需橋接" };
  if (!ro.vehicle_id) {
    return { ok: false, error: "TL 工單需先綁定測試車輛才能送倉管領料" };
  }

  // 2) 當前借料明細（kind='part' 且綁 item_id、qty > 0）
  const { data: lines, error: linesErr } = await supabase
    .from("repair_order_lines")
    .select("line_no, item_id, part_name, qty, unit_price")
    .eq("repair_order_id", roId)
    .eq("brand_id", brand)
    .eq("kind", "part")
    .not("item_id", "is", null)
    .order("line_no");
  if (linesErr) return { ok: false, error: `讀取借料明細失敗：${linesErr.message}` };
  const partLines = (lines ?? []).filter((l) => Number(l.qty ?? 0) > 0);

  // 3) upsert work_orders（以 repair_order_id 為橋接鍵）
  const { data: existingWo } = await supabase
    .from("work_orders")
    .select("id")
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .maybeSingle();

  let workOrderId = (existingWo as { id: string } | null)?.id;
  if (!workOrderId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: ins, error: insErr } = await supabase
      .from("work_orders")
      .insert({
        brand_id: brand,
        ro_no: ro.ro_code as string,
        customer_id: (ro.customer_id as string | null) ?? null, // TL 內部借用無客戶
        vehicle_id: ro.vehicle_id as string,
        status: "dispatched", // 已派工：待倉管領料
        repair_order_id: roId,
        external_source: "tl_bridge",
        created_by: user?.id ?? (ro.created_by as string | null) ?? null,
        metadata: {
          is_tl: true,
          source: "tl_bridge",
          tl_ro_code: ro.ro_code,
        },
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      return { ok: false, error: `建立橋接工單失敗：${insErr?.message ?? "unknown"}` };
    }
    workOrderId = ins.id as string;
  }

  // 4) 全量重建 work_order_items(kind='parts')（只動本橋接工單的 parts 行）
  const { error: delErr } = await supabase
    .from("work_order_items")
    .delete()
    .eq("brand_id", brand)
    .eq("work_order_id", workOrderId)
    .eq("kind", "parts");
  if (delErr) return { ok: false, error: `同步借料明細失敗：${delErr.message}` };

  if (partLines.length > 0) {
    const { error: itemsErr } = await supabase.from("work_order_items").insert(
      partLines.map((l, i) => {
        const qty = Number(l.qty ?? 0);
        const price = Number(l.unit_price ?? 0);
        return {
          brand_id: brand,
          work_order_id: workOrderId,
          line_no: i + 1,
          kind: "parts",
          item_id: l.item_id as string,
          description: (l.part_name as string | null) ?? "借出零件",
          qty,
          unit_price: price,
          amount: Math.round(qty * price * 100) / 100,
        };
      }),
    );
    if (itemsErr) return { ok: false, error: `寫入借料明細失敗：${itemsErr.message}` };
  }

  return {
    ok: true,
    work_order_id: workOrderId,
    parts_line_count: partLines.length,
  };
}

// ─────────────────────────────────────────────────────────────
// 借料未還狀態（Russell 6/17 要求二）
//
// 一張 TL 工單「借料未還」= 零件已透過倉管 repair-pick 出庫（橋接 work_order
// 有 completed 的 ro_picking stock_issues），且尚未全部歸還回庫
// （TL 尚未結案，或仍有 pending/overdue 的退料待確認）。
//
// 天數從「出庫日（最早一筆 stock_issues.posted_at）」起算 —— 那是零件實際離開
// 庫房的時間，才是真正的「借了幾天」。due_by（當天下班）另用於 tl-due-by-badge，
// 兩者語意不同。
// ─────────────────────────────────────────────────────────────

export type TlLoanStatus = {
  outstanding: boolean; // 是否「借料未還」
  issued: boolean; // 是否已出庫
  issued_at: string | null; // 最早出庫時間（ISO）
  days_outstanding: number; // 已借天數（從出庫日算）
  pending_returns: number; // 尚待倉管確認的退料筆數
};

export async function getTlOutstandingLoanStatus(roId: string): Promise<TlLoanStatus> {
  const none: TlLoanStatus = {
    outstanding: false,
    issued: false,
    issued_at: null,
    days_outstanding: 0,
    pending_returns: 0,
  };
  if (!roId) return none;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) TL 工單 + 橋接 work_order
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id, prefix_p1, status")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!ro || ro.prefix_p1 !== "TL") return none;

  const { data: wo } = await supabase
    .from("work_orders")
    .select("id")
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .maybeSingle();
  if (!wo) return none;

  // 2) 該橋接 work_order 的已完成領料（出庫）
  const { data: issues } = await supabase
    .from("stock_issues")
    .select("posted_at")
    .eq("brand_id", brand)
    .eq("ro_id", (wo as { id: string }).id)
    .eq("type", "ro_picking")
    .eq("status", "completed")
    .order("posted_at", { ascending: true });
  const issuedRows = (issues ?? []).filter((r) => !!r.posted_at);
  if (issuedRows.length === 0) return none; // 還沒出庫 → 沒有「借料未還」

  const issuedAt = issuedRows[0].posted_at as string;

  // 3) 退料待確認筆數（pending / overdue）
  const { count: pendingCount } = await supabase
    .from("parts_return_requests")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand)
    .eq("source_ro_id", roId)
    .in("status", ["pending", "overdue"]);
  const pendingReturns = pendingCount ?? 0;

  // 4) 是否仍未還：TL 未結案 → 一定未還；已結案但仍有 pending 退料 → 仍未還
  const isClosed = ro.status === "已關單" || ro.status === "已取消";
  const outstanding = !isClosed || pendingReturns > 0;

  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(issuedAt).getTime()) / 86400000),
  );

  return {
    outstanding,
    issued: true,
    issued_at: issuedAt,
    days_outstanding: days,
    pending_returns: pendingReturns,
  };
}
