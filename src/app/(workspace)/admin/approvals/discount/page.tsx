import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("c27c74ea875a4c8987b84c4cb8035ab9");
  return (
    <StitchInline
      html={html}
      title="折扣簽核"
      sprint="S1-7"
      device="desktop"
      screenId="c27c74ea875a4c8987b84c4cb8035ab9"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "折扣簽核" }]}
    />
  );
}
