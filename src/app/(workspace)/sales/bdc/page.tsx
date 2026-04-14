import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("9f0cbd757c59418da5f94b0e71de75ee");
  return (
    <StitchInline
      html={html}
      title="電銷工作台"
      sprint="S3-2"
      device="desktop"
      screenId="9f0cbd757c59418da5f94b0e71de75ee"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "電銷工作台" }]}
    />
  );
}
