/**
 * 通知事件目錄 — /settings/notifications Tab 二用。
 *
 * 純資料、無 server-only / client-only 相依，client component 可直接 import。
 * 分組與中文標籤照 Russell 規格；未列出的事件一律歸進「其他事件」用事件碼本身當顯示名，
 * 避免既有訂閱設定從畫面上消失。
 *
 * ⚠️ 這裡刻意不 import `@/lib/notifications` 的 `EventCode`：
 * 該型別只涵蓋 Notification Hub 一般事件，另一批 sales/aftersales 專用事件碼
 * （sales_lead.* / call_task.* / service_appointment.* 等，定義在
 * `@/domain/sales-notifications.constants`）沒有被收進那個 union。
 * 本頁兩批事件都要顯示、都走同一組 server actions，用 plain string 最單純。
 */

export interface EventCatalogEntry {
  code: string;
  label: string;
}

export interface EventCatalogGroup {
  key: string;
  label: string;
  events: EventCatalogEntry[];
}

export const EVENT_CATALOG: EventCatalogGroup[] = [
  {
    key: "sales",
    label: "RS 銷售",
    events: [
      { code: "sales_discount.requested", label: "折扣申請" },
      { code: "sales_discount.escalated", label: "折扣審核逾時升級" },
      { code: "sales_discount.decided", label: "折扣審核結果" },
      { code: "vehicle_arrival.confirmed", label: "新車到港確認" },
      { code: "vehicle.pdi_completed", label: "PDI 整備完成" },
      { code: "customer.handover_scheduled", label: "交車排程" },
      { code: "financing.pending_timeout", label: "分期逾時" },
      { code: "test_ride_incident.reported", label: "試乘事故" },
    ],
  },
  {
    key: "aftersales",
    label: "售後修護",
    events: [
      { code: "work_order.created", label: "工單建立" },
      { code: "work_order.status_changed", label: "工單狀態變更（維修中→待結帳）" },
      { code: "aftersales_approval.requested", label: "主管授權申請" },
      { code: "aftersales_approval.resolved", label: "主管授權結果" },
      { code: "ro_checkout.unpaid_overdue", label: "待結帳逾期" },
      { code: "aftersales_followup.escalated", label: "跟進案件升級" },
    ],
  },
  {
    key: "inventory",
    label: "庫存管理",
    events: [{ code: "inventory.release_failed", label: "庫存釋放失敗" }],
  },
  {
    key: "crm",
    label: "CRM",
    events: [{ code: "survey.dispatched", label: "NPS問卷發送" }],
  },
  {
    key: "other",
    label: "其他事件",
    events: [
      "call_task.assigned",
      "call_task.overdue",
      "sales_lead.dormant_3d_no_contact",
      "sales_lead.high_intent_assigned",
      "sales_lead.won",
      "sales_lead.lost",
      "service_appointment.upcoming",
      "service_appointment.no_show",
      "vehicle.warranty_expiring",
      "work_order.completed",
      "customer.aftersales_dormant",
      "csi_survey.detractor",
      "crm_push.sent",
      "feedback_ticket.created",
      "deploy.released",
      "service_request.created",
      "followup.line_reminder",
      "repair_order.completed",
      "repair_order_addon.proposed",
      "pickup_notification.test",
    ].map((code) => ({ code, label: code })),
  },
];

/** 目錄裡出現過的所有事件碼（用來偵測「目錄沒收錄、但資料庫已有訂閱」的漏網事件）*/
export function catalogedEventCodes(): Set<string> {
  return new Set(EVENT_CATALOG.flatMap((g) => g.events.map((e) => e.code)));
}
