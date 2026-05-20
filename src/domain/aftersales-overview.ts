"use server";

/**
 * Domain Helper — Aftersales Overview（/parts/aftersales 模組導覽）
 *
 * 規格：第十輪 BDN M03-1 — 重設為 ModuleHomeGallery 樣式 + 動態 KPI。
 *
 * 提供 server-side aggregate：
 *   - 今日預約數（appointment_date = today、status 不在已完成集合）
 *   - 進行中 RO 數（status ∈ 維修中 / 進行中）
 *   - 待結帳 數（status = 待結帳 + ro_checkouts.status = in_progress）
 *   - 未追蹤增項（followup_cases.status = tracking）
 *
 * 全 brand-scoped。錯誤一律 fallback 0 不阻塞 render；UI 顯示 "—" 由 caller 判定。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  AftersalesOverviewKpis,
  AftersalesFocusItem,
} from "./aftersales-overview.constants";

function todayIsoDate(): string {
  // Asia/Taipei timezone（per global instruction）
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 取得 4 顆 KPI 的當下計數值。
 *
 * 每顆都用 head + exact count；失敗時該顆 fallback 0、不擋整個 page。
 */
export async function getAftersalesOverviewStats(): Promise<AftersalesOverviewKpis> {
  const supabase = await createClient();
  const brand_id = (await getActiveScope()).brand_id;
  const today = todayIsoDate();

  // 平行查 4 顆 KPI，head+count 不抓 row 資料
  const [aptRes, roRes, checkoutRoRes, checkoutWizRes, followupRes] = await Promise.all([
    // 今日預約（排除已完成 / 取消）
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .eq("appointment_date", today)
      .not("status", "in", "(已完成,已取消,取消)"),
    // 進行中 RO
    supabase
      .from("repair_orders")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .in("status", ["維修中", "進行中"]),
    // 待結帳 RO（不含 ro_checkouts in_progress；最後取兩者聯集）
    supabase
      .from("repair_orders")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .eq("status", "待結帳"),
    // checkout wizard 進行中
    supabase
      .from("ro_checkouts")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .eq("status", "in_progress"),
    // 未追蹤增項閉環
    supabase
      .from("followup_cases")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .eq("status", "tracking"),
  ]);

  return {
    today_appointments: aptRes.count ?? 0,
    in_progress_ro: roRes.count ?? 0,
    awaiting_checkout: (checkoutRoRes.count ?? 0) + (checkoutWizRes.count ?? 0),
    pending_followups: followupRes.count ?? 0,
  };
}

/**
 * 「今日焦點」捷徑卡片 — 把 4 個 KPI 對映成可點擊的 quick-link 卡，
 * 跳轉到對應的清單頁讓 SA 直接開工。
 */
export async function getAftersalesFocusItems(): Promise<AftersalesFocusItem[]> {
  const kpis = await getAftersalesOverviewStats();
  return [
    {
      label: "今日預約",
      value: kpis.today_appointments,
      href: "/parts/aftersales/appointments",
      tone: "blue",
      icon: "calendar_today",
      hint: "今日待到廠 / 已到廠 / 維修中",
    },
    {
      label: "進行中工單",
      value: kpis.in_progress_ro,
      href: "/parts/aftersales/repair-orders",
      tone: "teal",
      icon: "construction",
      hint: "RO status = 維修中 / 進行中",
    },
    {
      label: "待結帳",
      value: kpis.awaiting_checkout,
      href: "/parts/aftersales/checkout",
      tone: "amber",
      icon: "payments",
      hint: "完工待收款 + 結帳 wizard in_progress",
    },
    {
      label: "未追蹤增項",
      value: kpis.pending_followups,
      href: "/parts/aftersales/followups",
      tone: "red",
      icon: "loop",
      hint: "增項閉環 tracking 中、D+3 / D+10 已到期需聯繫",
    },
  ];
}
