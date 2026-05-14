import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("3a113f99-657c-404d-bfdf-36c9baea7a6e");
  return (
    <StitchInline
      html={html}
      title="置換評估"
      sprint="S5-1"
      device="tablet"
      screenId="3a113f99-657c-404d-bfdf-36c9baea7a6e"
      breadcrumb={[{ label: "中古車輛", href: "/usedcar/evaluation" }, { label: "置換評估" }]}
    />
  );
}
