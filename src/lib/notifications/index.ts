// Notification Hub 對外門面（Phase 1 骨架版）
//
// 使用範例（Phase 3 後可用）：
//   import { notifications } from '@/lib/notifications';
//   await notifications.dispatch({ code: 'work_order.created', payload: {...} });
//
// Phase 1 只 export 型別 + 環境變數 + admin helper；dispatch 主體在 Phase 3 補。

export type {
  ChannelCode,
  EventCode,
  TargetType,
  TargetRef,
  NotificationEvent,
  NotificationChannel,
  ChannelSendResult,
  TemplateDefinition,
  TemplateFormat,
  DeliveryStatus,
  NotificationChannelRow,
  NotificationTargetRow,
  NotificationSubscriptionRow,
  NotificationTemplateRow,
  NotificationDeliveryRow,
} from "./types";

export {
  NotificationError,
  ChannelSendError,
  TemplateNotFoundError,
  NotificationEnvError,
} from "./errors";

export { getNotificationEnv, resetNotificationEnvCache } from "./env";

export {
  getCurrentUserAndNotificationAdmin,
  requireNotificationAdmin,
  listAdminEmails,
} from "./admin";

export type { NotificationUserContext } from "./admin";

// Phase 3 會 export:
// export { notifications, NotificationService } from "./service";
