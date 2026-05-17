/**
 * Legacy redirect stub (2026-05-17, P0-#6) — 原本是 291 行寫死假資料 demo 頁，
 * 隨 ff45491 commit (refactor: 統一 sales/aftersales CRM 14 頁到 /crm/* 單一模組)
 * 應該轉成 redirect 但這條漏掉了。本檔保留路徑相容性，把流量導去新 CRM 模組首頁。
 */
import { redirect } from "next/navigation";

export default function SalesCrmLegacyRedirect(): never {
  redirect("/crm/sales/call-tasks");
}
