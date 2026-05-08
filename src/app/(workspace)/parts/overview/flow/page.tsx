import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export const dynamic = "force-dynamic";

export default async function PartsOverviewFlowPage() {
  const html = await loadStitchBody("00_模組功能流程關係圖", "parts-stitch");
  return (
    <StitchInline
      html={html}
      title="流程關係圖"
      sprint="00"
      breadcrumb={[{ label: "備件總覽", href: "/parts" }, { label: "流程關係圖" }]}
    />
  );
}
