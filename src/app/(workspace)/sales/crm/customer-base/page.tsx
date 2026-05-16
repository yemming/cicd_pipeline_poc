/**
 * Legacy redirect — 舊路徑 /sales/crm/customer-base 已搬到 /crm/sales/customer-base。
 * 此檔僅做 server-side 301 redirect，保住歷史外連。
 */
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/sales/customer-base");
}
