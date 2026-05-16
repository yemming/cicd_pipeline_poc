/**
 * Legacy redirect — 舊路徑 /aftersales/crm/push-notifications 已搬到 /crm/aftersales/push-notifications。
 * 此檔僅做 server-side 301 redirect，保住歷史外連。
 */
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/aftersales/push-notifications");
}
