import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin, parseBody, jsonError } from "@/lib/notifications/http";
import {
  deleteSubscription,
  updateSubscription,
} from "@/lib/notifications/repositories/subscription.repo";

const patchSchema = z
  .object({
    event_code: z.string().optional(),
    target_id: z.uuid().optional(),
    template_code: z.string().nullable().optional(),
    filter_rules: z.record(z.string(), z.unknown()).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "patch body 不可為空" });

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("INVALID_ID", "id 必須是 UUID", 400);

  const body = await parseBody(req, patchSchema);
  if (body instanceof NextResponse) return body;

  const supabase = createServiceClient();
  const row = await updateSubscription(supabase, id, {
    event_code: body.event_code as never,
    target_id: body.target_id,
    template_code: body.template_code,
    filter_rules: body.filter_rules,
    is_active: body.is_active,
  });
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("INVALID_ID", "id 必須是 UUID", 400);

  const supabase = createServiceClient();
  await deleteSubscription(supabase, id);
  return NextResponse.json({ ok: true });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
