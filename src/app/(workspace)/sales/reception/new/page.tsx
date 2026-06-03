import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實新增接待手卡
export default function Page(): never {
  redirect("/sales/reception/handcard/new");
}
