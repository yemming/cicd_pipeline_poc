import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("e323677e9e2e4cb190022f1fa09a502c");
  return (
    <StitchInline
      html={html}
      title="PDI 配件安裝"
      sprint="S7-3"
      device="tablet"
      screenId="e323677e9e2e4cb190022f1fa09a502c"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "PDI 配件安裝" }]}
    />
  );
}
