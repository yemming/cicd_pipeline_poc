/**
 * RS_M2 業績報表（銷售管理 / 主管視角）helper — server-only。
 *
 * 對應 nav_node `6c385e0a-a0b2-46de-a25c-b9dc396c3170`（Indian / 銷售管理 / 業績報表）。
 *
 * Round-9 Batch B（2026-05-18）：
 * - 接 supabase: 從 `sales_metrics_monthly` (mview) 取月度業績 + `sales_funnel_metrics` 取過程指標
 *   + `kpi_targets` 取目標值 + `vehicle_models` 取車型 display_name/series
 * - 達成率 / 上月 delta 用 helper 端算（避免 client 二次計算）
 * - 保留 _FALLBACK 路徑：query 失敗或回零筆時整包回 constants，避免空畫面
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  LAYER1_KPIS_FALLBACK,
  LAYER2_KPIS_FALLBACK,
  LAYER3_KPIS_FALLBACK,
  BEP_DATA_FALLBACK,
  MONTHLY_TREND_FALLBACK,
  MONTHLY_CHART_TARGET_FALLBACK,
  RS_RANKING_FALLBACK,
  MODEL_SALES_FALLBACK,
  WEEKLY_TREND_FALLBACK,
  LAST_UPDATED_FALLBACK,
  type KpiCard,
  type MonthlyDatum,
  type RsRow,
  type ModelRow,
  type Period,
} from "./sales-manager-report.constants";

export interface SalesManagerReportOptions {
  /** 期間粒度，預設 month */
  period?: Period;
  /** 期間 key，預設依當下時間算 */
  periodKey?: string;
}

function currentPeriodKey(period: Period, d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (period === "year") return String(y);
  if (period === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function prevMonthKey(periodKey: string): string {
  // periodKey = 'YYYY-MM'，回傳前一個月
  const [yStr, mStr] = periodKey.split("-");
  let y = Number(yStr);
  let m = Number(mStr) - 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function toneFromRatio(pct: number): { tone: KpiCard["tone"]; color: KpiCard["color"]; bar: NonNullable<KpiCard["progressBar"]> } {
  if (pct >= 95) return { tone: "good",  color: "teal",  bar: "teal" };
  if (pct >= 75) return { tone: "warn",  color: "amber", bar: "amber" };
  return            { tone: "alert", color: "red",   bar: "red" };
}

function deltaText(curr: number, prev: number, unit: string): { text: string; kind: KpiCard["deltaKind"] } {
  if (prev === 0 && curr === 0) return { text: "≈ 上月", kind: "flat" };
  const diff = curr - prev;
  if (diff === 0) return { text: "≈ 上月", kind: "flat" };
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff.toFixed(unit === "%" ? 1 : 0)}${unit} vs 上月`, kind: diff > 0 ? "up" : "down" };
}

type MetricRow = {
  rs_name: string;
  vehicle_model_id: string | null;
  orders_count: number;
  orders_amount: number;
  deliveries_count: number;
  deliveries_amount: number;
};

type FunnelRow = {
  rs_name: string;
  contacts: number;
  builds: number;
  trials: number;
  quotes: number;
  orders: number;
  deliveries: number;
};

type ModelDictRow = {
  id: string;
  display_name: string;
  series: string;
};

export async function getSalesManagerReportData(options: SalesManagerReportOptions = {}) {
  const period: Period = options.period ?? "month";
  const periodKey = options.periodKey ?? currentPeriodKey(period);

  let layer1 = LAYER1_KPIS_FALLBACK;
  let layer2 = LAYER2_KPIS_FALLBACK;
  let layer3 = LAYER3_KPIS_FALLBACK;
  let bep = BEP_DATA_FALLBACK;
  let monthlyTrend = MONTHLY_TREND_FALLBACK;
  let monthlyChartTarget = MONTHLY_CHART_TARGET_FALLBACK;
  let rsRanking = RS_RANKING_FALLBACK;
  let modelSales = MODEL_SALES_FALLBACK;
  const weeklyTrend = WEEKLY_TREND_FALLBACK; // 週趨勢需要 day-level 切片，現階段不接
  let lastUpdated = LAST_UPDATED_FALLBACK;
  let usingFallback = false;

  try {
    const supabase = await createClient();
    const { brand_id } = await getActiveScope();
    const prevKey = period === "month" ? prevMonthKey(periodKey) : periodKey;

    // 撈 mview 當期 + 上期、funnel 當期、targets 當期、model dict、近 5 個月趨勢
    const [currRes, prevRes, funnelRes, targetRes, modelRes, trendRes] = await Promise.all([
      supabase
        .from("sales_metrics_monthly")
        .select("rs_name, vehicle_model_id, orders_count, orders_amount, deliveries_count, deliveries_amount")
        .eq("brand_id", brand_id)
        .eq("period_key", periodKey),
      supabase
        .from("sales_metrics_monthly")
        .select("rs_name, vehicle_model_id, orders_count, orders_amount, deliveries_count, deliveries_amount")
        .eq("brand_id", brand_id)
        .eq("period_key", prevKey),
      supabase
        .from("sales_funnel_metrics")
        .select("rs_name, contacts, builds, trials, quotes, orders, deliveries")
        .eq("brand_id", brand_id)
        .eq("period_type", period)
        .eq("period_key", periodKey),
      supabase
        .from("kpi_targets")
        .select("metric_code, target_value")
        .eq("brand_id", brand_id)
        .eq("subject_type", "global")
        .is("subject_id", null)
        .eq("period_type", period)
        .eq("period_key", periodKey),
      supabase
        .from("vehicle_models")
        .select("id, display_name, series")
        .eq("brand_id", brand_id),
      // 月度趨勢：近 5 個月（包含當月）
      supabase
        .from("sales_metrics_monthly")
        .select("period_key, deliveries_count")
        .eq("brand_id", brand_id)
        .eq("rs_name", "__all__")
        .is("vehicle_model_id", null)
        .order("period_key", { ascending: false })
        .limit(5),
    ]);

    if (currRes.error) throw currRes.error;
    if (funnelRes.error) throw funnelRes.error;
    if (targetRes.error) throw targetRes.error;

    const currRows = (currRes.data ?? []) as MetricRow[];
    const prevRows = (prevRes.data ?? []) as MetricRow[];
    const funnelRows = (funnelRes.data ?? []) as FunnelRow[];
    const targetMap = new Map<string, number>();
    for (const t of (targetRes.data ?? []) as { metric_code: string; target_value: number | string }[]) {
      targetMap.set(t.metric_code, Number(t.target_value));
    }
    const modelDict = new Map<string, ModelDictRow>();
    for (const m of (modelRes.data ?? []) as ModelDictRow[]) modelDict.set(m.id, m);

    // 全店匯總 (rs_name='__all__', vehicle_model_id=null)
    const currTotal = currRows.find((r) => r.rs_name === "__all__" && r.vehicle_model_id === null);
    const prevTotal = prevRows.find((r) => r.rs_name === "__all__" && r.vehicle_model_id === null);
    const funnelTotal = funnelRows.find((r) => r.rs_name === "__all__");

    if (currTotal || funnelTotal) {
      // ── Layer 1：結果指標 ──
      const deliveries = currTotal?.deliveries_count ?? 0;
      const ordersAbs = currTotal?.orders_count ?? 0;
      const revenue10k = Math.round((Number(currTotal?.orders_amount ?? 0)) / 10000); // 元 → 萬
      const closeRate = funnelTotal && funnelTotal.contacts > 0
        ? Number(((deliveries / funnelTotal.contacts) * 100).toFixed(1))
        : 0;

      const prevDeliveries = prevTotal?.deliveries_count ?? 0;
      const prevOrdersAbs = prevTotal?.orders_count ?? 0;
      const prevRevenue10k = Math.round((Number(prevTotal?.orders_amount ?? 0)) / 10000);

      const targetDeliveries = targetMap.get("deliveries") ?? 15;
      const targetOrdersAbs = targetMap.get("orders_abs") ?? 16;
      const targetCloseRate = targetMap.get("close_rate") ?? 12;
      const targetRevenue = targetMap.get("revenue") ?? 1920;

      const buildKpi = (
        label: string,
        value: number,
        unit: string,
        target: number,
        prev: number,
      ): KpiCard => {
        const pct = target > 0 ? Math.round((value / target) * 100) : 0;
        const t = toneFromRatio(pct);
        const dlt = deltaText(value, prev, unit);
        return {
          label, value, unit, target,
          deltaText: dlt.text,
          deltaKind: dlt.kind,
          tone: t.tone, color: t.color,
          progressPct: Math.min(100, pct), progressBar: t.bar,
        };
      };

      layer1 = [
        buildKpi("月度成交台數", deliveries, "台", targetDeliveries, prevDeliveries),
        buildKpi("月度訂車台數", ordersAbs, "台", targetOrdersAbs, prevOrdersAbs),
        buildKpi("整體成交率", closeRate, "%", targetCloseRate, 0),
        buildKpi("本月總業績", revenue10k, "萬", targetRevenue, prevRevenue10k),
      ];

      // ── Layer 2：過程指標 ──
      if (funnelTotal) {
        const buildRate = funnelTotal.contacts > 0 ? Math.round((funnelTotal.builds / funnelTotal.contacts) * 100) : 0;
        const trialRate = funnelTotal.builds > 0 ? Math.round((funnelTotal.trials / funnelTotal.builds) * 100) : 0;
        const quoteRate = funnelTotal.trials > 0 ? Math.round((funnelTotal.quotes / funnelTotal.trials) * 100) : 0;
        const orderRate = funnelTotal.quotes > 0 ? Math.round((funnelTotal.orders / funnelTotal.quotes) * 100) : 0;

        const tBuild = targetMap.get("build") ?? 90;
        const tTrial = targetMap.get("trial") ?? 60;
        const tQuote = targetMap.get("quote") ?? 70;
        const tOrder = targetMap.get("order") ?? 60;
        const tGolden = targetMap.get("golden") ?? 80;

        const buildPct = (val: number, target: number, label: string, unit: string): KpiCard => {
          const ratio = target > 0 ? Math.round((val / target) * 100) : 0;
          const t = toneFromRatio(ratio);
          return {
            label, value: val, unit, target,
            deltaText: ratio >= 95 ? "≈ 目標" : `落後 ${target - val}${unit}`,
            deltaKind: ratio >= 95 ? "flat" : "down",
            tone: t.tone, color: t.color,
            progressPct: Math.min(100, ratio), progressBar: t.bar,
          };
        };

        layer2 = [
          buildPct(buildRate, tBuild, "建檔完整率", "%"),
          buildPct(trialRate, tTrial, "試乘試駕率", "%"),
          buildPct(quoteRate, tQuote, "報價轉化率", "%"),
          buildPct(orderRate, tOrder, "訂車成交率", "%"),
          // 黃金時段（試駕後即時報價率）— mview/funnel 無此欄位，先掛 fallback
          buildPct(LAYER2_KPIS_FALLBACK[4].value, tGolden, "試駕後即時報價率", "%"),
        ];

        // ── Layer 3：行為數據 ──
        layer3 = [
          { label: "到店接觸人次", value: funnelTotal.contacts, unit: "人",
            deltaText: `本期累計`, deltaKind: "flat", tone: "plain", color: "blue" },
          { label: "電子手卡建檔數", value: funnelTotal.builds, unit: "份",
            deltaText: `建檔率 ${buildRate}%`, deltaKind: "flat", tone: "plain", color: "blue" },
          { label: "試乘試駕人次", value: funnelTotal.trials, unit: "次",
            deltaText: `試駕率 ${trialRate}%`, deltaKind: "flat", tone: "plain", color: "blue" },
          { label: "報價單開立數", value: funnelTotal.quotes, unit: "張",
            deltaText: `報價率 ${quoteRate}%`, deltaKind: "flat", tone: "plain", color: "blue" },
          { label: "交車後 3 日回訪率",
            value: LAYER3_KPIS_FALLBACK[4].value, unit: "%", target: 90,
            deltaText: "✅ 達標", deltaKind: "up", tone: "good", color: "teal" },
        ];
      }

      // ── BEP ──
      bep = {
        achieved: deliveries,
        bepPoint: BEP_DATA_FALLBACK.bepPoint,    // 損益點由財務設定，現階段沿用 fallback
        monthlyTarget: targetDeliveries,
      };

      // ── monthly chart target ──
      monthlyChartTarget = targetMap.get("monthly_chart") ?? targetDeliveries;

      // ── 月份趨勢（近 5 個月 + 排序由舊到新）──
      const trendRows = ((trendRes.data ?? []) as { period_key: string; deliveries_count: number }[])
        .sort((a, b) => a.period_key.localeCompare(b.period_key));
      if (trendRows.length > 0) {
        monthlyTrend = trendRows.map((r, i) => {
          const prev = i > 0 ? trendRows[i - 1].deliveries_count : r.deliveries_count;
          const ratePct = prev > 0 ? Math.round(((r.deliveries_count - prev) / prev) * 100) : 0;
          const monthLabel = `${Number(r.period_key.split("-")[1])} 月`;
          const out: MonthlyDatum = {
            label: r.period_key === periodKey ? `${monthLabel}（本月）` : monthLabel,
            count: r.deliveries_count,
            ratePct,
            rateKind: ratePct > 0 ? "up" : ratePct < 0 ? "down" : "flat",
            isCurrent: r.period_key === periodKey,
          };
          return out;
        });
      }

      // ── RS 個人排行（取 mview 非 __all__ + vehicle null 的列、orders_count 由高至低）──
      const rsRows = currRows
        .filter((r) => r.rs_name !== "__all__" && r.vehicle_model_id === null && r.orders_count > 0)
        .sort((a, b) => b.orders_count - a.orders_count)
        .slice(0, 8);
      if (rsRows.length > 0) {
        // 接 funnel rows 拿到 trial/quote 率
        const funnelByRs = new Map<string, FunnelRow>();
        for (const f of funnelRows) funnelByRs.set(f.rs_name, f);
        rsRanking = rsRows.map((r): RsRow => {
          const f = funnelByRs.get(r.rs_name);
          const trial = f && f.builds > 0 ? Math.round((f.trials / f.builds) * 100) : 0;
          const quote = f && f.trials > 0 ? Math.round((f.quotes / f.trials) * 100) : 0;
          return {
            name: r.rs_name,
            sales: r.orders_count,
            rev: Math.round(Number(r.orders_amount) / 10000),
            trial,
            quote,
            golden: 0,  // 無 data，先 0；上線後接電訪/試駕時序
            revisit: 0,
            habc: 0,
          };
        });
      }

      // ── 車型業績（取 mview vehicle_model_id 非 null + __all__ rs 的列）──
      const modelRows = currRows
        .filter((r) => r.rs_name === "__all__" && r.vehicle_model_id !== null)
        .sort((a, b) => b.orders_count - a.orders_count)
        .slice(0, 8);
      if (modelRows.length > 0) {
        const maxCount = Math.max(...modelRows.map((r) => r.orders_count), 1);
        modelSales = modelRows.map((r): ModelRow => {
          const dict = r.vehicle_model_id ? modelDict.get(r.vehicle_model_id) : undefined;
          return {
            name: dict?.display_name ?? "（未知車型）",
            series: dict?.series ?? "—",
            count: r.orders_count,
            rev: Math.round(Number(r.orders_amount) / 10000),
            max: maxCount,
          };
        });
      }

      lastUpdated = new Date().toISOString().slice(0, 16).replace("T", " ");
    } else {
      // 兩邊都沒當期資料 → fallback
      usingFallback = true;
    }
  } catch (err) {
    console.error("[sales-manager-report] DB query failed, using fallback:", err);
    usingFallback = true;
  }

  return {
    layer1,
    layer2,
    layer3,
    bep,
    monthlyTrend,
    monthlyChartTarget,
    rsRanking,
    modelSales,
    weeklyTrend,
    lastUpdated,
    period,
    periodKey,
    isFallback: usingFallback,
  };
}

export type SalesManagerReportData = Awaited<ReturnType<typeof getSalesManagerReportData>>;
