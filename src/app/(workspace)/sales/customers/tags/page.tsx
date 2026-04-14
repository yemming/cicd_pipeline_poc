import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("89f1d788c965410daca3bcae02c7ba6e");
  return (
    <StitchInline
      html={html}
      title="客戶標籤"
      sprint="S2-5"
      device="desktop"
      screenId="89f1d788c965410daca3bcae02c7ba6e"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "客戶標籤" }]}
    />
  );
}
