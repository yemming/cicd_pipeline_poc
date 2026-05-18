// canonical → /parts/aftersales（第八輪 Q9=A）
// TODO: aftersales 暫無 PDI 對映頁；先導到模組首頁、未來補正式 PDI 流程後再指向專頁
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/parts/aftersales");
}
