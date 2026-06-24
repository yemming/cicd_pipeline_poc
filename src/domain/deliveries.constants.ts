/**
 * Deliveries domain — client-safe constants
 *
 * 型別 / 常數拆到這裡，讓 client component 可以安全 import，
 * 不會把 server-only / supabase server client 拉進 bundle。
 */

// ─── 車輛類型（交車流程分流用）───────────────────────────────────
/** 交車流程的車輛類型，從 sales_orders.contract_type 推導 */
export type DeliveryVehicleKind = "new" | "used" | "unknown";

// ─── 交車完成連鎖動作結果 ─────────────────────────────────────
/** completeDelivery 各連鎖動作的執行狀態（用於 audit + UI 顯示） */
export type DeliveryChainResult = {
  /** 銷售訂單狀態是否成功更新為 delivered */
  salesOrderUpdated: boolean;
  /** 車輛庫存狀態是否成功更新為 sold */
  inventoryUpdated: boolean;
  /** D+3 電訪任務是否成功建立 */
  d3TaskCreated: boolean;
  /** D+10 保固提醒是否成功建立（中古車固定為 null = 不建立） */
  warrantyReminderCreated: boolean | null;
  /** dispute_frozen 凍結跳過（true = 整個 chain 被跳過） */
  frozenSkipped: boolean;
};

// ─── 中古車交車前置條件狀態 ───────────────────────────────────────
/** 中古車交車流程的前置條件確認狀態 */
export type UsedCarDeliveryPrereqState = "ok" | "pending" | "blocked";

export type UsedCarDeliveryPrereq = {
  state: UsedCarDeliveryPrereqState;
  canProceed: boolean;
  /** 是否找到關聯的中古車庫存紀錄 */
  hasLinkedCar: boolean;
  /** 中古車庫存 id（used_car_inventory.id） */
  carId: string | null;
  /** 中古車庫存狀態 */
  carStatus: string | null;
  /** customer_acknowledged_at — 客戶確認車況的時間（condition_report.customer_acknowledged_at） */
  customerAcknowledgedAt: string | null;
};
