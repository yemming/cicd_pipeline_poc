import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("7fc8a244a33941aba5db6e8e9bfc6f11");
  return (
    <StitchInline
      html={html}
      title="線索管理"
      sprint="S3-1"
      device="desktop"
      screenId="7fc8a244a33941aba5db6e8e9bfc6f11"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "線索管理" }]}
    />
  );
}
