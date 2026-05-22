import { AiCurveApp } from "./_components/ai-curve-app";
import { listRecentAiCurveNotes } from "@/domain/ai-curve-notes";

export const dynamic = "force-dynamic";

export default async function AiCurvePage() {
  const recent = await listRecentAiCurveNotes(5);
  return <AiCurveApp recent={recent} />;
}
