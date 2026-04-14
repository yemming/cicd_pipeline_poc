import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("0f7df3e575254e96b24b084be30179c1");
  return (
    <StitchInline
      html={html}
      title="集團看板"
      sprint="S6-2"
      device="desktop"
      screenId="0f7df3e575254e96b24b084be30179c1"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "集團看板" }]}
    />
  );
}
