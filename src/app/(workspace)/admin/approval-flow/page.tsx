import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("5164d2d5b68b4885ae24dd40f3b118a1");
  return (
    <StitchInline
      html={html}
      title="審批流程設定"
      sprint="S1-4"
      device="desktop"
      screenId="5164d2d5b68b4885ae24dd40f3b118a1"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "審批流程設定" }]}
    />
  );
}
