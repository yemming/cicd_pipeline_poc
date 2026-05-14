import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("6583d22b-dccd-4ee2-88a4-368c1a7f6883");
  return (
    <StitchInline
      html={html}
      title="報價簽訂"
      sprint="S3-9"
      device="tablet"
      screenId="6583d22b-dccd-4ee2-88a4-368c1a7f6883"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "報價簽訂" }]}
    />
  );
}
