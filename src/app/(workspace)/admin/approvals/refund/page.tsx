import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("3b1ee33fd56f4e5db193ada91c6e700c");
  return (
    <main className="bg-[#F8F7F4]">
      <div className="px-6 py-4 bg-[#FDECEA] border-b border-[#F5AEAD] text-[#CC0000] text-[13px] flex items-center gap-2">
        <span>⚠️</span>
        <span><strong>Demo 用、未上線</strong> — 本頁僅顯示設計稿、簽核功能尚未實作。如需簽核請至 <a href="/admin/approvals" className="underline">我的簽核中心</a>。</span>
      </div>
      <StitchInline
        html={html}
        title="退款簽核"
        sprint="S1-9"
        screenId="3b1ee33fd56f4e5db193ada91c6e700c"
        breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "退款簽核" }]}
      />
    </main>
  );
}
