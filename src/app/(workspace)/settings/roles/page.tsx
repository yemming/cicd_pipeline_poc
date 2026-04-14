import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("366a7fd4ce77445e925d02cde3afba82");
  return (
    <StitchInline
      html={html}
      title="角色權限"
      sprint="S1-3"
      device="desktop"
      screenId="366a7fd4ce77445e925d02cde3afba82"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "角色權限" }]}
    />
  );
}
