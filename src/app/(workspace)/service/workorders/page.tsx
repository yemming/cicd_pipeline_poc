import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("2428f2b6c13e41658c0364f70d947940");
  return (
    <StitchInline
      html={html}
      title="維修工單"
      sprint="S4-2"
      device="tablet"
      screenId="2428f2b6c13e41658c0364f70d947940"
      breadcrumb={[{ label: "維修管理", href: "/service/appointments" }, { label: "維修工單" }]}
    />
  );
}
