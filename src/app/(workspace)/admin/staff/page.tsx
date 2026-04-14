import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("ceeb6d36062b47d68789dc49700707d9");
  return (
    <StitchInline
      html={html}
      title="人員管理"
      sprint="S1-2"
      device="desktop"
      screenId="ceeb6d36062b47d68789dc49700707d9"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "人員管理" }]}
    />
  );
}
