import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("ec054eb14dc2417da2ca912aec8318d2");
  return (
    <StitchInline
      html={html}
      title="銷售漏斗"
      sprint="S2-6"
      device="desktop"
      screenId="ec054eb14dc2417da2ca912aec8318d2"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "銷售漏斗" }]}
    />
  );
}
