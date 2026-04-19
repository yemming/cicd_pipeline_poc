import { NextResponse, type NextRequest } from "next/server";
import { notifications } from "@/lib/notifications";
import { ensureAdmin, jsonError } from "@/lib/notifications/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("INVALID_ID", "id 必須是 UUID", 400);

  try {
    const result = await notifications.retryDelivery(id);
    return NextResponse.json({ deliveryId: id, ok: result.ok, error: result.error });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonError("RETRY_FAILED", msg, 500);
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
