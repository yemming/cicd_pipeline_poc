// canonical → /parts/aftersales（第八輪 Q9=A）
// TODO: aftersales 暫無「增項管理」對映頁；先導到模組首頁
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/parts/aftersales");
}
