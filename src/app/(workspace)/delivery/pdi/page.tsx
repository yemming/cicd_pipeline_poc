import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("867edbe750124ece91cb5a2afbe38761");
  return (
    <StitchInline
      html={html}
      title="PDI 檢查表"
      sprint="S7-2"
      device="tablet"
      screenId="867edbe750124ece91cb5a2afbe38761"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "PDI 檢查表" }]}
    />
  );
}
