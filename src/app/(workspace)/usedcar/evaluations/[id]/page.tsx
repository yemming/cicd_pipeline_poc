import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 乾淨 detail URL：/usedcar/evaluations/{id}
 * 走既有 wizard（/usedcar/evaluations/wizard?id=xxx）— wizard 自己處理 prefill。
 * 之後 wizard 全面改 [id] 路由時把這層 redirect 拿掉。
 */
export default async function EvaluationDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/usedcar/evaluations/wizard?id=${encodeURIComponent(id)}`);
}
