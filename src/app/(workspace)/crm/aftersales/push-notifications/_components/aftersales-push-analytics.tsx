"use client";

/**
 * CRM06B 售後推播 — A 級對齊用 enhanced analytics 區塊
 *
 * 三塊：
 *  1. AftersalesPushAnalyticsHeader — KpiCard（標準 visualization） + FunnelChart（送達→已讀→點擊→轉化）
 *  2. AftersalesPushTemplateRanking — 範本開啟率橫條排行（BarChart）
 *
 * 純 derive，吃 board 已撈好的 campaigns / templates / kpi、不打任何 server。
 * caller 透過 PushNotificationsBoard 的 extraAnalyticsSlot / extraLogTopSlot 注入。
 */

import { useMemo } from "react";

import { KpiCard } from "@/components/visualization/KpiCard";
import { BarChart } from "@/components/charts/BarChart";
import { FunnelChart } from "@/components/charts/FunnelChart";
import type { CampaignRow, PushBoardKpi } from "@/domain/sales-push-campaigns.constants";
import type { PushTemplateRow } from "@/domain/sales-push-templates.constants";

export function AftersalesPushAnalyticsHeader({
  kpi,
  campaigns,
}: {
  kpi: PushBoardKpi;
  campaigns: CampaignRow[];
}) {
  // 從 campaigns 算 funnel（漏斗）—— 只算 completed 的，避開 draft/scheduled 干擾
  const funnelData = useMemo(() => {
    const completed = campaigns.filter((c) => c.status === "completed");
    const sent = completed.reduce((s, c) => s + (c.sent_count ?? 0), 0);
    const read = completed.reduce((s, c) => s + (c.read_count ?? 0), 0);
    const click = completed.reduce((s, c) => s + (c.click_count ?? 0), 0);
    const convert = completed.reduce((s, c) => s + (c.convert_count ?? 0), 0);
    return [
      { name: "送達", value: sent },
      { name: "已讀", value: read },
      { name: "點擊", value: click },
      { name: "轉化（進廠）", value: convert },
    ];
  }, [campaigns]);

  const hasFunnelData = funnelData[0].value > 0;

  return (
    <section className="space-y-3">
      {/* 第二排 KpiCard — 標準 @/components/visualization/KpiCard（取代 sales board 原生 4 顆的輔助說明） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="本月推播 campaign 數"
          value={kpi.monthly_campaign_count}
          icon="📤"
          tone="blue"
          layout="horizontal"
        />
        <KpiCard
          label="本月已讀率"
          value={`${kpi.monthly_open_rate}%`}
          icon="👁"
          tone="green"
          layout="horizontal"
          delta={
            kpi.monthly_open_rate >= 70
              ? { value: kpi.monthly_open_rate - 65, tone: "positive" }
              : { value: kpi.monthly_open_rate - 65, tone: "negative" }
          }
        />
        <KpiCard
          label="14 天內進廠率"
          value={`${kpi.visit_within_14d_rate}%`}
          icon="🔧"
          tone="teal"
          layout="horizontal"
        />
        <KpiCard
          label="轉化進廠人次"
          value={kpi.monthly_convert}
          icon="✅"
          tone="amber"
          layout="horizontal"
        />
      </div>

      {/* 漏斗（送達 → 已讀 → 點擊 → 轉化進廠） */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">📊 推播效益漏斗</span>
          <span className="text-[11px] text-[#9A9890]">送達 → 已讀 → 點擊 → 轉化進廠（合計近 30 天 completed campaigns）</span>
        </header>
        <div className="px-4 py-3">
          {hasFunnelData ? (
            <FunnelChart data={funnelData} tone="teal" size="md" />
          ) : (
            <div className="py-10 text-center text-[12.5px] text-[#9A9890]">
              尚無已完成的推播 campaign — 完成首次推播後此處會出現轉化漏斗。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function AftersalesPushTemplateRanking({
  templates,
  campaigns,
}: {
  templates: PushTemplateRow[];
  campaigns: CampaignRow[];
}) {
  // 範本實際表現：用 campaigns 撈到對應 template 的 read/sent 平均 (大於 0 才列)
  const rankingData = useMemo(() => {
    type Agg = { name: string; sent: number; read: number };
    const byTpl = new Map<string, Agg>();
    for (const c of campaigns) {
      if (c.status !== "completed" || !c.template_id) continue;
      const tpl = templates.find((t) => t.id === c.template_id);
      const name = tpl?.name ?? c.name;
      const prev = byTpl.get(c.template_id) ?? { name, sent: 0, read: 0 };
      prev.sent += c.sent_count ?? 0;
      prev.read += c.read_count ?? 0;
      byTpl.set(c.template_id, prev);
    }
    const rows = Array.from(byTpl.values())
      .filter((r) => r.sent > 0)
      .map((r) => ({ name: r.name.length > 16 ? r.name.slice(0, 15) + "…" : r.name, openRate: Math.round((r.read / r.sent) * 100) }))
      .sort((a, b) => b.openRate - a.openRate)
      .slice(0, 8);
    return rows;
  }, [templates, campaigns]);

  if (rankingData.length === 0) return null;

  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden mb-3">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">📈 各範本開啟率排行</span>
        <span className="text-[11px] text-[#9A9890]">完成的推播任務、按已讀率由高到低（取前 8）</span>
      </header>
      <div className="px-4 py-3">
        <BarChart
          data={rankingData}
          categoryKey="name"
          valueKey="openRate"
          tone="teal"
          orientation="horizontal"
          size="md"
        />
      </div>
    </div>
  );
}
