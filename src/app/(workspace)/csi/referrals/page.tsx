import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("e2ae74e9b031441295eceba43825c30c");
  return (
    <main className="bg-[#F8F7F4]">
      <div className="px-6 py-4 bg-[#FDECEA] border-b border-[#F5AEAD] text-[#CC0000] text-[13px] flex items-center gap-2">
        <span>⚠️</span>
        <span>
          <strong>Demo 用、未上線</strong> — 本頁僅顯示設計稿、再購 / 轉介紹追蹤資料尚未串接。
          客戶名單與意願追蹤功能規劃中。
        </span>
      </div>
      <StitchInline
        html={html}
        title="再購/轉介紹"
        sprint="S8-2"
        screenId="e2ae74e9b031441295eceba43825c30c"
        breadcrumb={[{ label: "客戶關懷", href: "/csi/surveys" }, { label: "再購/轉介紹" }]}
      />
    </main>
  );
}
