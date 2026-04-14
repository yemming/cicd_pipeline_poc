import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("48b9a52cdecb43df8f3742ce7772e57a");
  return (
    <StitchInline
      html={html}
      title="手卡・前台登記"
      sprint="S2-2"
      device="ipad"
      screenId="48b9a52cdecb43df8f3742ce7772e57a"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "手卡・前台登記" }]}
    />
  );
}
