import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實集團營運儀表板
export default function Page(): never {
  redirect("/group/dashboard");
}
