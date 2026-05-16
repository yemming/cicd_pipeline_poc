/**
 * Legacy redirect — 舊路徑 /sales/crm/dormant-leads 已搬到 /crm/sales/dormant-leads。
 * 此檔僅做 server-side 301 redirect，保住歷史外連。
 */
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/sales/dormant-leads");
}
