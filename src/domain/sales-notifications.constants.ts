/**
 * Client-safe constants — 推播通知設定（銷售 + 售後共用）
 *
 * 為了讓 client component（toggle / 通路 picker）可以 import 事件 metadata
 * 而不會把 server-only 的 supabase helper 拉進 client bundle，把純資料拆到本檔。
 *
 * 銷售（module='sales'）與售後（module='aftersales'）共用同一個 board 元件 +
 * domain helper + actions；事件清單依 module 過濾。
 */

export type SalesNotificationModule = "sales" | "aftersales";

export type SalesNotificationEventCode =
  // 銷售
  | "sales_lead.dormant_3d_no_contact"
  | "sales_lead.high_intent_assigned"
  | "sales_lead.won"
  | "sales_lead.lost"
  | "call_task.assigned"
  | "call_task.overdue"
  // 售後
  | "service_appointment.upcoming"
  | "service_appointment.no_show"
  | "work_order.completed"
  | "customer.aftersales_dormant"
  | "csi_survey.detractor"
  | "vehicle.warranty_expiring";

export type SalesNotificationChannelCode = "line" | "google-chat";

export type SalesNotificationEventMeta = {
  code: SalesNotificationEventCode;
  name: string;
  description: string;
  icon: string;
  /** UI 上的分群 */
  group:
    | "lead"
    | "task"
    | "deal"
    | "appointment"
    | "workorder"
    | "customer"
    | "vehicle";
  /** 此事件屬於哪個 module（決定在哪個頁面顯示） */
  module: SalesNotificationModule;
};

export const SALES_NOTIFICATION_EVENTS: SalesNotificationEventMeta[] = [
  // ── 銷售 module ──
  {
    code: "sales_lead.dormant_3d_no_contact",
    name: "線索 3 天未聯繫",
    description: "客戶留下線索後 3 天內沒撥打、沒回訊,自動提醒避免石沉大海。",
    icon: "schedule",
    group: "lead",
    module: "sales",
  },
  {
    code: "sales_lead.high_intent_assigned",
    name: "高意願線索分派",
    description: "AI 評分 >= 80 的高意願客戶被指派時即時通知接手業務。",
    icon: "local_fire_department",
    group: "lead",
    module: "sales",
  },
  {
    code: "call_task.assigned",
    name: "電訪任務指派",
    description: "新電訪任務分派到我名下時通知(含預定時間 / 客戶 / 模板)。",
    icon: "assignment_ind",
    group: "task",
    module: "sales",
  },
  {
    code: "call_task.overdue",
    name: "電訪任務逾期",
    description: "電訪任務超過預定撥打時間仍未完成時提醒,避免漏單。",
    icon: "alarm",
    group: "task",
    module: "sales",
  },
  {
    code: "sales_lead.won",
    name: "成交(銷售達成)",
    description: "戰線進到 won 階段,主管 / 整組馬上收到成交喜報。",
    icon: "emoji_events",
    group: "deal",
    module: "sales",
  },
  {
    code: "sales_lead.lost",
    name: "戰敗(線索結案)",
    description: "戰敗時推播給主管做敗因分析(價格 / 對手 / 時機)。",
    icon: "trending_down",
    group: "deal",
    module: "sales",
  },
  // ── 售後 module ──
  {
    code: "service_appointment.upcoming",
    name: "預約即將到店",
    description:
      "維修保養預約進入 24 小時內,推播給接待組做進廠前的準備（料件 / 工位 / 客戶名單）。",
    icon: "event_available",
    group: "appointment",
    module: "aftersales",
  },
  {
    code: "service_appointment.no_show",
    name: "預約 No-show",
    description:
      "客戶預約時間已過 30 分鐘仍未到店,自動提醒服務顧問跟進改約或關單。",
    icon: "event_busy",
    group: "appointment",
    module: "aftersales",
  },
  {
    code: "work_order.completed",
    name: "工單完工待交車",
    description: "技師標記工單完工後,通知服務顧問通知車主取車並開立發票。",
    icon: "build_circle",
    group: "workorder",
    module: "aftersales",
  },
  {
    code: "customer.aftersales_dormant",
    name: "售後休眠客戶",
    description:
      "車主超過 12 個月未進廠,推播給售後業務做關懷召回(保養 / 健檢活動)。",
    icon: "person_off",
    group: "customer",
    module: "aftersales",
  },
  {
    code: "csi_survey.detractor",
    name: "CSI 不滿意回饋",
    description:
      "顧客滿意度問卷分數 <= 6(detractor),立刻推播主管即時介入挽回。",
    icon: "sentiment_dissatisfied",
    group: "customer",
    module: "aftersales",
  },
  {
    code: "vehicle.warranty_expiring",
    name: "車輛保固即將到期",
    description:
      "保固到期前 30 天提醒,推播給售後業務追加延長保固或召回最後保養。",
    icon: "verified",
    group: "vehicle",
    module: "aftersales",
  },
];

export const SALES_NOTIFICATION_GROUP_LABEL: Record<
  SalesNotificationEventMeta["group"],
  string
> = {
  lead: "線索",
  task: "電訪任務",
  deal: "成交 / 戰敗",
  appointment: "預約",
  workorder: "維修工單",
  customer: "客戶關懷",
  vehicle: "車輛 / 保固",
};

export const SALES_NOTIFICATION_CHANNEL_LABEL: Record<
  SalesNotificationChannelCode,
  string
> = {
  line: "LINE",
  "google-chat": "Google Chat",
};

export function eventMeta(
  code: string,
): SalesNotificationEventMeta | undefined {
  return SALES_NOTIFICATION_EVENTS.find((e) => e.code === code);
}

/** 取單一 module 的事件清單（保留 metadata 順序） */
export function eventsForModule(
  module: SalesNotificationModule,
): SalesNotificationEventMeta[] {
  return SALES_NOTIFICATION_EVENTS.filter((e) => e.module === module);
}

/** 取 module 的事件 code 清單 */
export function eventCodesForModule(
  module: SalesNotificationModule,
): SalesNotificationEventCode[] {
  return eventsForModule(module).map((e) => e.code);
}
