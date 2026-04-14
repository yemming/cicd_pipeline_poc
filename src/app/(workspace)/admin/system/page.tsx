import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("6165a595ffd049918a2f79d48557c8bd");
  return (
    <StitchInline
      html={html}
      title="系統設定"
      sprint="S9-2"
      device="desktop"
      screenId="6165a595ffd049918a2f79d48557c8bd"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "系統設定" }]}
    />
  );
}
