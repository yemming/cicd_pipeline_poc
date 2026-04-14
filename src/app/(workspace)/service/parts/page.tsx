import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("bf46972c2a64481cb90839a93382c317");
  return (
    <StitchInline
      html={html}
      title="配件庫存"
      sprint="S4-3"
      device="desktop"
      screenId="bf46972c2a64481cb90839a93382c317"
      breadcrumb={[{ label: "維修管理", href: "/service/appointments" }, { label: "配件庫存" }]}
    />
  );
}
