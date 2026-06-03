import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實 CRM 銷售客戶主檔
export default function Page(): never {
  redirect("/crm/sales/customer-base");
}
