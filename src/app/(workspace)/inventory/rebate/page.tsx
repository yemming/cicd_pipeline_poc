import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("f7e26a48756f404c8eb0f7c3b804a02a");
  return (
    <StitchInline
      html={html}
      title="返利結算"
      sprint="S10-3"
      device="desktop"
      screenId="f7e26a48756f404c8eb0f7c3b804a02a"
      breadcrumb={[{ label: "整車庫存", href: "/inventory/vehicles" }, { label: "返利結算" }]}
    />
  );
}
