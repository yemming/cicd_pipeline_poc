"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  saveSerialTrackingRules,
  type BusinessRuleRow,
  type SerialTrackingConfig,
  type SerialTrackingRuleInput,
} from "@/domain/rules";
import { getSerialLifecycle } from "@/domain/stock";
import type {
  SerialLifecycleStage,
  WarrantyStatus,
} from "@/domain/stock.constants";
import { CrmKpiCard } from "@/components/crm/crm-kpi-card";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

type Kpis = {
  tracked_skus: number;
  in_stock_serials: number;
  issued_serials: number;
  warranty_expiring: number;
};

type RecentActivity = {
  serial_no: string;
  item_code: string;
  item_name: string;
  status: string;
  warehouse_name: string | null;
  last_movement_at: string;
  warranty_status: WarrantyStatus;
};

type LifecycleResult = Awaited<ReturnType<typeof getSerialLifecycle>>;

// ──────────────────────────────────────────────────────────────────────────
// Tokens
// ──────────────────────────────────────────────────────────────────────────

const TONE_PALETTE: Record<
  SerialTrackingConfig["tone"],
  { bg: string; border: string; titleColor: string }
> = {
  red: { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", titleColor: "text-[#CC0000]" },
  amber: { bg: "bg-[#FDF3E3]", border: "border-[#FAC775]", titleColor: "text-[#854F0B]" },
  neutral: { bg: "bg-[#F8F7F4]", border: "border-[#EEECE6]", titleColor: "text-[#2C2C2A]" },
};

const STATUS_LABEL: Record<string, string> = {
  available: "庫存中",
  issued: "已出庫",
  reserved: "已預留",
  in_transit: "運送中",
  damaged: "損壞",
  scrapped: "報廢",
};

const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
  available: { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
  issued: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  reserved: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  in_transit: { bg: "bg-[#EBF3FF]", text: "text-[#1A3A5C]" },
  damaged: { bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  scrapped: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
};

const WARRANTY_CHIP: Record<WarrantyStatus, { label: string; bg: string; text: string } | null> = {
  none: null,
  active: { label: "保固中", bg: "bg-[#E8F5F0]", text: "text-[#0F6E56]" },
  expiring_soon: { label: "保固快到期", bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  expired: { label: "保固過期", bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
};

const STAGE_STATE_STYLE: Record<
  SerialLifecycleStage["state"],
  {
    iconBg: string;
    iconText: string;
    iconBorder: string;
    cardBg: string;
    cardBorder: string;
    labelText: string;
    captionText: string;
    connectorBg: string;
    badge: { label: string; bg: string; text: string } | null;
  }
> = {
  done: {
    iconBg: "bg-[#0F6E56]",
    iconText: "text-white",
    iconBorder: "border-[#0F6E56]",
    cardBg: "bg-[#E8F5F0]",
    cardBorder: "border-[#0F6E56]",
    labelText: "text-[#0F6E56]",
    captionText: "text-[#5A5955]",
    connectorBg: "bg-[#0F6E56]",
    badge: { label: "已完成", bg: "bg-[#E8F5F0]", text: "text-[#0F6E56]" },
  },
  active: {
    iconBg: "bg-[#1A3A5C]",
    iconText: "text-white",
    iconBorder: "border-[#1A3A5C]",
    cardBg: "bg-[#EBF3FF]",
    cardBorder: "border-[#1A3A5C]",
    labelText: "text-[#1A3A5C]",
    captionText: "text-[#2C2C2A]",
    connectorBg: "bg-[#D5D3CB]",
    badge: { label: "目前狀態", bg: "bg-[#1A3A5C]", text: "text-white" },
  },
  pending: {
    iconBg: "bg-[#F8F7F4]",
    iconText: "text-[#9A9890]",
    iconBorder: "border-[#D5D3CB]",
    cardBg: "bg-white",
    cardBorder: "border-[#EEECE6]",
    labelText: "text-[#9A9890]",
    captionText: "text-[#9A9890]",
    connectorBg: "bg-[#EEECE6]",
    badge: null,
  },
  skipped: {
    iconBg: "bg-[#F2F2F2]",
    iconText: "text-[#9A9890]",
    iconBorder: "border-[#D5D3CB]",
    cardBg: "bg-[#F8F7F4]",
    cardBorder: "border-[#EEECE6]",
    labelText: "text-[#9A9890]",
    captionText: "text-[#9A9890]",
    connectorBg: "bg-[#EEECE6]",
    badge: { label: "未經過", bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Rule editor state
// ──────────────────────────────────────────────────────────────────────────

type RuleFormRow = {
  id: string;
  config: SerialTrackingConfig;
};

function toFormRow(rule: BusinessRuleRow): RuleFormRow {
  const cfg = (rule.config ?? {}) as Partial<SerialTrackingConfig>;
  return {
    id: rule.id,
    config: {
      item_class: cfg.item_class ?? "C",
      required: cfg.required ?? false,
      by_category: cfg.by_category,
      label: cfg.label ?? "—",
      description: cfg.description ?? "",
      tone: cfg.tone ?? "neutral",
    },
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return iso;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main board
// ──────────────────────────────────────────────────────────────────────────

export function SerialTrackingBoard({
  rules,
  canEdit,
  kpis,
  recent,
}: {
  rules: BusinessRuleRow[];
  canEdit: boolean;
  kpis: Kpis;
  recent: RecentActivity[];
}) {
  const router = useRouter();
  const [ruleRows, setRuleRows] = useState<RuleFormRow[]>(() => rules.map(toFormRow));
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isRuleSaving, startRuleSave] = useTransition();

  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();

  function handleRuleUpdate(id: string, patch: Partial<SerialTrackingConfig>) {
    setRuleRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...patch } } : r)),
    );
  }

  function handleRuleSave() {
    if (!canEdit) return;
    const inputs: SerialTrackingRuleInput[] = ruleRows.map((r) => ({
      id: r.id,
      config: r.config,
    }));
    startRuleSave(async () => {
      const res = await saveSerialTrackingRules(inputs);
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 已儲存 ${res.data.saved} 筆規則` });
        router.refresh();
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSearch(seed?: string) {
    const trimmed = (seed ?? query).trim();
    if (!trimmed) {
      setSearchError("請輸入序列號");
      setLifecycle(null);
      return;
    }
    if (seed) setQuery(seed);
    setSearchError(null);
    startSearch(async () => {
      try {
        const res = await getSerialLifecycle(trimmed);
        setLifecycle(res);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "查詢失敗");
        setLifecycle(null);
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">序列號 / 批號追蹤</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 3.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定哪些備件需要序列號追蹤・整條生命週期查詢
        </span>
      </header>

      {/* 2. KPI 列 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CrmKpiCard
          icon="qr_code_2"
          label="追蹤中 SKU"
          value={kpis.tracked_skus}
          sub="啟用序號追蹤的料號"
          accent="navy"
        />
        <CrmKpiCard
          icon="inventory_2"
          label="庫存中序號"
          value={kpis.in_stock_serials}
          sub="status = available"
          accent="teal"
        />
        <CrmKpiCard
          icon="logout"
          label="已出庫序號"
          value={kpis.issued_serials}
          sub="累計領料 / 裝車"
          accent="blue"
        />
        <CrmKpiCard
          icon="shield"
          label="保固快到期"
          value={kpis.warranty_expiring}
          sub="60 天內到期"
          accent={kpis.warranty_expiring > 0 ? "amber" : "navy"}
        />
      </section>

      {/* 3. 查詢列 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className="text-[11px] text-[#9A9890] font-medium">輸入序列號</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="掃描或輸入序列號（例：SN-2024-ECU-00312）"
              disabled={isSearching}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
            />
          </div>
          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={isSearching}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
          >
            {isSearching ? "查詢中⋯" : "查詢生命週期"}
          </button>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setLifecycle(null);
              setSearchError(null);
            }}
            disabled={isSearching}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            清空
          </button>
        </div>
        {searchError ? (
          <div className="mt-2 text-[12px] text-[#CC0000]">{searchError}</div>
        ) : null}
      </section>

      {/* 4. Lifecycle Timeline + 右側資訊 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 左：Timeline */}
        <div className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">序號生命週期</h2>
            {lifecycle && lifecycle.found ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11.5px] text-[#5A5955]">{lifecycle.serial_no}</span>
                {(() => {
                  const wChip = WARRANTY_CHIP[lifecycle.warranty.status];
                  return wChip ? (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${wChip.bg} ${wChip.text}`}
                    >
                      {wChip.label}
                      {lifecycle.warranty.days_remaining !== null && lifecycle.warranty.days_remaining >= 0
                        ? `（剩 ${lifecycle.warranty.days_remaining} 天）`
                        : ""}
                    </span>
                  ) : null;
                })()}
              </div>
            ) : null}
          </header>
          <div className={`px-4 py-4 ${isSearching ? "pointer-events-none opacity-60" : ""}`}>
            {!lifecycle && !isSearching ? (
              <EmptyTimeline />
            ) : isSearching ? (
              <div className="text-[12px] text-[#9A9890] text-center py-12">查詢中⋯</div>
            ) : lifecycle && !lifecycle.found ? (
              <div className="bg-[#FDF3E3] border border-[#FAC775] rounded-md px-3 py-2.5 text-[12px] text-[#854F0B]">
                找不到序列號{" "}
                <span className="font-mono font-semibold">{lifecycle.serial_no}</span>
              </div>
            ) : lifecycle && lifecycle.found ? (
              <LifecycleTimeline result={lifecycle} />
            ) : null}
          </div>
        </div>

        {/* 右：最近紀錄 */}
        <aside className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">最近追蹤紀錄</h2>
          </header>
          <div className="px-3 py-3 flex flex-col gap-1.5 max-h-[420px] overflow-y-auto">
            {recent.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] text-center py-8">
                尚無序列號紀錄
              </div>
            ) : (
              recent.map((r) => {
                const statusChip = STATUS_CHIP[r.status] ?? STATUS_CHIP["available"];
                const wChip = WARRANTY_CHIP[r.warranty_status];
                return (
                  <button
                    key={`${r.serial_no}-${r.last_movement_at}`}
                    type="button"
                    onClick={() => handleSearch(r.serial_no)}
                    disabled={isSearching}
                    className="text-left w-full px-2.5 py-2 rounded-md border border-[#EEECE6] hover:border-[#185FA5] hover:bg-[#F8F7F4] transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold text-[#1A3A5C] truncate">
                        {r.serial_no}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip.bg} ${statusChip.text}`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#5A5955] truncate mt-0.5">
                      {r.item_code} · {r.item_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#9A9890]">
                      <span className="truncate">
                        {r.warehouse_name ?? "—"} · {formatDate(r.last_movement_at)}
                      </span>
                      {wChip ? (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ml-auto ${wChip.bg} ${wChip.text}`}
                        >
                          {wChip.label}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </section>

      {/* 5. 規則設定（A/B/C） */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          isRuleSaving ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">追蹤規則設定（A / B / C 三類）</h2>
            <span className="text-[11px] text-[#9A9890]">
              business_rules · rule_kind=serial_tracking
            </span>
          </div>
          <button
            type="button"
            onClick={handleRuleSave}
            disabled={!canEdit || isRuleSaving}
            title={canEdit ? "儲存規則變更" : "沒有編輯權限"}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRuleSaving ? "儲存中⋯" : "儲存規則"}
          </button>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {ruleRows.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] text-center py-6 md:col-span-3">尚無設定</div>
          ) : (
            ruleRows.map((row) => {
              const palette = TONE_PALETTE[row.config.tone];
              const isA = row.config.item_class === "A";
              const checked = row.config.required || !!row.config.by_category;
              return (
                <div
                  key={row.id}
                  className={`px-3 py-2.5 rounded-md border ${palette.bg} ${palette.border}`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <input
                      type="text"
                      value={row.config.label}
                      onChange={(e) => handleRuleUpdate(row.id, { label: e.target.value })}
                      disabled={!canEdit}
                      className={`flex-1 text-[12.5px] font-semibold bg-transparent border border-transparent focus:border-[#185FA5] rounded px-1 -mx-1 outline-none ${palette.titleColor} disabled:bg-transparent`}
                    />
                    <label className="text-[11.5px] text-[#5A5955] flex items-center gap-1 shrink-0 whitespace-nowrap">
                      {isA ? (
                        <>
                          <input type="checkbox" checked readOnly disabled />
                          強制（鎖定）
                        </>
                      ) : (
                        <>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const on = e.target.checked;
                              if (on) {
                                handleRuleUpdate(row.id, { required: false, by_category: true });
                              } else {
                                handleRuleUpdate(row.id, { required: false, by_category: false });
                              }
                            }}
                          />
                          {checked ? "部分啟用" : "不追蹤"}
                        </>
                      )}
                    </label>
                  </div>
                  <textarea
                    value={row.config.description}
                    onChange={(e) =>
                      handleRuleUpdate(row.id, { description: e.target.value })
                    }
                    disabled={!canEdit}
                    rows={3}
                    className="w-full text-[11.5px] text-[#5A5955] bg-transparent border border-transparent focus:border-[#185FA5] rounded px-1 -mx-1 outline-none resize-none disabled:bg-transparent"
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="text-[11px] text-[#9A9890]">
        💡 A 類強制鎖定（不可解）·B/C 類可切換是否啟用追蹤。Timeline 五段：入庫 → 庫存中 → 已預留 → 出庫/領料 → 保固期。
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

function EmptyTimeline() {
  return (
    <div className="bg-[#F8F7F4] rounded-md px-3 py-8 text-center">
      <span className="material-symbols-outlined text-[36px] text-[#D5D3CB] leading-none">
        qr_code_2
      </span>
      <div className="text-[13px] text-[#5A5955] mt-2">輸入序列號或從右側清單選一筆</div>
      <div className="text-[11.5px] text-[#9A9890] mt-1">
        將顯示完整 5 段生命週期：入庫 → 庫存中 → 已預留 → 出庫 → 保固期
      </div>
    </div>
  );
}

function LifecycleTimeline({
  result,
}: {
  result: Extract<LifecycleResult, { found: true }>;
}) {
  return (
    <div className="space-y-4">
      {/* 頭部：當前狀態總覽 */}
      <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-md px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              {result.item.name || "—"}
            </div>
            <div className="text-[11.5px] text-[#5A5955] font-mono">
              {result.item.code}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#9A9890]">目前位置</div>
            <div className="text-[12.5px] text-[#2C2C2A]">
              {result.current.warehouse_name ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline 5 段 */}
      <ol className="relative space-y-0">
        {result.stages.map((stage, idx) => {
          const style = STAGE_STATE_STYLE[stage.state];
          const isLast = idx === result.stages.length - 1;
          return (
            <li key={stage.key} className="relative pl-12 pb-4">
              {/* connector 線 */}
              {!isLast ? (
                <span
                  className={`absolute left-[15px] top-9 w-[2px] h-[calc(100%-2rem)] ${style.connectorBg}`}
                />
              ) : null}
              {/* 圓形 icon */}
              <span
                className={`absolute left-0 top-0 w-8 h-8 rounded-full border-2 ${style.iconBorder} ${style.iconBg} ${style.iconText} flex items-center justify-center`}
              >
                <span className="material-symbols-outlined text-[16px] leading-none">
                  {stage.icon}
                </span>
              </span>
              {/* 卡片內容 */}
              <div
                className={`border ${style.cardBorder} ${style.cardBg} rounded-md px-3 py-2`}
              >
                <div className="flex items-center gap-2 justify-between">
                  <div className={`text-[12.5px] font-semibold ${style.labelText}`}>
                    {stage.label}
                  </div>
                  {style.badge ? (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${style.badge.bg} ${style.badge.text}`}
                    >
                      {style.badge.label}
                    </span>
                  ) : null}
                </div>
                {stage.caption ? (
                  <div className={`text-[11.5px] mt-0.5 ${style.captionText}`}>
                    {stage.caption}
                  </div>
                ) : null}
                {stage.event_time ? (
                  <div className="text-[11px] text-[#9A9890] mt-0.5">
                    {stage.event_time}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* 異動軌跡（既有 querySerialNo 拿到的、保留供詳查） */}
      {result.history.length > 0 ? (
        <details className="border border-[#EEECE6] rounded-md">
          <summary className="px-3 py-2 text-[12px] text-[#5A5955] cursor-pointer hover:bg-[#F8F7F4]">
            完整異動軌跡（{result.history.length} 筆）
          </summary>
          <ol className="px-3 py-2 space-y-1.5 bg-[#F8F7F4]">
            {result.history.map((ev, idx) => (
              <li
                key={`${ev.event_time}-${idx}`}
                className="flex items-start gap-2 text-[12px]"
              >
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] shrink-0">
                  {ev.doc_kind}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[#2C2C2A]">
                    {ev.doc_no ? (
                      <span className="font-mono font-semibold">{ev.doc_no}</span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                    {ev.warehouse_name ? (
                      <span className="text-[#9A9890]"> · {ev.warehouse_name}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-[#9A9890]">
                    {formatDate(ev.event_time)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
