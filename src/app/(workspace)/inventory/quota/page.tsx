import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("763556ef5dd64192936e49a6c305e3ce");
  return (
    <StitchInline
      html={html}
      title="配額批售"
      sprint="S10-2"
      device="desktop"
      screenId="763556ef5dd64192936e49a6c305e3ce"
      breadcrumb={[{ label: "整車庫存", href: "/inventory/vehicles" }, { label: "配額批售" }]}
    />
  );
}
