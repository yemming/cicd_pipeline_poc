import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("e2ae74e9b031441295eceba43825c30c");
  return (
    <StitchInline
      html={html}
      title="再購/轉介紹"
      sprint="S8-2"
      device="desktop"
      screenId="e2ae74e9b031441295eceba43825c30c"
      breadcrumb={[{ label: "客戶關懷", href: "/csi/surveys" }, { label: "再購/轉介紹" }]}
    />
  );
}
