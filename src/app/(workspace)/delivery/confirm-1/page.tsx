import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("292c6069abfe41b69ffc41e90ed2878b");
  return (
    <StitchInline
      html={html}
      title="交車確認 (上)"
      sprint="S7-4"
      device="tablet"
      screenId="292c6069abfe41b69ffc41e90ed2878b"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "交車確認 (上)" }]}
    />
  );
}
