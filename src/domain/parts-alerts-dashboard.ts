"use server";

/**
 * Domain Helper — 庫存告警儀表板（庫存 10B 首頁 / 老闆點名頁）
 *
 * 本檔是「聚合層」：只複用既有 helper，不自己重寫 query。
 *   - 低於最小庫存 / 再訂購點 → @/domain/parts-balance getInventoryBalanceWithAlerts
 *   - 待備料工單 → @/domain/parts-alert-work-order-loop getLoopBoardData（pending 缺料 loop entries）
 *   - 採購逾期 → @/domain/orders listPurchaseOrders（approved/partial 且 eta_date < today）
 *   - 批號到期 → batch 層目前無 expiry 欄位（B1 卡點）→ 回空陣列 + phase2 旗標，不假造 query
 *
 * 一次回 4 KPI + 5 Tab 首屏資料給 dashboard board。
 */

import { getInventoryBalanceWithAlerts, type BalanceRow } from "@/domain/parts-balance";
import { getLoopBoardData, type LoopRowWithStage } from "@/domain/parts-alert-work-order-loop";
import { listPurchaseOrders, type PurchaseOrderListRow } from "@/domain/orders";

// ─────────────────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────────────────

/** 緊急 / 預警 Tab 用：庫存水位告警一列 */
export type AlertBalanceRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_name: string | null;
  qty_available: number;
  qty_total: number;
  reorder_point: number | null;
  safety_stock: number | null;
  /** 缺口：緊急 = safety - available；預警 = reorder - available */
  shortage: number;
  alert_level: BalanceRow["alert_level"];
};

/** 待備料工單 Tab 用 */
export type PendingWoRow = {
  id: string;
  ro_no: string;
  missing_parts: string;
  sa_name: string | null;
  days_pending: number;
  is_overdue: boolean;
  /** 由 is_overdue / days_pending 推導的優先級標籤 */
  priority: "urgent" | "high" | "normal";
};

/** 採購逾期 Tab 用 */
export type OverduePoRow = {
  id: string;
  po_no: string;
  vendor_name: string | null;
  eta_date: string | null;
  status: string;
  /** 逾期天數（today − eta_date） */
  overdue_days: number;
};

export type AlertDashboardData = {
  kpis: {
    belowMin: number; // 低於最小庫存（below_safety）
    belowReorder: number; // 低於再訂購點（below_reorder）
    pendingParts: number; // 工單待備料（pending loop entries）
    batchExpiry: number; // 批號 30 天到期（Phase 2 — 恆 0）
  };
  urgent: AlertBalanceRow[]; // below_safety
  reorder: AlertBalanceRow[]; // below_reorder
  pendingWos: PendingWoRow[];
  batchExpiry: never[]; // Phase 2：batch 層無 expiry 欄位
  overduePos: OverduePoRow[];
  /** 批號到期 Tab 的 Phase 2 旗標 */
  batchExpiryPhase2: boolean;
};

// ─────────────────────────────────────────────────────────────
// 內部 mapper
// ─────────────────────────────────────────────────────────────

function toAlertBalanceRow(r: BalanceRow): AlertBalanceRow {
  const ref =
    r.alert_level === "below_safety"
      ? r.safety_stock
      : r.alert_level === "below_reorder"
        ? r.reorder_point
        : null;
  const shortage = ref != null ? Math.max(0, ref - r.qty_available) : 0;
  return {
    item_id: r.item_id,
    item_code: r.item_code,
    item_name: r.item_name,
    warehouse_name: r.warehouse_name,
    qty_available: r.qty_available,
    qty_total: r.qty_total,
    reorder_point: r.reorder_point,
    safety_stock: r.safety_stock,
    shortage,
    alert_level: r.alert_level,
  };
}

function toPendingWoRow(r: LoopRowWithStage): PendingWoRow {
  const priority: PendingWoRow["priority"] = r.is_overdue
    ? "urgent"
    : r.days_pending >= 3
      ? "high"
      : "normal";
  return {
    id: r.id,
    ro_no: r.ro_no,
    missing_parts: r.missing_parts,
    sa_name: r.sa_name,
    days_pending: r.days_pending,
    is_overdue: r.is_overdue,
    priority,
  };
}

function toOverduePoRow(r: PurchaseOrderListRow, todayMs: number): OverduePoRow {
  let overdue_days = 0;
  if (r.eta_date) {
    overdue_days = Math.max(0, Math.floor((todayMs - new Date(r.eta_date).getTime()) / 86_400_000));
  }
  return {
    id: r.id,
    po_no: r.po_no,
    vendor_name: r.vendor_name,
    eta_date: r.eta_date,
    status: r.status,
    overdue_days,
  };
}

// ─────────────────────────────────────────────────────────────
// Public — 一次回 4 KPI + 5 Tab 首屏資料
// ─────────────────────────────────────────────────────────────

export async function getAlertDashboardData(): Promise<AlertDashboardData> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  // 用當日 00:00（UTC date 字串）的毫秒當基準算逾期天數
  const todayMs = new Date(`${todayStr}T00:00:00.000Z`).getTime();

  // 平行撈三來源（批號到期不打 DB — 無欄位）
  const [balanceAgg, loopBoard, allPos] = await Promise.all([
    // include_zero 讓 out_of_stock 也算進來；alert_level 不過濾，自己分桶
    getInventoryBalanceWithAlerts({ include_zero: true }, { page: 1, pageSize: 10_000 }),
    getLoopBoardData({ status: "pending" }),
    listPurchaseOrders(),
  ]);

  // 停用品項（items.is_active=false）沒辦法走標準 PO 流程補貨，
  // 列進「需要下單」的告警清單只會產生叫不了貨的假告警 → 過濾掉
  const urgent = balanceAgg.rows
    .filter((r) => r.alert_level === "below_safety" && r.item_is_active)
    .map(toAlertBalanceRow);
  const reorder = balanceAgg.rows
    .filter((r) => r.alert_level === "below_reorder" && r.item_is_active)
    .map(toAlertBalanceRow);

  const pendingWos = loopBoard.rows
    .filter((r) => r.status !== "resolved")
    .map(toPendingWoRow)
    // 逾期 / 待料天數高的排前面
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return b.days_pending - a.days_pending;
    });

  const overduePos = allPos
    .filter(
      (p) =>
        (p.status === "approved" || p.status === "partial") &&
        p.eta_date != null &&
        p.eta_date < todayStr,
    )
    .map((p) => toOverduePoRow(p, todayMs))
    .sort((a, b) => b.overdue_days - a.overdue_days);

  return {
    kpis: {
      belowMin: urgent.length,
      belowReorder: reorder.length,
      pendingParts: pendingWos.length,
      batchExpiry: 0,
    },
    urgent,
    reorder,
    pendingWos,
    batchExpiry: [],
    overduePos,
    batchExpiryPhase2: true,
  };
}
