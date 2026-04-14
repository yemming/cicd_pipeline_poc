import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("8df863759c604bab91a4a38e38e2e3ce");
  return (
    <StitchInline
      html={html}
      title="保險服務"
      sprint="S3-4"
      device="tablet"
      screenId="8df863759c604bab91a4a38e38e2e3ce"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "保險服務" }]}
    />
  );
}
