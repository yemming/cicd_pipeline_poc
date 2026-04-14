import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("f822233c2bba46cc922f40a25c68f4c1");
  return (
    <StitchInline
      html={html}
      title="接待記錄"
      sprint="S2-2"
      device="ipad"
      screenId="f822233c2bba46cc922f40a25c68f4c1"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "接待記錄" }]}
    />
  );
}
