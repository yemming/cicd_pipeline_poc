import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("1dc126f847404a23bd966f7743937945");
  return (
    <StitchInline
      html={html}
      title="看板 (Mobile)"
      sprint="S6-1"
      device="mobile"
      screenId="1dc126f847404a23bd966f7743937945"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "看板 (Mobile)" }]}
    />
  );
}
