import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("efc46f958e984d43ad416acb574af0ef");
  return (
    <StitchInline
      html={html}
      title="保固管理"
      sprint="S8-3"
      device="desktop"
      screenId="efc46f958e984d43ad416acb574af0ef"
      breadcrumb={[{ label: "維修管理", href: "/service/appointments" }, { label: "保固管理" }]}
    />
  );
}
