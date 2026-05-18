/**
 * /service — 第八輪 Q9=A canonical 整併：service/* → parts/aftersales/*
 *
 * 維修管理舊路徑保留 server redirect、避免外連結 404；canonical 入口在 /parts/aftersales。
 */
import { redirect } from "next/navigation";

export default function ServiceRedirect() {
  redirect("/parts/aftersales");
}
