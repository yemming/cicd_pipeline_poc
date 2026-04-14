import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("9e696ef7243d48148cc3290aa55d0d16");
  return (
    <StitchInline
      html={html}
      title="集團庫存總覽"
      sprint="S6-7"
      device="desktop"
      screenId="9e696ef7243d48148cc3290aa55d0d16"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "集團庫存總覽" }]}
    />
  );
}
