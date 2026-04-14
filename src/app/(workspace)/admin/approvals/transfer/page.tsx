import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("1e7d257222954e50a79e98d49173d153");
  return (
    <StitchInline
      html={html}
      title="調車審批"
      sprint="S1-10"
      device="desktop"
      screenId="1e7d257222954e50a79e98d49173d153"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "調車審批" }]}
    />
  );
}
