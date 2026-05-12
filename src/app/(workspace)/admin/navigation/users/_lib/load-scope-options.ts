/**
 * Thin re-export — 給 user-assignments detail / new 頁共用。
 * 實際邏輯在 `src/domain/navigation-admin.ts`，本檔僅保 import path 不動。
 */
export { loadScopeOptionsForAdmin as loadScopeOptions } from "@/domain/navigation-admin";
