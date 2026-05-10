import { redirect } from "next/navigation";

/**
 * 採購退貨「新增」入口 — redirect 回 list 頁並開啟 modal。
 *
 * 設計拍板（Q2）：新增 form 走 list 頁的 Modal（PO 連動更直觀），
 * 不在 detail page 上做 create-mode；本頁只是一個 entrypoint，方便外部連結 / sidebar。
 */
export default function NewPurchaseReturnPage() {
  redirect("/parts/purchase/returns?new=1");
}
