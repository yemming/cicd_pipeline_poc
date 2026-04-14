import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("1575f27a2ada4bb8bb7d2f21894790cb");
  return (
    <StitchInline
      html={html}
      title="預約看板"
      sprint="S4-1"
      device="desktop"
      screenId="1575f27a2ada4bb8bb7d2f21894790cb"
      breadcrumb={[{ label: "維修管理", href: "/service/appointments" }, { label: "預約看板" }]}
    />
  );
}
