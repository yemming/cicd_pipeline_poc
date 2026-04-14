import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("a2d1439fc4b4454f805d7560bc22a0d7");
  return (
    <StitchInline
      html={html}
      title="試駕排程"
      sprint="S7-1"
      device="desktop"
      screenId="a2d1439fc4b4454f805d7560bc22a0d7"
      breadcrumb={[{ label: "銷售管理", href: "/sales/showroom" }, { label: "試駕排程" }]}
    />
  );
}
