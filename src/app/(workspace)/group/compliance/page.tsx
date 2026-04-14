import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("fe943528afb949e0b7c2fe717a94c305");
  return (
    <StitchInline
      html={html}
      title="合規稽核"
      sprint="S10-5"
      device="desktop"
      screenId="fe943528afb949e0b7c2fe717a94c305"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "合規稽核" }]}
    />
  );
}
