import { redirect } from "next/navigation";

// 舊 Stitch demo 頁 → 導向真實接待手卡列表
export default function Page(): never {
  redirect("/sales/reception/handcard");
}
