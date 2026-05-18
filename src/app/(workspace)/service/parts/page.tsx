// canonical → /parts/aftersales（第八輪 Q9=A）
// TODO: aftersales 暫無「配件庫存」對映頁；先導到模組首頁，未來可接到 /parts/inventory
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/parts/aftersales");
}
