import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("02ccf2fe2f9a4416b026a95e7fddcf2f");
  return (
    <StitchInline
      html={html}
      title="消費者首頁"
      sprint="S6-4"
      device="desktop"
      screenId="02ccf2fe2f9a4416b026a95e7fddcf2f"
      breadcrumb={[{ label: "直銷官網", href: "/d2c/home" }, { label: "消費者首頁" }]}
    />
  );
}
