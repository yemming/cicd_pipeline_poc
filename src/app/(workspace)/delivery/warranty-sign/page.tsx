import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("431a61ec63f54721a786bfc969d718f3");
  return (
    <StitchInline
      html={html}
      title="保固條款簽署"
      sprint="S7-6"
      device="tablet"
      screenId="431a61ec63f54721a786bfc969d718f3"
      breadcrumb={[{ label: "交車服務", href: "/delivery/pdi" }, { label: "保固條款簽署" }]}
    />
  );
}
