import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("b8e9e9148ed943d0a9914df3d52c0c8d");
  return (
    <StitchInline
      html={html}
      title="訂單簽核"
      sprint="S1-6"
      device="desktop"
      screenId="b8e9e9148ed943d0a9914df3d52c0c8d"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "訂單簽核" }]}
    />
  );
}
