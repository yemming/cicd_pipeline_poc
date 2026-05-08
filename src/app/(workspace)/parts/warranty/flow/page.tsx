import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export const dynamic = "force-dynamic";

export default async function PartsWarrantyFlowPage() {
  const html = await loadStitchBody("11_保固索賠_索賠流程說明", "parts-stitch");
  return (
    <StitchInline
      html={html}
      title="索賠流程說明"
      sprint="11"
      breadcrumb={[{ label: "保固索賠", href: "/parts/warranty/ro-link" }, { label: "索賠流程說明" }]}
    />
  );
}
