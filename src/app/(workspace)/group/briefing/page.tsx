import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("76f48bf6c9484de1a2082f702761fa40");
  return (
    <StitchInline
      html={html}
      title="集團運營簡報"
      sprint="S6-3"
      device="desktop"
      screenId="76f48bf6c9484de1a2082f702761fa40"
      breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "集團運營簡報" }]}
    />
  );
}
