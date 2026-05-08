import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export const dynamic = "force-dynamic";

export default async function PartsPurchaseFlowPage() {
  const html = await loadStitchBody("04_採購流程鏈路說明", "parts-stitch");
  return (
    <StitchInline
      html={html}
      title="採購流程說明"
      sprint="04"
      breadcrumb={[{ label: "採購管理", href: "/parts/purchase/orders" }, { label: "採購流程說明" }]}
    />
  );
}
