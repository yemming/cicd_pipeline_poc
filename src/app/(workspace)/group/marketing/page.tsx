import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("49b04c83bfe34273b9769ec9321d6c30");
  return (
    <StitchInline
      html={html}
      title="行銷活動"
      sprint="S9-1"
      device="desktop"
      screenId="49b04c83bfe34273b9769ec9321d6c30"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "行銷活動" }]}
    />
  );
}
