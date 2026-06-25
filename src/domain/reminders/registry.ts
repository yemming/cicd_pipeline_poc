/**
 * Reminder Query Registry — 每個 reminder code → 對應一個 server query function。
 *
 * 設計重點：
 *   - 對應的 source table 可能不存在（POC repo 有很多 list page 還是 stitch HTML / constants
 *     mock data、沒落 DB）。每個 query 都包 try-catch，撈不到就回 `{ count: 0 }` + 一次
 *     console.warn，不爆 dashboard。
 *   - 統一透過 `runReminderQuery(code, ctx)` wrapper 呼叫，看不到的 code 也 fallback 0。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ReminderQueryContext = {
  brandId: string;
  userId: string;
};

export type ReminderQueryResult = {
  count: number;
  error?: string;
};

export type ReminderQueryFn = (ctx: ReminderQueryContext) => Promise<ReminderQueryResult>;

// 全 process 只 warn 過一次的 code 集合，避免每秒打爆 console
const warnedCodes = new Set<string>();
function warnOnce(code: string, message: string) {
  if (warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[reminders.registry] ${code}: ${message}`);
}

/**
 * 包 supabase count query 的 helper：count 有錯就回 0 + warn。
 */
async function safeCount(
  code: string,
  fn: () => Promise<{ count: number | null; error: { message: string } | null }>
): Promise<ReminderQueryResult> {
  try {
    const { count, error } = await fn();
    if (error) {
      // PostgREST 對於不存在的 table 會回 42P01；對於不存在的欄位回 42703。
      warnOnce(code, `supabase error: ${error.message}`);
      return { count: 0, error: error.message };
    }
    return { count: count ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnOnce(code, `exception: ${msg}`);
    return { count: 0, error: msg };
  }
}

export const reminderQueryRegistry: Record<string, ReminderQueryFn> = {
  /* ── 已知有對應 DB 表的：撈真實 count ─────────────────────────── */

  // einvoices.ecpay_status 為 'pending' / null = 未開發票
  pending_invoices: async ({ brandId }) =>
    safeCount("pending_invoices", async () => {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("einvoices")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .or("ecpay_status.is.null,ecpay_status.eq.pending");
      return { count, error };
    }),

  // purchase_orders.status in (approved, in_transit) AND receipt_progress_pct < 100
  unreceived_inbound: async ({ brandId }) =>
    safeCount("unreceived_inbound", async () => {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .in("status", ["approved", "in_transit", "partial"])
        .lt("receipt_progress_pct", 100);
      return { count, error };
    }),

  // 「待報價」proxy：sales_dormant_leads 沒有 status 欄位，用「啟用中 + 有意向(H/A/B) +
  // 尚未轉成客戶 + 未流失 + dormancy_status='active'」當待報價語意。
  // 未來若 sales_dormant_leads 加 status='quote_pending' 欄位再收斂條件。
  quote_pending_leads: async ({ brandId }) =>
    safeCount("quote_pending_leads", async () => {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("sales_dormant_leads")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("is_active", true)
        // 已是 sales 專表，不再需要 .eq("kind", "sales")
        .eq("dormancy_status", "active")
        .in("habc", ["H", "A", "B"])
        .is("converted_customer_id", null)
        .is("lost_at", null);
      return { count, error };
    }),

  // call_tasks call_type='d3_satisfaction' AND status 非完成
  // 放寬：'pending' / 'in_progress' / 'scheduled' / 'overdue' 都算 D+3 待回訪
  d3_followup: async ({ brandId }) =>
    safeCount("d3_followup", async () => {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("call_tasks")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("call_type", "d3_satisfaction")
        .in("status", ["pending", "in_progress", "scheduled", "overdue"]);
      return { count, error };
    }),

  // overdue_aftersales：customers 表沒有 last_visit_at 欄位，先以 call_tasks
  // kind='aftersales' status='pending' 估算（粗略 proxy，未來補 last_visit_at 欄位再改）
  overdue_aftersales: async ({ brandId }) =>
    safeCount("overdue_aftersales", async () => {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("call_tasks")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("kind", "aftersales")
        .in("status", ["pending", "in_progress"]);
      return { count, error };
    }),

  // nps_responses 本月、score 0-6 = detractor
  nps_detractors: async ({ brandId }) =>
    safeCount("nps_detractors", async () => {
      const supabase = await createClient();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("nps_responses")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .lte("score", 6)
        .gte("created_at", monthStart.toISOString());
      return { count, error };
    }),

  /* ── 對應 DB 表還沒落地的：fallback 0 + warn ───────────────────── */
  //   POC 階段這些 list page 還是 stitch inline / mock，DB 表還沒造。
  //   一旦對應的表落地、回頭改這支即可。

  unsigned_orders: async () => ({ count: 0, error: "sales_orders 表尚未落地" }),

  pending_delivery: async () => ({ count: 0, error: "deliveries 表尚未落地" }),

  used_car_inventory: async () => ({ count: 0, error: "sales_usedcar_inventory 表尚未落地" }),

  new_car_inventory: async () => ({ count: 0, error: "sales_newcar_inventory 表尚未落地" }),

  today_reception: async () => ({ count: 0, error: "sales_handcards 表尚未落地" }),

  active_orders: async () => ({ count: 0, error: "sales_orders 表尚未落地" }),
};

/**
 * Wrapper：包 unknown code + 防爆機制。
 *
 * UI 拿到結果不管 error 都會渲染，count=0 + tooltip 顯示 warning 即可。
 */
export async function runReminderQuery(
  code: string,
  ctx: ReminderQueryContext,
): Promise<ReminderQueryResult> {
  const fn = reminderQueryRegistry[code];
  if (!fn) {
    warnOnce(code, "no query function registered");
    return { count: 0, error: `unknown reminder code: ${code}` };
  }
  return fn(ctx);
}
