import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAdmin } from "@/lib/notifications/http";
import {
  countDeliveriesByStatus,
  listDeliveries,
} from "@/lib/notifications/repositories/delivery.repo";
import type {
  ChannelCode,
  DeliveryStatus,
  EventCode,
} from "@/lib/notifications";

// GET /api/admin/notifications/deliveries?event=...&channel=...&status=...&from=...&to=...&limit=50&offset=0&stats=1

const VALID_STATUSES: DeliveryStatus[] = ["pending", "sent", "failed", "retrying"];

export async function GET(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const eventCode = (url.searchParams.get("event") as EventCode | null) ?? undefined;
  const channelCode =
    (url.searchParams.get("channel") as ChannelCode | null) ?? undefined;
  const rawStatus = url.searchParams.get("status");
  const status =
    rawStatus && VALID_STATUSES.includes(rawStatus as DeliveryStatus)
      ? (rawStatus as DeliveryStatus)
      : undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const targetRef = url.searchParams.get("target_ref") ?? undefined;
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const wantStats = url.searchParams.get("stats") === "1";

  const supabase = createServiceClient();
  const rows = await listDeliveries(supabase, {
    eventCode,
    channelCode,
    status,
    targetRef,
    from,
    to,
    limit,
    offset,
  });

  const body: Record<string, unknown> = { data: rows, limit, offset };

  if (wantStats) {
    // 過去 7 天統計（Dashboard 用）
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    body.stats = {
      last7DaysByStatus: await countDeliveriesByStatus(supabase, since),
    };
  }

  return NextResponse.json(body);
}
