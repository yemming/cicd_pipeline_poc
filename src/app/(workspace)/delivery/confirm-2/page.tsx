import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("6e86c72665d44820b2b770bbde15591f");
  return (
    <StitchInline
      html={html}
      title="交車確認 (下)"
      sprint="S7-5"
      device="tablet"
      screenId="6e86c72665d44820b2b770bbde15591f"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "交車確認 (下)" }]}
    />
  );
}
