import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 新增評估：跳到 wizard 建立模式（無 ?id=）。
 */
export default function NewEvaluationRedirect() {
  redirect("/usedcar/evaluations/wizard");
}
