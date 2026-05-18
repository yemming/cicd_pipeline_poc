import { DemoBanner } from "@/components/demo-banner";
import { DevHtmlViewer } from "@/components/dev-html-viewer";

export default function PreflightSaV2Page() {
  return (
    <>
      <DemoBanner
        tone="info"
        message="⚙️ 這是設計參考 playground、Production 走 /parts/aftersales/pre-inspections"
        href="/parts/aftersales/pre-inspections"
        hrefLabel="前往 Production 預檢單"
      />
      <DevHtmlViewer
        file="preflight-sa-v2.html"
        title="04_預檢單_SA環檢_v2"
        device="tablet"
        sourcePath="docs/04_預檢單_SA環檢_v2.html"
      />
    </>
  );
}
