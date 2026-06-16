/**
 * 報損報溢 — client-side constants (純值，可由 "use client" 元件 import)
 *
 * domain/loss-overflow.ts 是 "use server"，禁止 export 非 async 值，
 * 故把常數獨立放在此檔。
 */

export const APPROVAL_THRESHOLD = 5000;

/** 大額報廢 / 損耗：需店長（store_manager）層級審批 */
export const SENIOR_APPROVAL_THRESHOLD = 20000;

export const LOSS_OVERFLOW_REASONS = [
  "damage",
  "lost",
  "expired",
  "count_error",
  "other",
] as const;

export type LossOverflowReason = (typeof LOSS_OVERFLOW_REASONS)[number];

export const REASON_LABEL: Record<LossOverflowReason, string> = {
  damage: "毀損",
  lost: "短少 / 遺失",
  expired: "過期報廢",
  count_error: "盤點誤差",
  other: "其他",
};
