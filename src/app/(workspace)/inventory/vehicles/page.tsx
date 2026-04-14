import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("91bdac2c367e4e04a3caa8d79201d864");
  return (
    <StitchInline
      html={html}
      title="整車庫存"
      sprint="S10-1"
      device="desktop"
      screenId="91bdac2c367e4e04a3caa8d79201d864"
      breadcrumb={[{ label: "整車庫存", href: "/inventory/vehicles" }, { label: "整車庫存" }]}
    />
  );
}
