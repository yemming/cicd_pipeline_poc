import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a97d23e4f03847bb8333b1befd647632");
  return (
    <StitchInline
      html={html}
      title="CRM 電訪"
      sprint="S3-6"
      device="desktop"
      screenId="a97d23e4f03847bb8333b1befd647632"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "CRM 電訪" }]}
    />
  );
}
