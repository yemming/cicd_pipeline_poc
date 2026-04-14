import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("c67e7324cd3e4f62a0fc9b0fbbdce5dc");
  return (
    <StitchInline
      html={html}
      title="顧問 App"
      sprint="S3-8"
      device="mobile"
      screenId="c67e7324cd3e4f62a0fc9b0fbbdce5dc"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "顧問 App" }]}
    />
  );
}
