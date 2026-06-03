import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實 CRM 線索（休眠/潛客）管理
export default function Page(): never {
  redirect("/crm/sales/dormant-leads");
}
