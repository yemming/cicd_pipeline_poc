import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";

export default async function Page() {
  const html = await loadStitchBody("cc722dbd9b5c4af29b5fe7e516db70fd");
  return (
    <StitchInline
      html={html}
      title="拍賣管理"
      sprint="S5-3"
      device="desktop"
      screenId="cc722dbd9b5c4af29b5fe7e516db70fd"
      breadcrumb={[{ label: "中古機車", href: "/usedcar/evaluation" }, { label: "拍賣管理" }]}
    />
  );
}
