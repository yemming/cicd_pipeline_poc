import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin, parseBody } from "@/lib/notifications/http";
import {
  createSubscription,
  listAllSubscriptions,
} from "@/lib/notifications/repositories/subscription.repo";

export async function GET(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const supabase = createServiceClient();
  const rows = await listAllSubscriptions(supabase);
  return NextResponse.json({ data: rows });
}

const createSchema = z.object({
  event_code: z.string().min(1),
  target_id: z.uuid(),
  template_code: z.string().optional().nullable(),
  filter_rules: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const body = await parseBody(req, createSchema);
  if (body instanceof NextResponse) return body;

  const supabase = createServiceClient();
  const row = await createSubscription(supabase, {
    event_code: body.event_code as never,
    target_id: body.target_id,
    template_code: body.template_code,
    filter_rules: body.filter_rules,
    is_active: body.is_active,
  });
  return NextResponse.json({ data: row }, { status: 201 });
}
