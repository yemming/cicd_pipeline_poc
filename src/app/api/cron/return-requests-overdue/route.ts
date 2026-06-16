/**
 * Cron — 退料閉環逾期掃描 + TL 借用測試工單未結案提醒
 *
 * 每 N 分鐘由 GitHub Actions curl（Bearer CRON_TOKEN）：
 *  1. parts_return_requests status='pending' 且 due_by < now → 標 overdue + 通知售後主管
 *  2. TL 工單（prefix_p1='TL', 開放狀態）距下班 1 小時內仍未結案 → 提醒售後主管
 *
 * 通知走站內通知（user_notifications，service client）推給 aftersales_lead 角色，
 * 顯示在通知鈴鐺與 /notifications。
 */
import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInappNotifications } from "@/domain/user-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LEAD_ROLES = ["aftersales_lead", "workshop_manager", "manager", "owner"];

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

// service client 泛型在 route 內以 any 寬鬆處理（cron 不需型別安全的 query builder）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function leadUserIdsByBrand(sb: any, brand: string): Promise<string[]> {
  const { data } = await sb
    .from("employees")
    .select("user_id")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .overlaps("role_codes", LEAD_ROLES)
    .not("user_id", "is", null);
  return [
    ...new Set(
      ((data ?? []) as Array<{ user_id: string | null }>)
        .map((e) => e.user_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_TOKEN) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED" } }, { status: 503 });
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dry_run === true;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const nowIso = new Date().toISOString();
  const result = { overdue_returns: 0, tl_closing_soon: 0, dry_run: dryRun };

  // ── 1. 退料待確認逾期 ──
  const { data: overdueRows } = await sb
    .from("parts_return_requests")
    .select("id, brand_id, part_name, qty_requested, source_ro_id")
    .eq("status", "pending")
    .lt("due_by", nowIso);
  const overdue = (overdueRows ?? []) as Array<{
    id: string;
    brand_id: string;
    part_name: string;
    qty_requested: number;
    source_ro_id: string | null;
  }>;

  if (overdue.length > 0 && !dryRun) {
    // 標 overdue
    await sb
      .from("parts_return_requests")
      .update({ status: "overdue", overdue_notified_at: nowIso })
      .in("id", overdue.map((r) => r.id));

    // 工單號補全
    const roIds = [...new Set(overdue.map((r) => r.source_ro_id).filter(Boolean))] as string[];
    const roMap = new Map<string, string>();
    if (roIds.length > 0) {
      const { data: ros } = await sb
        .from("repair_orders")
        .select("id, ro_code")
        .in("id", roIds);
      for (const ro of (ros ?? []) as Array<{ id: string; ro_code: string }>)
        roMap.set(ro.id, ro.ro_code);
    }

    // 依 brand 分組通知主管
    const byBrand = new Map<string, typeof overdue>();
    for (const r of overdue) {
      const arr = byBrand.get(r.brand_id) ?? [];
      arr.push(r);
      byBrand.set(r.brand_id, arr);
    }
    for (const [brand, rows] of byBrand) {
      const leads = await leadUserIdsByBrand(sb, brand);
      if (leads.length === 0) continue;
      const inputs = leads.flatMap((uid) =>
        rows.map((r) => ({
          recipient_user_id: uid,
          event_code: "return_request.overdue",
          title: "⚠️ 退料待確認已逾期",
          body: `退料待確認已逾期：${r.part_name} × ${r.qty_requested}${
            r.source_ro_id ? `（工單 ${roMap.get(r.source_ro_id) ?? r.source_ro_id}）` : ""
          }，請倉管儘速實物核對確認。`,
          priority: "red" as const,
          brand_id: brand,
          href: "/parts/receipt/return-in",
          source_ro_id: r.source_ro_id ?? undefined,
          source_ro_code: r.source_ro_id ? roMap.get(r.source_ro_id) : undefined,
        })),
      );
      await createInappNotifications(inputs);
    }
    result.overdue_returns = overdue.length;
  } else {
    result.overdue_returns = overdue.length;
  }

  // ── 2. TL 工單距下班 1 小時未結案 ──
  const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data: tlRows } = await sb
    .from("repair_orders")
    .select("id, brand_id, ro_code, metadata, status")
    .eq("prefix_p1", "TL")
    .in("status", ["進行中", "維修中", "待結帳"]);
  const tlPending = ((tlRows ?? []) as Array<{
    id: string;
    brand_id: string;
    ro_code: string;
    metadata: Record<string, unknown> | null;
  }>).filter((ro) => {
    const tl = (ro.metadata?.tl_config ?? {}) as Record<string, unknown>;
    const dueBy = typeof tl.due_by === "string" ? tl.due_by : null;
    // 已逾期或距下班 1 小時內 → 提醒
    return dueBy != null && dueBy < oneHourLater;
  });

  if (tlPending.length > 0 && !dryRun) {
    const byBrand = new Map<string, typeof tlPending>();
    for (const ro of tlPending) {
      const arr = byBrand.get(ro.brand_id) ?? [];
      arr.push(ro);
      byBrand.set(ro.brand_id, arr);
    }
    for (const [brand, rows] of byBrand) {
      const leads = await leadUserIdsByBrand(sb, brand);
      if (leads.length === 0) continue;
      const inputs = leads.flatMap((uid) =>
        rows.map((ro) => ({
          recipient_user_id: uid,
          event_code: "tl_ro.closing_soon",
          title: "⏰ 借用測試工單即將到期",
          body: `借用測試工單 ${ro.ro_code} 距下班 1 小時仍未結案，請督促 SA 完成結案（轉工單／退料／收費／吸收）。`,
          priority: "orange" as const,
          brand_id: brand,
          href: `/parts/aftersales/repair-orders/${ro.id}/tl-close`,
          source_ro_id: ro.id,
          source_ro_code: ro.ro_code,
        })),
      );
      await createInappNotifications(inputs);
    }
    result.tl_closing_soon = tlPending.length;
  } else {
    result.tl_closing_soon = tlPending.length;
  }

  return NextResponse.json({ ok: true, ...result });
}
