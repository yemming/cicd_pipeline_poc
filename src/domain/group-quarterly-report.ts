/**
 * Domain Helper — GRP05 集團季度績效報告（列印 / PDF 匯出用）
 *
 * 一次撈齊「集團季報」需要的門店層 KPI，聚合成可列印的形狀。資料一律讀
 * kpi_snapshots（門店層 org_id=門店、staff_id NULL；集團層 org_id NULL），
 * 與 group-analytics 同一份 demo seed。**全部用真資料聚合，缺資料的欄位回 null
 * 由前端顯示「—」，不假造數字。**
 *
 * 為什麼獨立成檔（不放 group-analytics.ts）：group-analytics 是 "use server"
 * （server action 檔），只准 export async function；本檔需要 export 型別 + 常數
 * （GRADE_DEF / QuarterlyStoreRow…），故拆成純 server-only module（只被 print
 * server component import，不需 "use server"）。
 *
 * 紀律：server-only domain helper，內部自己 import supabase（天條只禁 UI 直連）。
 *       RLS 靠 user_has_brand(brand_id) 擋跨 brand；brandId 僅作 query filter。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  gradeOf,
  type QuarterlyStoreRow,
  type QuarterMonthly,
  type QuarterlyHighlight,
  type GroupQuarterlyReportForPrint,
} from "./group-quarterly-report.constants";

// 型別 + GRADE_DEF 常數住在 client-safe 的 .constants 檔（"use client" 元件要 import
// GRADE_DEF 這個 runtime 值）；這裡 re-export 型別讓既有 caller 仍可從本檔拿。
export type {
  GradeTag,
  QuarterlyStoreRow,
  QuarterMonthly,
  QuarterlyHighlight,
  GroupQuarterlyReportForPrint,
} from "./group-quarterly-report.constants";
export { GRADE_DEF } from "./group-quarterly-report.constants";

/* 季度 ↔ 月份工具 */

const Q_MONTHS: Record<number, [number, number, number]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};
/** 季末錨點月（health_score seed 用季末首日） */
const Q_ANCHOR: Record<number, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };

function ymd(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function parseQuarterKey(key: string): { year: number; q: number } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!m) return null;
  return { year: Number(m[1]), q: Number(m[2]) };
}

function quarterMonths(year: number, q: number): string[] {
  return Q_MONTHS[q].map((mm) => ymd(year, mm));
}

function prevQuarter(year: number, q: number): { year: number; q: number } {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}

/* ────────────── 可出報告的季度清單 ────────────── */

/**
 * 哪些季度的 sales_volume seed「3 個月都齊」→ 可出完整季報。最新在前。
 * （seed 目前=2025-Q1 + 2026-Q1）
 */
export async function listReportableQuarters(
  brandId: string,
): Promise<Array<{ key: string; label: string }>> {
  const client = await createClient();
  const { data } = await client
    .from("kpi_snapshots")
    .select("period_month")
    .eq("brand_id", brandId)
    .eq("metric_key", "sales_volume")
    .not("org_id", "is", null);
  const present = new Set(
    ((data ?? []) as Array<{ period_month: string }>).map((r) =>
      r.period_month.slice(0, 7),
    ),
  );
  const out: Array<{ key: string; label: string }> = [];
  // 掃 present 月份推出年份範圍
  const years = new Set<number>();
  for (const p of present) years.add(Number(p.slice(0, 4)));
  for (const year of [...years].sort((a, b) => b - a)) {
    for (let q = 4; q >= 1; q--) {
      const full = Q_MONTHS[q].every((mm) =>
        present.has(`${year}-${String(mm).padStart(2, "0")}`),
      );
      if (full) out.push({ key: `${year}-Q${q}`, label: `${year} 年 Q${q}` });
    }
  }
  return out;
}

/** 預設報告季度 = 最新一個資料齊全的完整季 */
export async function getDefaultQuarterKey(brandId: string): Promise<string> {
  const qs = await listReportableQuarters(brandId);
  return qs[0]?.key ?? "2026-Q1";
}

/* ────────────── 主 helper ────────────── */

type Snap = {
  org_id: string | null;
  metric_key: string;
  metric_value: number | null;
  period_month: string;
};

const NUM = (v: number | null | undefined): number | null =>
  v == null ? null : Number(v);

export async function getGroupQuarterlyReportForPrint(
  brandId: string,
  quarterKey?: string,
): Promise<GroupQuarterlyReportForPrint | null> {
  const key = quarterKey ?? (await getDefaultQuarterKey(brandId));
  const parsed = parseQuarterKey(key);
  if (!parsed) return null;
  const { year, q } = parsed;

  const months = quarterMonths(year, q); // 季 3 個月
  const anchor = ymd(year, Q_ANCHOR[q]); // 季末 health 錨點
  const prev = prevQuarter(year, q);
  const prevAnchor = ymd(prev.year, Q_ANCHOR[prev.q]);
  const prevMonths = quarterMonths(prev.year, prev.q);
  const yoyMonths = quarterMonths(year - 1, q);

  const client = await createClient();
  const METRIC_KEYS = [
    "sales_volume",
    "service_count",
    "nps_monthly",
    "parts_turnover",
    "health_score",
    "sales_volume_target",
    "service_count_target",
  ];
  const [{ data: orgRows }, { data: snapRows }] = await Promise.all([
    client
      .from("organizations")
      .select("id, name")
      .eq("brand_id", brandId)
      .eq("level", 2)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    client
      .from("kpi_snapshots")
      .select("org_id, metric_key, metric_value, period_month")
      .eq("brand_id", brandId)
      .in("metric_key", METRIC_KEYS),
  ]);

  const orgs = (orgRows ?? []) as Array<{ id: string; name: string }>;
  const snaps = (snapRows ?? []) as Snap[];

  // 索引：org::metric::YYYY-MM-01 → value（同 key 取最新 period）
  const byKey = new Map<string, number | null>();
  // 「取最新」用的暫存：org::metric → {p, v}
  const latestByOrgMetric = new Map<string, { p: string; v: number | null }>();
  for (const s of snaps) {
    const org = s.org_id ?? "GROUP";
    byKey.set(`${org}::${s.metric_key}::${s.period_month}`, NUM(s.metric_value));
    const lk = `${org}::${s.metric_key}`;
    const cur = latestByOrgMetric.get(lk);
    if (!cur || s.period_month > cur.p)
      latestByOrgMetric.set(lk, { p: s.period_month, v: NUM(s.metric_value) });
  }

  const get = (org: string, metric: string, period: string) =>
    byKey.get(`${org}::${metric}::${period}`) ?? null;
  const latest = (org: string, metric: string) =>
    latestByOrgMetric.get(`${org}::${metric}`)?.v ?? null;

  /** 月加總（任一月缺值→回 null，避免拿不完整的季去比較誤導） */
  const sumMonths = (org: string, metric: string, ms: string[]): number | null => {
    const vals = ms.map((m) => get(org, metric, m));
    if (vals.some((v) => v == null)) return null;
    return vals.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  const avgMonths = (org: string, metric: string, ms: string[]): number | null => {
    const vals = ms.map((m) => get(org, metric, m)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  /* 逐店列 */
  const stores: QuarterlyStoreRow[] = orgs.map((o) => {
    const newCar = sumMonths(o.id, "sales_volume", months);
    const monthlyTarget = latest(o.id, "sales_volume_target");
    const newCarTarget = monthlyTarget != null ? monthlyTarget * 3 : null;
    const service = sumMonths(o.id, "service_count", months);
    const svcMonthlyTarget = latest(o.id, "service_count_target");
    const serviceTarget = svcMonthlyTarget != null ? svcMonthlyTarget * 3 : null;
    const health = get(o.id, "health_score", anchor);
    const healthPrev = get(o.id, "health_score", prevAnchor);
    return {
      orgId: o.id,
      name: o.name,
      newCar,
      newCarTarget,
      newCarRate: newCar != null && newCarTarget ? newCar / newCarTarget : null,
      service,
      serviceTarget,
      serviceRate: service != null && serviceTarget ? service / serviceTarget : null,
      nps: avgMonths(o.id, "nps_monthly", months),
      turnover: latest(o.id, "parts_turnover"),
      health,
      healthDelta: health != null && healthPrev != null ? health - healthPrev : null,
      grade: gradeOf(health),
    };
  });

  /* 集團彙總 */
  const sumStores = (pick: (r: QuarterlyStoreRow) => number | null): number | null => {
    const vals = stores.map(pick).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const avgStores = (pick: (r: QuarterlyStoreRow) => number | null): number | null => {
    const vals = stores.map(pick).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const groupNewCar = sumStores((r) => r.newCar);
  const groupNewCarTarget = sumStores((r) => r.newCarTarget);
  const groupService = sumStores((r) => r.service);
  const groupServiceTarget = sumStores((r) => r.serviceTarget);

  // 環比基準：上季 3 個月齊→QoQ；否則去年同季齊→YoY；都不齊→無箭頭
  const groupSumOverMonths = (metric: string, ms: string[]): number | null => {
    const perStore = orgs.map((o) => sumMonths(o.id, metric, ms));
    if (perStore.some((v) => v == null)) return null;
    return perStore.reduce<number>((a, b) => a + (b ?? 0), 0);
  };
  const prevNewCar = groupSumOverMonths("sales_volume", prevMonths);
  const yoyNewCar = groupSumOverMonths("sales_volume", yoyMonths);
  let compareLabel: string;
  let baseNewCar: number | null;
  let baseService: number | null;
  if (prevNewCar != null) {
    compareLabel = `vs 上季（${prev.year} Q${prev.q}）`;
    baseNewCar = prevNewCar;
    baseService = groupSumOverMonths("service_count", prevMonths);
  } else if (yoyNewCar != null) {
    compareLabel = `vs 去年同季（${year - 1} Q${q}）`;
    baseNewCar = yoyNewCar;
    baseService = groupSumOverMonths("service_count", yoyMonths);
  } else {
    compareLabel = "—（無可比較基期）";
    baseNewCar = null;
    baseService = null;
  }
  const ratioDelta = (cur: number | null, base: number | null): number | null =>
    cur != null && base != null && base !== 0 ? (cur - base) / base : null;

  const groupHealth = avgStores((r) => r.health);
  const groupHealthPrev = (() => {
    const vals = orgs
      .map((o) => get(o.id, "health_score", prevAnchor))
      .filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  // 集團 NPS 季平均：優先用 group-level（org_id NULL）月值，否則退門店均值
  const groupNpsMonthlyVals = months
    .map((m) => get("GROUP", "nps_monthly", m))
    .filter((v): v is number => v != null);
  const groupNps = groupNpsMonthlyVals.length
    ? groupNpsMonthlyVals.reduce((a, b) => a + b, 0) / groupNpsMonthlyVals.length
    : avgStores((r) => r.nps);

  /* 月度拆解 */
  const monthly: QuarterMonthly[] = months.map((m) => {
    const groupNpsM = get("GROUP", "nps_monthly", m);
    const npsM =
      groupNpsM ??
      (() => {
        const vals = orgs
          .map((o) => get(o.id, "nps_monthly", m))
          .filter((v): v is number => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      })();
    return {
      month: m,
      label: `${Number(m.slice(5, 7))}月`,
      newCar: groupSumOverMonths("sales_volume", [m]),
      service: groupSumOverMonths("service_count", [m]),
      nps: npsM,
    };
  });

  /* 季度重點摘要（規則生成，全部從真實數值推） */
  const highlights: QuarterlyHighlight[] = [];
  const ranked = [...stores]
    .filter((s) => s.health != null)
    .sort((a, b) => (b.health ?? 0) - (a.health ?? 0));
  if (ranked[0]?.health != null) {
    highlights.push({
      tone: "good",
      text: `${ranked[0].name} Health Score ${ranked[0].health}，為全集團最高，整體營運體質最穩健。`,
    });
  }
  const ncDelta = ratioDelta(groupNewCar, baseNewCar);
  if (ncDelta != null && ncDelta > 0) {
    highlights.push({
      tone: "good",
      text: `全台新車銷量 ${groupNewCar} 台，${compareLabel} 成長 ${(ncDelta * 100).toFixed(1)}%。`,
    });
  }
  if (groupNps != null && groupNps > 0) {
    highlights.push({
      tone: "good",
      text: `集團季平均 NPS +${Math.round(groupNps)}，客戶口碑維持正向。`,
    });
  }
  // 警示：評級介入 / 達成率偏低 / 周轉偏低
  const groupTurnover = avgStores((r) => r.turnover);
  for (const s of [...stores].sort((a, b) => (a.health ?? 999) - (b.health ?? 999))) {
    if (highlights.filter((h) => h.tone === "warn").length >= 3) break;
    const reasons: string[] = [];
    if (s.grade === "intervene") reasons.push(`Health Score ${s.health}（待介入）`);
    if (s.newCarRate != null && s.newCarRate < 0.8)
      reasons.push(`新車達成率僅 ${(s.newCarRate * 100).toFixed(0)}%`);
    if (groupTurnover != null && s.turnover != null && s.turnover < groupTurnover * 0.8)
      reasons.push(`零件周轉 ${s.turnover}x 低於集團均值 ${groupTurnover.toFixed(1)}x`);
    if (reasons.length) {
      highlights.push({ tone: "warn", text: `${s.name}：${reasons.join("、")}，下季需重點輔導。` });
    }
  }

  const achievedStoreCount = stores.filter(
    (s) => s.newCarRate != null && s.newCarRate >= 0.9,
  ).length;

  const monthLabels = `${Number(months[0].slice(5, 7))}～${Number(months[2].slice(5, 7))} 月`;
  const cutoffMonth = Number(anchor.slice(5, 7));
  const cutoffDay = new Date(year, cutoffMonth, 0).getDate(); // 該季末月最後一天
  const dataCutoff = `${year}-${String(cutoffMonth).padStart(2, "0")}-${String(cutoffDay).padStart(2, "0")}`;

  return {
    brandId,
    quarterKey: key,
    quarterLabel: `${year} 年 Q${q}`,
    periodRangeLabel: `${year} 年 ${monthLabels}`,
    dataCutoff,
    storeCount: stores.length,
    achievedStoreCount,
    groupNewCar,
    groupNewCarTarget,
    groupNewCarRate:
      groupNewCar != null && groupNewCarTarget ? groupNewCar / groupNewCarTarget : null,
    groupNewCarDelta: ratioDelta(groupNewCar, baseNewCar),
    groupService,
    groupServiceTarget,
    groupServiceRate:
      groupService != null && groupServiceTarget ? groupService / groupServiceTarget : null,
    groupServiceDelta: ratioDelta(groupService, baseService),
    groupNps,
    groupHealth,
    groupHealthDelta:
      groupHealth != null && groupHealthPrev != null
        ? Math.round((groupHealth - groupHealthPrev) * 10) / 10
        : null,
    compareLabel,
    stores,
    monthly,
    highlights,
  };
}
