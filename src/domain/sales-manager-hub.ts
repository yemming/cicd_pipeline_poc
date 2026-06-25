/**
 * /sales/manager hub — 主管工作台入口頁 helper（server-only）。
 *
 * 拉所有子模組關鍵指標 snapshot：
 *   - funnel       → sales_funnel_metrics(brand, period='month', rs_name='__all__') 當月 / 上月
 *   - sales-report → 同 funnel 的 orders + kpi_targets(metric_code='sales_orders_target')
 *   - kpi-targets  → kpi_targets distinct(metric_code) count
 *   - staff        → employees join departments(code='SAL') is_active=true
 *   - staff-grid   → 同 staff 範圍 + metadata.sales.grid_position 已存幾筆
 *   - card-config  → sales_dictionary count + business_rules count
 *
 * 任一 query 失敗都 catch、降到 fallback「—」、不擋 page render；ok=false 時 UI 可顯示
 * 「部分指標載入失敗」的提示 banner，但卡片仍可點進去。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  MANAGER_HUB_CARDS,
  MANAGER_HUB_FALLBACK_SNAPSHOTS,
  type ManagerHubCardKey,
  type ManagerHubCardSnapshot,
  type ManagerHubData,
} from "./sales-manager-hub.constants";

export { MANAGER_HUB_CARDS };
export type { ManagerHubData, ManagerHubCardKey };

function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthKey(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((s) => Number(s));
  if (!y || !m) return periodKey;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function fmtInt(n: number): string {
  return n.toLocaleString("zh-TW");
}

function fmtPct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

export async function getManagerHubData(): Promise<ManagerHubData> {
  const scope = await getActiveScope();
  const brandId = scope.brand_id;
  const supabase = await createClient();

  const periodKey = currentMonthKey();
  const prevKey = prevMonthKey(periodKey);

  const snapshots: Record<ManagerHubCardKey, ManagerHubCardSnapshot> = {
    ...MANAGER_HUB_FALLBACK_SNAPSHOTS,
  };

  let firstError: string | null = null;
  function trackErr(label: string, err: unknown) {
    if (firstError) return;
    const msg = err instanceof Error ? err.message : String(err);
    firstError = `${label}: ${msg}`;
  }

  // ── funnel ────────────────────────────────────────────────────────
  // sales_funnel_metrics 的 rs_name='__all__' 是「全 RS 加總」彙整列（見 RS_M1 seed）
  try {
    const { data, error } = await supabase
      .from("sales_funnel_metrics")
      .select("period_key, contacts, orders")
      .eq("brand_id", brandId)
      .eq("period_type", "month")
      .eq("rs_name", "__all__")
      .in("period_key", [periodKey, prevKey]);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      period_key: string;
      contacts: number;
      orders: number;
    }>;
    const curr = rows.find((r) => r.period_key === periodKey);
    const prev = rows.find((r) => r.period_key === prevKey);
    const contacts = curr?.contacts ?? 0;
    const orders = curr?.orders ?? 0;
    const prevContacts = prev?.contacts ?? 0;
    snapshots.funnel = {
      value: contacts > 0 ? fmtInt(contacts) : "0",
      subValue: contacts > 0 ? `成交 ${orders}・轉換 ${fmtPct(orders, contacts)}` : "尚無資料",
      delta:
        prevContacts > 0
          ? { value: pctDelta(contacts, prevContacts) }
          : undefined,
    };
    snapshots["sales-report"] = {
      value: orders > 0 ? fmtInt(orders) : "0",
      // 副指標：目標達成率改下面 kpi_targets 那段補
      subValue: orders > 0 ? `本月接觸 ${contacts}` : "尚無資料",
    };
  } catch (err) {
    trackErr("funnel", err);
  }

  // ── sales-report 達成率：kpi_targets metric_code='sales_orders' / 'orders' ──
  try {
    const { data, error } = await supabase
      .from("kpi_targets")
      .select("metric_code, target_value")
      .eq("brand_id", brandId)
      .eq("period_type", "month")
      .eq("period_key", periodKey)
      .in("metric_code", ["sales_orders", "orders"]);
    if (error) throw error;
    const target = Number((data ?? [])[0]?.target_value ?? 0);
    const reportSnap = snapshots["sales-report"];
    // 從 funnel snap 反推 orders（已 format）— 若 funnel 沒跑、直接跳過
    if (target > 0 && reportSnap.value !== "—") {
      const orders = Number(reportSnap.value.replace(/[,—]/g, "")) || 0;
      reportSnap.subValue = `目標 ${fmtInt(target)} / 達成 ${fmtPct(orders, target)}`;
    }
  } catch (err) {
    trackErr("kpi_targets/report", err);
  }

  // ── kpi-targets 設定數 ────────────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from("kpi_targets")
      .select("metric_code, period_type")
      .eq("brand_id", brandId);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ metric_code: string; period_type: string }>;
    const distinctMetrics = new Set(rows.map((r) => r.metric_code)).size;
    snapshots["kpi-targets"] = {
      value: rows.length > 0 ? fmtInt(rows.length) : "0",
      subValue: distinctMetrics > 0 ? `${distinctMetrics} 個 metric` : "尚未設定",
    };
  } catch (err) {
    trackErr("kpi_targets/count", err);
  }

  // ── staff（業務人員）─────────────────────────────────────────────
  // employees ⨯ departments(SAL)；is_active=true
  let salesEmployeeIds: string[] = [];
  try {
    const { data: deptRows, error: deptErr } = await supabase
      .from("departments")
      .select("id, code, name")
      .eq("brand_id", brandId)
      .or("code.eq.SAL,name.ilike.%業務%,name.ilike.%銷售%");
    if (deptErr) throw deptErr;
    const deptIds = (deptRows ?? []).map((d) => d.id as string);
    if (deptIds.length === 0) {
      snapshots.staff = { value: "0", subValue: "尚未設定業務部" };
      snapshots["staff-grid"] = { value: "0", subValue: "尚未設定業務部" };
    } else {
      const { data: empRows, error: empErr } = await supabase
        .from("employees")
        .select("id, name, is_active, metadata")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .in("dept_id", deptIds);
      if (empErr) throw empErr;
      const emps = (empRows ?? []) as Array<{
        id: string;
        name: string;
        is_active: boolean;
        metadata: Record<string, unknown> | null;
      }>;
      salesEmployeeIds = emps.map((e) => e.id);
      const total = emps.length;

      // staff snapshot
      snapshots.staff = {
        value: total > 0 ? fmtInt(total) : "0",
        subValue: total > 0 ? `在職業務${total > 0 ? "" : "（無）"}` : "尚無業務",
      };

      // staff-grid：metadata.sales.grid_position 已存幾筆 = 手動定位
      const gridManual = emps.filter((e) => {
        const meta = (e.metadata ?? {}) as {
          sales?: { grid_position?: { manual_override?: boolean } };
        };
        return Boolean(meta.sales?.grid_position?.manual_override);
      }).length;
      snapshots["staff-grid"] = {
        value: total > 0 ? fmtInt(total) : "0",
        subValue:
          total > 0
            ? `已手動定位 ${fmtInt(gridManual)} 人`
            : "尚無業務",
      };
    }
  } catch (err) {
    trackErr("staff", err);
  }

  // ── staff「本月有接觸」補一個 sub（如果有業務） ────────────────────
  if (salesEmployeeIds.length > 0 && !firstError) {
    try {
      const periodFirstDay = `${periodKey}-01`;
      const { data: leadRows, error: leadErr } = await supabase
        .from("sales_dormant_leads")
        .select("rs_name, created_at")
        .eq("brand_id", brandId)
        .gte("created_at", periodFirstDay);
      if (leadErr) throw leadErr;
      const activeNames = new Set(
        (leadRows ?? [])
          .map((r) => (r as { rs_name: string | null }).rs_name)
          .filter((s): s is string => Boolean(s)),
      );
      const total = salesEmployeeIds.length;
      // staff 本月活躍 = 業務名稱（emp.name）出現在 sales_leads.rs_name 集合中的人數
      // 由於 sales_leads.rs_name 是字串、不是 FK，這裡用「集合大小」當代表性指標
      const activeCount = activeNames.size;
      snapshots.staff = {
        value: fmtInt(total),
        subValue:
          activeCount > 0
            ? `本月有接觸 ${fmtInt(activeCount)} 個來源`
            : "本月尚無接觸",
      };
    } catch (err) {
      trackErr("sales_leads", err);
    }
  }

  // ── card-config（手卡參數）────────────────────────────────────────
  try {
    const [dictRes, ruleRes] = await Promise.all([
      supabase
        .from("sales_dictionary")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .eq("is_active", true),
      supabase
        .from("business_rules")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId),
    ]);
    if (dictRes.error) throw dictRes.error;
    if (ruleRes.error) throw ruleRes.error;
    const dictCount = dictRes.count ?? 0;
    const ruleCount = ruleRes.count ?? 0;
    snapshots["card-config"] = {
      value: dictCount > 0 ? fmtInt(dictCount) : "0",
      subValue: ruleCount > 0 ? `${fmtInt(ruleCount)} 條業務規則` : "尚無規則",
    };
  } catch (err) {
    trackErr("card-config", err);
  }

  // 全 0 判斷（六張卡片 value 都是 "—" 或 "0"）
  const empty = MANAGER_HUB_CARDS.every((c) => {
    const v = snapshots[c.key].value;
    return v === "—" || v === "0";
  });

  return {
    snapshots,
    ok: firstError === null,
    empty,
    error: firstError,
    brand_id: brandId,
  };
}
