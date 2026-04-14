import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("638516e5f2284433ad9c8d2cc4351ddb");
  return (
    <StitchInline
      html={html}
      title="收車簽核"
      sprint="S1-8"
      device="desktop"
      screenId="638516e5f2284433ad9c8d2cc4351ddb"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "收車簽核" }]}
    />
  );
}
