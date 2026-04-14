import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("8cf3cbe6d4ef429ca1a3d88958fd5924");
  return (
    <StitchInline
      html={html}
      title="我的簽核"
      sprint="S1-5"
      device="desktop"
      screenId="8cf3cbe6d4ef429ca1a3d88958fd5924"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "我的簽核" }]}
    />
  );
}
