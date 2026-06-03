import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實組織主檔（避免假資料誤導）
export default function Page(): never {
  redirect("/admin/org");
}
