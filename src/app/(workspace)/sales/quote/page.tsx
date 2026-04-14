import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("f2f2139ca6274ad9bb4fa4d9ec0fb775");
  return (
    <StitchInline
      html={html}
      title="接待報價單"
      sprint="S3-9"
      device="ipad"
      screenId="f2f2139ca6274ad9bb4fa4d9ec0fb775"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "接待報價單" }]}
    />
  );
}
