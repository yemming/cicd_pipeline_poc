import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("608f23f9cb484af39f71c15d1af39619");
  return (
    <StitchInline
      html={html}
      title="報表中心"
      sprint="S6-5"
      device="desktop"
      screenId="608f23f9cb484af39f71c15d1af39619"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "報表中心" }]}
    />
  );
}
