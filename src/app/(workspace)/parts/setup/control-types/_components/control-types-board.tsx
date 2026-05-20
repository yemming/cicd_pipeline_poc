"use client";

import Link from "next/link";

import type {
  BusinessRuleRow,
  ControlTypeBadge,
  ControlTypeConfig,
} from "@/domain/rules";
import { KpiCard } from "@/components/visualization/KpiCard";
import { DonutChart } from "@/components/charts/DonutChart";
import type { ToneKey } from "@/components/visualization/tone";

// 將 control_type rule 的 accent 對映到 visualization ToneKey
const ACCENT_TONE: Record<ControlTypeConfig["accent"], ToneKey> = {
  red: "red",
  amber: "amber",
  teal: "teal",
};

// 類別卡頂部色（spec 規格的飽和邊框 + 飽和 header）
const ACCENT_PALETTE: Record<
  ControlTypeConfig["accent"],
  { border: string; head: string; hex: string }
> = {
  red: { border: "border-[#CC0000]", head: "bg-[#CC0000]", hex: "#CC0000" },
  amber: { border: "border-[#854F0B]", head: "bg-[#854F0B]", hex: "#854F0B" },
  teal: { border: "border-[#0F6E56]", head: "bg-[#0F6E56]", hex: "#0F6E56" },
};

const BADGE_PALETTE: Record<ControlTypeBadge["kind"], string> = {
  red: "bg-[#FDECEA] text-[#CC0000]",
  pend: "bg-[#FDF3E3] text-[#854F0B]",
  gry: "bg-[#F2F2F2] text-[#6B6A68]",
  done: "bg-[#EAF3DE] text-[#3B6D11]",
};

// 規則 → 對應 SKU 的 control_type code（從 class_label 推 — "A 類" → "A"）
function getCodeFromLabel(label?: string): string {
  if (!label) return "—";
  const m = label.match(/^([ABCD])/i);
  return m ? m[1].toUpperCase() : label;
}

export interface ControlTypesBoardProps {
  controlTypes: BusinessRuleRow[];
  skuCounts: { code: string; count: number }[];
  totalSkus: number;
  inactiveSkus: number;
  relatedRules: {
    purchase_authority: number;
    alert_rule: number;
    count_tolerance: number;
    count_workflow: number;
  };
  canEdit: boolean;
}

export function ControlTypesBoard({
  controlTypes,
  skuCounts,
  totalSkus,
  inactiveSkus,
  relatedRules,
  canEdit,
}: ControlTypesBoardProps) {
  const countMap = new Map(skuCounts.map((s) => [s.code, s.count]));

  // 動態算 distribution（取代 mock）
  const distribution = controlTypes.map((rule) => {
    const cfg = (rule.config ?? {}) as Partial<ControlTypeConfig>;
    const accent = cfg.accent ?? "teal";
    const code = getCodeFromLabel(cfg.class_label);
    const count = countMap.get(code) ?? 0;
    const pct = totalSkus > 0 ? Math.round((count / totalSkus) * 1000) / 10 : 0;
    return {
      code,
      label: cfg.class_label ?? code,
      accent,
      tone: ACCENT_TONE[accent],
      count,
      pct,
    };
  });

  // 視覺：把沒分類到的 SKU 用 "—" 補入 donut（如有）
  const uncategorized = (countMap.get("—") ?? 0) + (countMap.get("") ?? 0);

  const donutData = [
    ...distribution.map((d) => ({
      name: `${d.label} (${d.count})`,
      value: d.count,
      color: ACCENT_PALETTE[d.accent].hex,
    })),
    ...(uncategorized > 0
      ? [{ name: `未分類 (${uncategorized})`, value: uncategorized, color: "#9A9890" }]
      : []),
  ];

  const totalRules =
    relatedRules.purchase_authority +
    relatedRules.alert_rule +
    relatedRules.count_tolerance +
    relatedRules.count_workflow;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">管控類型定義</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          定義 A / B / C 類商品的管控規則，影響補貨、盤點、告警行為
        </span>
        {!canEdit ? (
          <span className="ml-auto text-[11px] text-[#9A9890] inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">visibility</span>
            僅檢視
          </span>
        ) : null}
      </header>

      {/* KPI Row — 4 張卡：總料號 + A/B/C 各別佔比 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="啟用料號總數"
          value={totalSkus}
          delta={
            inactiveSkus > 0
              ? { value: -inactiveSkus, tone: "neutral" }
              : undefined
          }
          tone="blue"
          icon={<span className="material-symbols-outlined text-[20px]">inventory_2</span>}
        />
        {distribution.map((d) => (
          <KpiCard
            key={d.code}
            label={`${d.label} · SKU 數`}
            value={d.count}
            delta={{ value: d.pct, tone: "neutral" }}
            tone={d.tone}
            href={`/parts/setup/items?control=${encodeURIComponent(d.code)}`}
            icon={<span className="material-symbols-outlined text-[20px]">category</span>}
          />
        ))}
      </section>

      {/* 3 張類別卡 — spec 主視覺，含 SKU 計數 + drill-down CTA */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {controlTypes.length === 0 ? (
          <div className="md:col-span-3 bg-white border border-dashed border-[#D5D3CB] rounded-lg p-8 text-center text-[12px] text-[#9A9890]">
            尚未設定任何管控類型。請聯絡系統管理員初始化 A / B / C 類規則。
          </div>
        ) : null}
        {controlTypes.map((rule) => {
          const cfg = (rule.config ?? {}) as Partial<ControlTypeConfig>;
          const accent = cfg.accent ?? "teal";
          const palette = ACCENT_PALETTE[accent];
          const code = getCodeFromLabel(cfg.class_label);
          const count = countMap.get(code) ?? 0;
          const pct = totalSkus > 0 ? ((count / totalSkus) * 100).toFixed(1) : "0";

          return (
            <section
              key={rule.id}
              className={`bg-white border-2 rounded-lg overflow-hidden ${palette.border} flex flex-col`}
            >
              <header className={`px-4 py-2.5 ${palette.head} text-white flex items-center justify-between`}>
                <div>
                  <div className="text-[16px] font-bold">{cfg.class_label ?? "—"}</div>
                  <div className="text-[11px] opacity-85 mt-0.5">{cfg.tier_label ?? ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-bold leading-tight">{count}</div>
                  <div className="text-[10px] opacity-85">料號 ({pct}%)</div>
                </div>
              </header>
              <div className="px-4 py-3 flex flex-col gap-1.5 text-[12px] text-[#2C2C2A] flex-1">
                <KvLine label="金額基準" value={cfg.amount_basis ?? "—"} />
                <KvLine label="盤點頻率" value={cfg.count_frequency ?? "—"} />
                <KvLineBadge label="序列號追蹤" badge={cfg.serial_tracking} />
                <KvLineBadge label="出庫審核" badge={cfg.issue_approval} />
                <KvLine
                  label="告警差異容許"
                  value={`${cfg.tolerance_pct ?? 0}%`}
                />
                <div className="text-[12px] text-[#9A9890] mt-1">
                  例：{cfg.examples ?? "—"}
                </div>
              </div>
              {/* Drill-down CTA */}
              <div className="px-4 py-2.5 border-t border-[#EEECE6] bg-[#F8F7F4]">
                <Link
                  href={`/parts/setup/items?control=${encodeURIComponent(code)}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#185FA5] hover:underline"
                >
                  查看本類全部料號
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </Link>
              </div>
            </section>
          );
        })}
      </section>

      {/* 商品類型分佈 — 雙視圖：Donut + 進度條 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            商品類型分佈（目前庫存）
          </h2>
          <span className="text-[11px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{totalSkus}</b> 筆啟用料號
          </span>
        </header>
        {totalSkus === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-[#9A9890]">
            目前沒有啟用料號可供統計。
          </div>
        ) : (
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-center">
            {/* 左 Donut */}
            <div>
              <DonutChart
                data={donutData}
                size="md"
                centerLabel={String(totalSkus)}
                centerCaption="料號"
                showLegend={false}
                showTooltip
              />
            </div>
            {/* 右 進度條 + legend */}
            <div className="flex flex-col gap-3">
              <div className="h-2 rounded-md overflow-hidden flex bg-[#F2F2F2]">
                {distribution.map((d) => (
                  <div
                    key={d.code}
                    style={{
                      width: `${d.pct}%`,
                      backgroundColor: ACCENT_PALETTE[d.accent].hex,
                    }}
                    title={`${d.label} ${d.pct}%`}
                  />
                ))}
              </div>
              <div className="flex gap-4 text-[12px] flex-wrap">
                {distribution.map((d) => (
                  <Link
                    key={d.code}
                    href={`/parts/setup/items?control=${encodeURIComponent(d.code)}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: ACCENT_PALETTE[d.accent].hex }}
                    />
                    {d.label} <b className="text-[#2C2C2A]">{d.pct}%</b>{" "}
                    <span className="text-[#9A9890]">({d.count} 料號)</span>
                  </Link>
                ))}
                {uncategorized > 0 ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#9A9890]" />
                    未分類 <b className="text-[#2C2C2A]">{uncategorized}</b> 料號
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}
        <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
          💡 分佈數據依商品主檔 <code className="font-mono text-[11px]">items.control_type</code> 即時計算；點 legend 或 KPI 卡可下鑽到該類料號列表
        </div>
      </section>

      {/* 相關業務規則 — 顯示有哪些規則受 control_type 影響 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            受管控類型影響的業務規則
          </h2>
          <span className="text-[11px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{totalRules}</b> 條啟用規則
          </span>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4">
          <RuleLinkCard
            href="/parts/setup/purchase-permissions"
            label="採購權限規則"
            count={relatedRules.purchase_authority}
            description="角色 × 金額上限 × 是否需主管審核"
          />
          <RuleLinkCard
            href="/parts/alerts/rules"
            label="告警規則"
            count={relatedRules.alert_rule}
            description="水位門檻、缺貨、滯銷觸發條件"
          />
          <RuleLinkCard
            href="/parts/setup/count-rules"
            label="盤點容差規則"
            count={relatedRules.count_tolerance}
            description="A / B / C 類盤點差異容許 %"
          />
          <RuleLinkCard
            href="/parts/setup/count-rules"
            label="盤點回傳工作流"
            count={relatedRules.count_workflow}
            description="超量 / A 類強制 / 範圍內處理"
            isLast
          />
        </div>
      </section>
    </main>
  );
}

function RuleLinkCard({
  href,
  label,
  count,
  description,
  isLast,
}: {
  href: string;
  label: string;
  count: number;
  description: string;
  isLast?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-3 hover:bg-[#F8F7F4] transition-colors ${isLast ? "" : "border-r border-[#EEECE6]"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-[#1A3A5C]">{label}</span>
        <span className="text-[14px] font-semibold text-[#2C2C2A]">{count}</span>
      </div>
      <div className="text-[11px] text-[#9A9890] mt-1">{description}</div>
      <div className="text-[11px] text-[#185FA5] mt-1.5 inline-flex items-center gap-0.5">
        前往設定 <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
      </div>
    </Link>
  );
}

function KvLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b className="text-[#2C2C2A]">{label}：</b>
      <span>{value}</span>
    </div>
  );
}

function KvLineBadge({
  label,
  badge,
}: {
  label: string;
  badge: ControlTypeBadge | undefined;
}) {
  return (
    <div>
      <b className="text-[#2C2C2A]">{label}：</b>
      {badge ? (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${BADGE_PALETTE[badge.kind]}`}
        >
          {badge.label}
        </span>
      ) : (
        <span>—</span>
      )}
    </div>
  );
}
