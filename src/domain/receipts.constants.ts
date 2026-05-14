/**
 * 常數 — `src/domain/receipts.ts` 是 "use server" module，
 * 依 spec-to-feature 紀律不可 export 非 async value（常數 / object / array）。
 * 把分頁預設拆到本檔，由 helper + UI 共享。
 */

export const RECEIPTS_PAGE_SIZE_DEFAULT = 50;
