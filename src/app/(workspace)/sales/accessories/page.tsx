import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("cb56d0d2424f425e943d240e06d0c26c");
  return (
    <StitchInline
      html={html}
      title="精品選配"
      sprint="S3-7"
      device="tablet"
      screenId="cb56d0d2424f425e943d240e06d0c26c"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "精品選配" }]}
    />
  );
}
