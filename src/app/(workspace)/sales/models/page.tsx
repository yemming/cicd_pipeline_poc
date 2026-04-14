import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("6a4a5093d497482fb532650d25589829");
  return (
    <StitchInline
      html={html}
      title="車型資訊"
      sprint="—"
      device="desktop"
      screenId="6a4a5093d497482fb532650d25589829"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "車型資訊" }]}
    />
  );
}
