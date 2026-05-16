/**
 * Legacy redirect — 舊路徑 /sales/crm/survey-templates 已搬到 /crm/sales/survey-templates。
 * 此檔僅做 server-side 301 redirect，保住歷史外連。
 */
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/sales/survey-templates");
}
