import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a8f988ac82df4503aa4e6a99c5a5a95f");
  return (
    <StitchInline
      html={html}
      title="商務政策"
      sprint="S10-4"
      device="desktop"
      screenId="a8f988ac82df4503aa4e6a99c5a5a95f"
      breadcrumb={[{ label: "經銷商管理", href: "/inventory/vehicles" }, { label: "商務政策" }]}
    />
  );
}
