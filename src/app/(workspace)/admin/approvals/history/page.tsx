import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("8934f85891e446f2a1f1a60252863972");
  return (
    <StitchInline
      html={html}
      title="簽核歷史"
      sprint="S1-11"
      device="desktop"
      screenId="8934f85891e446f2a1f1a60252863972"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "簽核歷史" }]}
    />
  );
}
