import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("3b1ee33fd56f4e5db193ada91c6e700c");
  return (
    <StitchInline
      html={html}
      title="退款審批"
      sprint="S1-9"
      device="desktop"
      screenId="3b1ee33fd56f4e5db193ada91c6e700c"
      breadcrumb={[{ label: "經銷商管理", href: "/admin/org" }, { label: "退款審批" }]}
    />
  );
}
