import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin, parseBody } from "@/lib/notifications/http";
import {
  createTarget,
  listTargets,
} from "@/lib/notifications/repositories/target.repo";
import type { ChannelCode } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const channelCode = (url.searchParams.get("channel") as ChannelCode | null) ?? undefined;

  const supabase = createServiceClient();
  const rows = await listTargets(supabase, { channelCode, onlyActive: false });

  // Google Chat webhook URL 在列表中遮罩，只保留前 60 字元
  const masked = rows.map((row) => {
    if (row.channel_code === "google-chat" && row.target_type === "webhook") {
      const ref = row.target_ref;
      return {
        ...row,
        target_ref_masked: true,
        target_ref: ref.length > 60 ? `${ref.slice(0, 60)}...` : ref,
      };
    }
    return row;
  });

  return NextResponse.json({ data: masked });
}

const createSchema = z.object({
  channel_id: z.uuid(),
  target_type: z.enum(["user", "group", "webhook"]),
  target_ref: z.string().min(1),
  display_name: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const body = await parseBody(req, createSchema);
  if (body instanceof NextResponse) return body;

  const supabase = createServiceClient();
  const row = await createTarget(supabase, body);
  return NextResponse.json({ data: row }, { status: 201 });
}
