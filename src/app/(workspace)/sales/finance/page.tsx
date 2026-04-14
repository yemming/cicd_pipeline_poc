import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("99a04d77b6eb4dc0abee06254039be18");
  return (
    <StitchInline
      html={html}
      title="金融服務"
      sprint="S3-3"
      device="tablet"
      screenId="99a04d77b6eb4dc0abee06254039be18"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "金融服務" }]}
    />
  );
}
