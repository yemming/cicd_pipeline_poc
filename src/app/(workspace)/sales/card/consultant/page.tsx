import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a31b7bafb5b04dde83409277678754ab");
  return (
    <StitchInline
      html={html}
      title="手卡・顧問填寫"
      sprint="S2-3"
      device="ipad"
      screenId="a31b7bafb5b04dde83409277678754ab"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "手卡・顧問填寫" }]}
    />
  );
}
