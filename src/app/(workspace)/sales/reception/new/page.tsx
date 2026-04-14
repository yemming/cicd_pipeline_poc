import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("99fce611466a4a649ef25a9e3b1a18b4");
  return (
    <StitchInline
      html={html}
      title="新增接待"
      sprint="S2-1"
      device="ipad"
      screenId="99fce611466a4a649ef25a9e3b1a18b4"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "新增接待" }]}
    />
  );
}
