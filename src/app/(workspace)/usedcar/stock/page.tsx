import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("6f6ddad5a36144daa42a772607663054");
  return (
    <StitchInline
      html={html}
      title="中古車庫存"
      sprint="S5-2"
      device="desktop"
      screenId="6f6ddad5a36144daa42a772607663054"
      breadcrumb={[{ label: "中古機車", href: "/usedcar/evaluation" }, { label: "中古車庫存" }]}
    />
  );
}
