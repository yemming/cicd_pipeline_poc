/**
 * Cron — 保固索賠應收款（warranty_claim_receivables）90 天逾期掃描
 *
 * Russell 7/21 補驗指令第五部分⑨：submitted_at 超過 90 天且 claim_status='submitted'
 * （原廠一直沒核復撥款）→ 每日通知採購人員儘速追蹤。
 *
 * 每日由 GitHub Actions curl（Bearer CRON_TOKEN）。
 *
 * 與既有 inventory-warranty-overdue（掃 warranty_claims 表、21 天 SLA）是兩張不同的表、
 * 兩件不同的事：那支管的是「保固維修工單本身多久沒結案」，這支管的是「索賠款項送出後
 * 原廠多久沒撥款」，Russell 這次指名要的是 warranty_claim_receivables + 90 天，不合併。
 *
 * 通知對象：employees.role_codes 含 parts_manager / parts_specialist（採購/零件專員）；
 * 若品牌內沒人掛這兩個角色且有登入帳號（demo 環境常見），退而通知 manager / owner，
 * 避免「找不到人就悄悄不通知」——跟既有「高價零件失蹤找不到店長就通知目前操作者」是同一個
 * 「寧可通知錯的人也不要沉默」原則，cron 沒有操作者可退，改退管理層。
 */
import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createInappNotifications } from "@/domain/user-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OVERDUE_DAYS = 90;
const PURCHASE_ROLES = ["parts_manager", "parts_specialist"];
const FALLBACK_ROLES = ["manager", "owner"];

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

// service client 泛型在 route 內以 any 寬鬆處理（cron 不需型別安全的 query builder）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recipientUserIdsByBrand(sb: any, brand: string): Promise<string[]> {
  const { data: primary } = await sb
    .from("employees")
    .select("user_id")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .overlaps("role_codes", PURCHASE_ROLES)
    .not("user_id", "is", null);
  const primaryIds = ((primary ?? []) as Array<{ user_id: string | null }>)
    .map((e) => e.user_id)
    .filter((v): v is string => Boolean(v));
  if (primaryIds.length > 0) return [...new Set(primaryIds)];

  // 找不到掛採購角色且有登入帳號的人 → 退而通知管理層，不要悄悄不通知
  const { data: fallback } = await sb
    .from("employees")
    .select("user_id")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .overlaps("role_codes", FALLBACK_ROLES)
    .not("user_id", "is", null);
  return [
    ...new Set(
      ((fallback ?? []) as Array<{ user_id: string | null }>)
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
  const cutoff = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await sb
    .from("warranty_claim_receivables")
    .select("id, brand_id, claim_amount, submitted_at, oem_reference_no, claim_id, workorder_id")
    .eq("claim_status", "submitted")
    .lt("submitted_at", cutoff);
  const overdue = (rows ?? []) as Array<{
    id: string;
    brand_id: string;
    claim_amount: number;
    submitted_at: string;
    oem_reference_no: string | null;
    claim_id: string | null;
    workorder_id: string | null;
  }>;

  const result = { overdue_claims: overdue.length, notified: 0, dry_run: dryRun };

  if (overdue.length > 0 && !dryRun) {
    const byBrand = new Map<string, typeof overdue>();
    for (const r of overdue) {
      const arr = byBrand.get(r.brand_id) ?? [];
      arr.push(r);
      byBrand.set(r.brand_id, arr);
    }
    let notified = 0;
    for (const [brand, claims] of byBrand) {
      const recipients = await recipientUserIdsByBrand(sb, brand);
      if (recipients.length === 0) continue;
      const inputs = recipients.flatMap((uid) =>
        claims.map((c) => {
          const days = Math.floor(
            (Date.now() - new Date(c.submitted_at).getTime()) / (24 * 60 * 60 * 1000),
          );
          return {
            recipient_user_id: uid,
            event_code: "warranty_claim_receivable.overdue_90d",
            title: "⚠️ 保固索賠逾 90 天原廠未撥款",
            body: `索賠款 NT$${Number(c.claim_amount).toLocaleString()}（${
              c.oem_reference_no ? `原廠案號 ${c.oem_reference_no}` : "無原廠案號"
            }）已送出 ${days} 天，原廠仍未撥款，請追蹤催辦。`,
            priority: "red" as const,
            brand_id: brand,
            href: "/parts/warranty",
          };
        }),
      );
      await createInappNotifications(inputs);
      notified += claims.length;
    }
    result.notified = notified;
  }

  return NextResponse.json({ ok: true, ...result });
}
