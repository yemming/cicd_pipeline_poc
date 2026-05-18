import { DemoBanner } from "@/components/demo-banner";
import { DevHtmlViewer } from "@/components/dev-html-viewer";

export default function PreflightRoV1Page() {
  return (
    <>
      <DemoBanner
        tone="info"
        message="⚙️ 這是設計參考 playground、Production 走 /parts/aftersales/pre-inspections"
        href="/parts/aftersales/pre-inspections"
        hrefLabel="前往 Production 預檢單"
      />
      <DevHtmlViewer
        file="preflight-ro-v1.html"
        title="04_預檢單+RO串接_v1"
        device="tablet"
        sourcePath="docs/04_預檢單+RO串接_v1.html"
      />
    </>
  );
}
