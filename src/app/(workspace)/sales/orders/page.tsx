import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("3fc682ca14fb4e6492217377a97aa732");
  return (
    <StitchInline
      html={html}
      title="訂單中心"
      sprint="S3-5"
      device="desktop"
      screenId="3fc682ca14fb4e6492217377a97aa732"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "訂單中心" }]}
    />
  );
}
