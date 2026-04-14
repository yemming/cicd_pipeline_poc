import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("e8c1015b71784626ac9797caaf57f457");
  return (
    <StitchInline
      html={html}
      title="置換評估"
      sprint="S5-1"
      device="tablet"
      screenId="e8c1015b71784626ac9797caaf57f457"
      breadcrumb={[{ label: "中古機車", href: "/usedcar/evaluation" }, { label: "置換評估" }]}
    />
  );
}
