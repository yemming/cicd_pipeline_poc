import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("5164d2d5b68b4885ae24dd40f3b118a1");
  return (
    <StitchInline
      html={html}
      title="簽核流程設定"
      sprint="S1-4"
      device="desktop"
      screenId="5164d2d5b68b4885ae24dd40f3b118a1"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "簽核流程設定" }]}
    />
  );
}
