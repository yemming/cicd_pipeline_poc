import { z } from "zod";
import { NotificationEnvError } from "./errors";

// Notification Hub 環境變數 schema
//
// Lazy evaluation：只有真的需要時才 parse（避免 build / import 期 crash）
// 第一次呼叫 getNotificationEnv() 會快取結果，後續 O(1)

const envSchema = z.object({
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1, "LINE_CHANNEL_ACCESS_TOKEN 未設定"),
  LINE_CHANNEL_SECRET: z.string().min(1, "LINE_CHANNEL_SECRET 未設定"),

  // Google Chat 目前 Phase 1 可為空，Phase 2 實作 GoogleChatChannel 時才要求必填
  GOOGLE_CHAT_WEBHOOK_URL: z.string().optional(),

  // 逗號分隔 email 清單，parse 時轉陣列
  NOTIFICATION_ADMIN_EMAILS: z.string().optional(),

  NOTIFICATION_DISPATCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  NOTIFICATION_MAX_RETRY: z.coerce.number().int().min(0).max(10).default(3),
  NOTIFICATION_DEBUG: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional()
    .transform((v) => v === "true" || v === "1"),

  APP_URL: z.string().url().optional(),
});

export type NotificationEnv = z.infer<typeof envSchema>;

let cached: NotificationEnv | null = null;

/**
 * 取得 Notification Hub 環境變數（驗證過、帶預設值）。
 * 第一次呼叫會 parse，之後 cache。missing 時 throw NotificationEnvError。
 */
export function getNotificationEnv(): NotificationEnv {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new NotificationEnvError(msg, result.error);
  }
  cached = result.data;
  return cached;
}

/**
 * 測試用 — 清除 cache 強制重 parse。production 不要呼叫。
 */
export function resetNotificationEnvCache(): void {
  cached = null;
}
