import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("40cad06add0e44c6b523a54514b01b77");
  return (
    <StitchInline
      html={html}
      title="組織架構"
      sprint="S1-1"
      device="desktop"
      screenId="40cad06add0e44c6b523a54514b01b77"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "組織架構" }]}
    />
  );
}
