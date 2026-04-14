import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("83860fd7c7e5450883fa05481790cab2");
  return (
    <StitchInline
      html={html}
      title="手卡・試駕成交"
      sprint="S2-4"
      device="ipad"
      screenId="83860fd7c7e5450883fa05481790cab2"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "手卡・試駕成交" }]}
    />
  );
}
