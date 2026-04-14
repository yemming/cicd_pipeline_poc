import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a7b0843a2c094c38908fc9e60e89d7f2");
  return (
    <StitchInline
      html={html}
      title="客戶中心"
      sprint="S2-7"
      device="desktop"
      screenId="a7b0843a2c094c38908fc9e60e89d7f2"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "客戶中心" }]}
    />
  );
}
