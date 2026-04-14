import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("638516e5f2284433ad9c8d2cc4351ddb");
  return (
    <StitchInline
      html={html}
      title="收車審批"
      sprint="S1-8"
      device="desktop"
      screenId="638516e5f2284433ad9c8d2cc4351ddb"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "收車審批" }]}
    />
  );
}
