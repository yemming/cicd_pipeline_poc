/**
 * 客群標籤共用常數 — 由 src/domain/customer-tags.ts 與 UI 共用
 *
 * 這檔不是 "use server"，可 export 非 async 值（陣列 / 物件 / type）。
 */

export const TAG_COLORS = ["red", "yellow", "green", "blue"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_EMOJI: Record<TagColor, string> = {
  red: "🔴",
  yellow: "🟡",
  green: "🟢",
  blue: "🔵",
};

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  red: "注意事項",
  yellow: "偏好特質",
  green: "服務備忘",
  blue: "談判協商",
};

/** 每位 RS 個人自訂標籤「字典」條目上限 — 不是每客戶貼標數（assignments 表落地後另立常數） */
export const PERSONAL_TAG_LIMIT = 20;

/** 主管觀察視角的 trend 閾值 — total_use >= HOT_THRESHOLD 視為「高頻使用」、>= RISING 視為「上升中」 */
export const TREND_HOT_THRESHOLD = 10;
export const TREND_RISING_THRESHOLD = 6;
