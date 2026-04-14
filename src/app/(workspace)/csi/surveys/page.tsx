import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a17fb6da32f14c40b0ce90488eeec9ff");
  return (
    <StitchInline
      html={html}
      title="CSI 滿意度"
      sprint="S8-1"
      device="desktop"
      screenId="a17fb6da32f14c40b0ce90488eeec9ff"
      breadcrumb={[{ label: "客戶關懷", href: "/csi/surveys" }, { label: "CSI 滿意度" }]}
    />
  );
}
