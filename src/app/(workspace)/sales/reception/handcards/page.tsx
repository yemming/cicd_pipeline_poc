import { redirect } from "next/navigation";

// Dashboard「今日接待」提醒的 target_href_template（DB: reminder_definitions）指向
// /sales/reception/handcards?date=today，但真實列表在 /sales/reception/handcard。
// 列表頁不吃 `date` 參數（只吃 date_from / date_to），故直接導向列表。
export default function Page(): never {
  redirect("/sales/reception/handcard");
}
