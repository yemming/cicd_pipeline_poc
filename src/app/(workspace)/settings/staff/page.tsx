import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";
import { DemoBanner } from "@/components/demo-banner";

export default async function Page() {
  const html = await loadStitchBody("ceeb6d36062b47d68789dc49700707d9");
  return (
    <>
      <DemoBanner href="/admin/admins" hrefLabel="改前往人員主檔（真實版本）" />
      <StitchInline
        html={html}
        title="人員管理"
        sprint="S1-2"
        screenId="ceeb6d36062b47d68789dc49700707d9"
        breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "人員管理" }]}
      />
    </>
  );
}
