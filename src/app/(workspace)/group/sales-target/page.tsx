import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("f3e0be1e2b6c439ea20d5dd428577873");
  return (
    <StitchInline
      html={html}
      title="銷售目標"
      sprint="S6-6"
      device="desktop"
      screenId="f3e0be1e2b6c439ea20d5dd428577873"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "銷售目標" }]}
    />
  );
}
