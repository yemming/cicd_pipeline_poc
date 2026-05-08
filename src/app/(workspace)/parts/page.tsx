import { PartsInline } from "@/components/parts-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

/**
 * /parts 模組首頁 — 渲染 docs/DUCATI_庫存管理模組_正式版/00_庫存管理模組_導覽總覽.html
 * 與其餘 52 頁 catchall 行為一致。
 */
export default async function Page() {
  const file = "00_庫存管理模組_導覽總覽";
  const html = await loadStitchBody(file, "parts-stitch");
  return (
    <PartsInline
      html={html}
      title="模組導覽"
      breadcrumb={[{ label: "庫存管理" }]}
      fileName={file}
    />
  );
}
