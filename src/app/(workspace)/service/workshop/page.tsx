import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("ef95845f1f78486f83905a9cd1ec1ccf");
  return (
    <StitchInline
      html={html}
      title="技師派工"
      sprint="S4-4"
      device="desktop"
      screenId="ef95845f1f78486f83905a9cd1ec1ccf"
      breadcrumb={[{ label: "維修管理", href: "/service/appointments" }, { label: "技師派工" }]}
    />
  );
}
