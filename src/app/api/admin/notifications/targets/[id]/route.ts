import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin, jsonError, parseBody } from "@/lib/notifications/http";
import {
  deleteTarget,
  updateTarget,
} from "@/lib/notifications/repositories/target.repo";

const patchSchema = z
  .object({
    target_type: z.enum(["user", "group", "webhook"]).optional(),
    target_ref: z.string().min(1).optional(),
    display_name: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
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
  const row = await updateTarget(supabase, id, body);
  return NextResponse.json({ data: row });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("INVALID_ID", "id 必須是 UUID", 400);

  const supabase = createServiceClient();
  await deleteTarget(supabase, id);
  return NextResponse.json({ ok: true });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
