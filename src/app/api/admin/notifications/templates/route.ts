import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin } from "@/lib/notifications/http";
import { listCodeTemplates } from "@/lib/notifications/templates";
import { listTemplates } from "@/lib/notifications/repositories/template.repo";

// GET /api/admin/notifications/templates
// 回傳 code registry（版本隨 git 固定）+ DB override 覆蓋的模板清單

export async function GET(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const supabase = createServiceClient();
  const dbTemplates = await listTemplates(supabase);
  const codeTemplates = listCodeTemplates().map((t) => ({
    code: t.code,
    event_code: t.eventCode,
    channel_code: t.channelCode,
    format: t.format,
    description: t.description ?? null,
    source: "code" as const,
  }));

  const dbOverrides = dbTemplates.map((row) => ({
    code: row.code,
    event_code: row.event_code,
    channel_code: row.channel_code,
    format: row.format,
    description: row.description,
    source: "db" as const,
    is_active: row.is_active,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({
    data: {
      code: codeTemplates,
      db: dbOverrides,
    },
  });
}
