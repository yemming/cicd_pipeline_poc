import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("55e45ebb3bff4682b32a2b15d60d27a4");
  return (
    <StitchInline
      html={html}
      title="交車儀式"
      sprint="S7-7"
      device="tablet"
      screenId="55e45ebb3bff4682b32a2b15d60d27a4"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "交車儀式" }]}
    />
  );
}
