import { createClient } from "@/lib/supabase/server";
import { STORE_SHORT_BY_ID, type PromoStatus } from "./group-analytics-labels";

/**
 * GRP13 促銷活動管理 — domain helper（讀取）
 *
 * reads 走 createClient（RLS user_has_brand 已 scope）。
 * 寫入在 lib/group/promotion-actions.ts 走 service client。
 *
 * 資料模型：business_rules rule_kind='promo_campaign'，活動全欄位存 config。
 * 監看表 / 效益分析：kpi_snapshots（promo_store_exec / promo_effect）seed。
 */

export type PromoPoster = {
  title: string;
  discount_label: string;
  subtitle: string;
  template: string;
  detail_html: string;
};

export type PromoCampaign = {
  id: string;
  brand_id: string;
  name: string;
  status: PromoStatus;
  promo_type: string;
  start_date: string | null;
  end_date: string | null;
  disc_min: number | null;
  disc_max: number | null;
  stores: string[];
  owner: string | null;
  contrib_nt: number | null;
  exec_count: number | null;
  poster: PromoPoster;
  audit_log: Array<{ action: string; by: string; at: string }>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromoStoreExec = {
  org_id: string;
  store_short: string;
  campaign: string;
  auth_min: number | null;
  auth_max: number | null;
  actual_discount: number | null;
  exec_count: number | null;
  contrib_nt: number | null;
  exec_status: string; // 正常 | 越界 | 待確認
  sort: number;
};

export type PromoEffect = {
  label: string;
  value_text: string;
  delta: string;
  dir: string; // up | down | flat
  accent: string; // teal | navy | amber
  sort: number;
};

export type PromoOverview = {
  total: number;
  active: number;
  scheduled: number;
  review: number;
  draft: number;
  ended: number;
  contribNt: number;
  avgDiscount: number | null;
  violationCount: number;
};

function asNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

const EMPTY_POSTER: PromoPoster = {
  title: "",
  discount_label: "",
  subtitle: "",
  template: "warm",
  detail_html: "",
};

function rowToCampaign(r: Record<string, unknown>): PromoCampaign {
  const config = (r.config as Record<string, unknown>) ?? {};
  const metadata = (r.metadata as Record<string, unknown>) ?? {};
  const audit = Array.isArray(config.audit_log) ? config.audit_log : [];
  const poster = (config.poster as Record<string, unknown>) ?? {};
  const stores = Array.isArray(config.stores) ? (config.stores as string[]) : [];
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    name: (metadata.name as string) ?? "（未命名活動）",
    status: ((config.status as string) ?? "draft") as PromoStatus,
    promo_type: (config.promo_type as string) ?? "",
    start_date: (config.start_date as string) ?? null,
    end_date: (config.end_date as string) ?? null,
    disc_min: asNum(config.disc_min),
    disc_max: asNum(config.disc_max),
    stores,
    owner: (config.owner as string) ?? null,
    contrib_nt: asNum(config.contrib_nt),
    exec_count: asNum(config.exec_count),
    poster: {
      title: (poster.title as string) ?? "",
      discount_label: (poster.discount_label as string) ?? "",
      subtitle: (poster.subtitle as string) ?? "",
      template: (poster.template as string) ?? "warm",
      detail_html: (poster.detail_html as string) ?? "",
    },
    audit_log: audit as Array<{ action: string; by: string; at: string }>,
    is_active: Boolean(r.is_active),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export { EMPTY_POSTER };

export async function listPromoCampaigns(brandId: string): Promise<PromoCampaign[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("business_rules")
    .select("*")
    .eq("rule_kind", "promo_campaign")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToCampaign);
}

export async function listPromoStoreExec(brandId: string): Promise<PromoStoreExec[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("kpi_snapshots")
    .select("*")
    .eq("metric_key", "promo_store_exec")
    .eq("brand_id", brandId);
  if (error) throw error;
  return (data ?? [])
    .map((r): PromoStoreExec => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const orgId = (r.org_id as string) ?? "";
      return {
        org_id: orgId,
        store_short: STORE_SHORT_BY_ID[orgId] ?? "—",
        campaign: (meta.campaign as string) ?? "",
        auth_min: asNum(meta.auth_min),
        auth_max: asNum(meta.auth_max),
        actual_discount: asNum(r.metric_value),
        exec_count: asNum(meta.exec_count),
        contrib_nt: asNum(meta.contrib_nt),
        exec_status: (meta.exec_status as string) ?? "正常",
        sort: Number(meta.sort ?? 0),
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

export async function listPromoEffect(brandId: string): Promise<PromoEffect[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("kpi_snapshots")
    .select("*")
    .eq("metric_key", "promo_effect")
    .eq("brand_id", brandId);
  if (error) throw error;
  return (data ?? [])
    .map((r): PromoEffect => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      return {
        label: (meta.label as string) ?? "",
        value_text: (meta.value_text as string) ?? "—",
        delta: (meta.delta as string) ?? "",
        dir: (meta.dir as string) ?? "flat",
        accent: (meta.accent as string) ?? "navy",
        sort: Number(meta.sort ?? 0),
      };
    })
    .sort((a, b) => a.sort - b.sort);
}

export async function getPromoOverview(brandId: string): Promise<PromoOverview> {
  const [campaigns, storeExec] = await Promise.all([
    listPromoCampaigns(brandId),
    listPromoStoreExec(brandId),
  ]);
  const by = (s: PromoStatus) => campaigns.filter((c) => c.status === s).length;
  const contribNt = campaigns
    .filter((c) => c.status === "active")
    .reduce((sum, c) => sum + (c.contrib_nt ?? 0), 0);
  const actuals = storeExec
    .map((s) => s.actual_discount)
    .filter((n): n is number => n !== null);
  const avgDiscount =
    actuals.length > 0
      ? Math.round((actuals.reduce((a, b) => a + b, 0) / actuals.length) * 10) / 10
      : null;
  const violationCount = storeExec.filter(
    (s) => s.exec_status === "越界" || s.exec_status === "待確認",
  ).length;
  return {
    total: campaigns.length,
    active: by("active"),
    scheduled: by("scheduled"),
    review: by("review"),
    draft: by("draft"),
    ended: by("ended"),
    contribNt,
    avgDiscount,
    violationCount,
  };
}
