"use client";

/**
 * CRM06A 銷售推播通知管理（v2 — 2026-05-17 全砍重寫）
 *
 * 3 個 Tab：
 *   1. 範本管理（templates）：分類 filter + 3 欄卡片 grid + 編輯 / 刪除
 *   2. 新增任務（new campaign）：Step 1/2/3 表單 + LINE bubble 預覽
 *   3. 發送記錄（log）：<DataGrid> 列表 + 點 row 展開成效詳情
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  PUSH_CHANNEL_BADGE,
  PUSH_CHANNEL_LABEL,
  PUSH_TEMPLATE_CATEGORIES,
  PUSH_TEMPLATE_CATEGORY_ICON,
  type PushChannel,
  type PushKind,
  type PushTemplateRow,
} from "@/domain/sales-push-templates.constants";
import {
  CAMPAIGN_STATUS_BADGE,
  CAMPAIGN_STATUS_LABEL,
  HABC_BADGE,
  HABC_LEVELS,
  type CampaignExtraConditions,
  type CampaignRow,
  type HabcLevel,
  type PushBoardKpi,
} from "@/domain/sales-push-campaigns.constants";
import {
  createPushTemplateAction,
  deletePushTemplateAction,
  updatePushTemplateAction,
} from "@/lib/sales/push-templates-actions";
import {
  cancelCampaignAction,
  createCampaignAction,
  deleteCampaignAction,
  previewAudienceAction,
} from "@/lib/sales/push-campaigns-actions";
import { toggleAutomationRuleAction } from "@/lib/sales/push-automation-actions";
import type { AutomationRuleRow } from "@/domain/sales-push-automation.constants";
import { AUTOMATION_TRIGGER_LABEL } from "@/domain/sales-push-automation.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type TabKey = "templates" | "new" | "log";
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

const TAB_DEFS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "templates", label: "推播範本管理", icon: "📝" },
  { key: "new", label: "新增推播任務", icon: "🚀" },
  { key: "log", label: "發送記錄與成效", icon: "📊" },
];

export function PushNotificationsBoard({
  kind,
  canEdit,
  title,
  sprintLabel,
  moduleLabel,
  templates,
  campaigns,
  kpi,
  automationRules = [],
  initialTab,
  initialStep,
  initialCategory,
}: {
  kind: PushKind;
  canEdit: boolean;
  title: string;
  sprintLabel: string;
  moduleLabel: string;
  templates: PushTemplateRow[];
  campaigns: CampaignRow[];
  kpi: PushBoardKpi;
  automationRules?: AutomationRuleRow[];
  initialTab: TabKey;
  initialStep: number;
  initialCategory: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [category, setCategory] = useState<string>(initialCategory);

  // 同步 URL
  const setTabAndUrl = (next: TabKey) => {
    setTab(next);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    if (next !== "new") sp.delete("step");
    router.replace(`?${sp.toString()}`);
  };

  const setCategoryAndUrl = (next: string) => {
    setCategory(next);
    const sp = new URLSearchParams(searchParams.toString());
    if (next) sp.set("category", next);
    else sp.delete("category");
    router.replace(`?${sp.toString()}`);
  };

  const showBanner = useCallback((b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }, []);

  // ── 範本 modal state ─────────────────────────────────
  const [tplModal, setTplModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; row: PushTemplateRow }
    | null
  >(null);

  const closeTplModal = () => setTplModal(null);

  const submitTplModal = (input: {
    category: string;
    name: string;
    channel: PushChannel;
    icon: string;
    body: string;
  }) => {
    startTransition(async () => {
      const res =
        tplModal?.mode === "edit"
          ? await updatePushTemplateAction(tplModal.row.id, {
              category: input.category,
              name: input.name,
              channel: input.channel,
              icon: input.icon,
              body: input.body,
            })
          : await createPushTemplateAction({
              kind,
              category: input.category,
              name: input.name,
              channel: input.channel,
              icon: input.icon,
              body: input.body,
            });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存範本" });
        closeTplModal();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleDeleteTpl = (row: PushTemplateRow) => {
    if (!confirm(`確定刪除範本「${row.name}」？`)) return;
    startTransition(async () => {
      const res = await deletePushTemplateAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  // ── Step 1/2/3 表單 state ─────────────────────────────
  const [step, setStep] = useState<number>(initialStep);
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  const [selectedHabc, setSelectedHabc] = useState<HabcLevel[]>([]);
  const [extraConditions, setExtraConditions] = useState<CampaignExtraConditions>({
    first_purchase: "all",
    gender: "all",
  });
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [campaignName, setCampaignName] = useState<string>("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("schedule");
  const [scheduleAt, setScheduleAt] = useState<string>(() =>
    new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
  );

  const selectedTpl = useMemo(
    () => templates.find((t) => t.id === selectedTplId) ?? null,
    [templates, selectedTplId],
  );

  const setStepAndUrl = (next: number) => {
    setStep(next);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", "new");
    sp.set("step", String(next));
    router.replace(`?${sp.toString()}`);
  };

  // Debounce 試算客群 — 把 reset 邏輯也用 setTimeout 包，避免 sync setState in effect body
  useEffect(() => {
    if (tab !== "new" || step !== 2) return;
    const timer = setTimeout(async () => {
      if (selectedHabc.length === 0) {
        setAudienceCount(0);
        return;
      }
      const res = await previewAudienceAction({
        kind,
        target_habc: selectedHabc,
        extra_conditions: extraConditions,
      });
      if (res.ok) setAudienceCount(res.data.count);
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, step, selectedHabc, extraConditions, kind]);

  const submitCampaign = () => {
    if (!selectedTpl) {
      showBanner({ ok: false, msg: "請先選擇範本" });
      return;
    }
    if (selectedHabc.length === 0) {
      showBanner({ ok: false, msg: "請選擇至少一個 HABC 客群" });
      return;
    }
    if (!campaignName.trim()) {
      showBanner({ ok: false, msg: "請填寫任務名稱" });
      return;
    }
    startTransition(async () => {
      const res = await createCampaignAction({
        kind,
        name: campaignName,
        template_id: selectedTpl.id,
        channel: selectedTpl.channel,
        message_body: selectedTpl.body,
        buttons: selectedTpl.buttons,
        target_habc: selectedHabc,
        extra_conditions: extraConditions,
        scheduled_at: scheduleMode === "now" ? null : new Date(scheduleAt).toISOString(),
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 推播任務已建立" });
        // reset
        setSelectedTplId(null);
        setSelectedHabc([]);
        setCampaignName("");
        setExtraConditions({ first_purchase: "all", gender: "all" });
        setStepAndUrl(1);
        setTabAndUrl("log");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // ── 派送 ────────────────────────────────────────────
  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? lockedClass : ""}`}>
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{title}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintLabel}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {moduleLabel} CRM｜範本 × 任務 × 成效一站式
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {tab === "templates" && canEdit && (
            <button
              onClick={() => setTplModal({ mode: "create" })}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              disabled={isPending}
            >
              ＋ 新增範本
            </button>
          )}
          {tab !== "new" && canEdit && (
            <button
              onClick={() => setTabAndUrl("new")}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            >
              🚀 新增推播任務
            </button>
          )}
        </div>
      </header>

      {/* KPI bar */}
      <KpiRow kpi={kpi} kind={kind} />

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {TAB_DEFS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTabAndUrl(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3 -mt-3">
        {tab === "templates" && (
          <>
            <TemplatesTab
              templates={templates}
              category={category}
              onCategoryChange={setCategoryAndUrl}
              canEdit={canEdit}
              onEdit={(row) => setTplModal({ mode: "edit", row })}
              onDelete={handleDeleteTpl}
              onUseTemplate={(row) => {
                setSelectedTplId(row.id);
                setCampaignName(`${row.name} (${new Date().toLocaleDateString("zh-TW")})`);
                setStepAndUrl(2);
                setTabAndUrl("new");
              }}
            />
            {kind === "aftersales" && automationRules.length > 0 && (
              <AutomationRulesSection
                rules={automationRules}
                canEdit={canEdit}
                isPending={isPending}
                onToggle={(id, next) => {
                  startTransition(async () => {
                    const res = await toggleAutomationRuleAction(id, next);
                    if (res.ok) {
                      showBanner({ ok: true, msg: `✓ 已${next ? "啟用" : "停用"}自動化規則` });
                      router.refresh();
                    } else {
                      showBanner({ ok: false, msg: res.error });
                    }
                  });
                }}
              />
            )}
          </>
        )}
        {tab === "new" && (
          <NewCampaignTab
            step={step}
            setStep={setStepAndUrl}
            templates={templates}
            category={category}
            onCategoryChange={setCategoryAndUrl}
            selectedTpl={selectedTpl}
            setSelectedTplId={setSelectedTplId}
            selectedHabc={selectedHabc}
            setSelectedHabc={setSelectedHabc}
            extraConditions={extraConditions}
            setExtraConditions={setExtraConditions}
            audienceCount={audienceCount}
            campaignName={campaignName}
            setCampaignName={setCampaignName}
            scheduleMode={scheduleMode}
            setScheduleMode={setScheduleMode}
            scheduleAt={scheduleAt}
            setScheduleAt={setScheduleAt}
            isPending={isPending}
            onSubmit={submitCampaign}
          />
        )}
        {tab === "log" && (
          <LogTab
            campaigns={campaigns}
            isPending={isPending}
            canEdit={canEdit}
            onCancel={(id) => {
              if (!confirm("確定取消此任務？")) return;
              startTransition(async () => {
                const res = await cancelCampaignAction(id);
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已取消" });
                  router.refresh();
                } else showBanner({ ok: false, msg: res.error });
              });
            }}
            onDelete={(id) => {
              if (!confirm("確定刪除此任務？")) return;
              startTransition(async () => {
                const res = await deleteCampaignAction(id);
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已刪除" });
                  router.refresh();
                } else showBanner({ ok: false, msg: res.error });
              });
            }}
          />
        )}
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 範本 modal */}
      {tplModal && (
        <TemplateModal
          mode={tplModal.mode}
          initial={tplModal.mode === "edit" ? tplModal.row : null}
          onClose={closeTplModal}
          onSubmit={submitTplModal}
          isPending={isPending}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────
// KPI Row
// ─────────────────────────────────────────────────────

function KpiCard({
  label,
  n,
  color,
  sub,
}: {
  label: string;
  n: string | number;
  color: string;
  sub: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890] mb-1">{label}</div>
      <div className="text-[22px] font-semibold leading-none mb-1" style={{ color }}>
        {n}
      </div>
      <div className="text-[10.5px] text-[#9A9890]">{sub}</div>
    </div>
  );
}

function KpiRow({ kpi, kind }: { kpi: PushBoardKpi; kind: PushKind }) {
  const isAftersales = kind === "aftersales";
  return (
    <div className={`grid grid-cols-2 gap-2.5 ${isAftersales ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      <KpiCard
        label="範本總數"
        n={kpi.template_count}
        color="#1A3A5C"
        sub={`LINE ${kpi.template_by_channel.line} / 簡訊 ${kpi.template_by_channel.sms} / Email ${kpi.template_by_channel.email} / 雙通道 ${kpi.template_by_channel.both}`}
      />
      <KpiCard
        label="平均開啟率"
        n={`${kpi.avg_open_rate}%`}
        color="#2D7D32"
        sub="範本歷史平均"
      />
      <KpiCard
        label="本月累計發送"
        n={kpi.monthly_sent}
        color="#1A3A5C"
        sub={`${kpi.monthly_campaign_count} 次推播合計`}
      />
      <KpiCard
        label="本月已讀率"
        n={`${kpi.monthly_open_rate}%`}
        color="#2D7D32"
        sub={`轉成交 ${kpi.monthly_convert} 筆`}
      />
      {isAftersales && (
        <KpiCard
          label="📅 14 天內預約進廠率"
          n={`${kpi.visit_within_14d_rate}%`}
          color="#0F6E56"
          sub={`樣本 ${kpi.visit_within_14d_sample} 筆（近 30 天發送）`}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Tab 1: Templates
// ─────────────────────────────────────────────────────

function TemplatesTab({
  templates,
  category,
  onCategoryChange,
  canEdit,
  onEdit,
  onDelete,
  onUseTemplate,
}: {
  templates: PushTemplateRow[];
  category: string;
  onCategoryChange: (c: string) => void;
  canEdit: boolean;
  onEdit: (row: PushTemplateRow) => void;
  onDelete: (row: PushTemplateRow) => void;
  onUseTemplate: (row: PushTemplateRow) => void;
}) {
  const filtered = useMemo(
    () => (category ? templates.filter((t) => t.category === category) : templates),
    [templates, category],
  );

  return (
    <>
      {/* 分類 chip 列 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11.5px] font-medium text-[#5A5955]">範本分類：</span>
        <CategoryChip
          label="全部"
          active={!category}
          onClick={() => onCategoryChange("")}
        />
        {PUSH_TEMPLATE_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={`${PUSH_TEMPLATE_CATEGORY_ICON[c]} ${c}`}
            active={category === c}
            onClick={() => onCategoryChange(c)}
          />
        ))}
      </div>

      {/* 卡片 grid */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-[12.5px] text-[#9A9890]">
          此分類沒有範本，點右上「＋ 新增範本」建立。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              row={t}
              canEdit={canEdit}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
              onUse={() => onUseTemplate(t)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium transition-colors border ${
        active
          ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
          : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
      }`}
    >
      {label}
    </button>
  );
}

function TemplateCard({
  row,
  canEdit,
  onEdit,
  onDelete,
  onUse,
}: {
  row: PushTemplateRow;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUse: () => void;
}) {
  const badge = PUSH_CHANNEL_BADGE[row.channel];
  return (
    <div className="border-[1.5px] border-[#EEECE6] rounded-lg overflow-hidden hover:border-[#85B7EB] hover:shadow-md transition-all bg-white">
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-[#EEECE6]">
        <span className="text-[18px]">{row.icon ?? PUSH_TEMPLATE_CATEGORY_ICON[row.category as keyof typeof PUSH_TEMPLATE_CATEGORY_ICON] ?? "💬"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[#2C2C2A] truncate">{row.name}</div>
          <div className="text-[10.5px] text-[#9A9890] mt-0.5">{row.category}</div>
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: badge.bg, color: badge.fg }}
        >
          {badge.icon} {badge.label}
        </span>
      </div>
      <div className="px-3 py-3 bg-[#FAFAF8] text-[12px] text-[#5A5955] leading-relaxed min-h-[78px] line-clamp-4">
        {row.body}
      </div>
      <div className="px-3 py-2 border-t border-[#EEECE6] flex items-center justify-between gap-2">
        <div className="text-[10.5px] text-[#9A9890] flex items-center gap-2">
          <span>使用 {row.used_count}</span>
          {row.open_rate !== null && (
            <>
              <span>·</span>
              <span>已讀 {row.open_rate}%</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onUse}
            disabled={!canEdit}
            className="h-[24px] px-2 rounded text-[11px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            使用此範本
          </button>
          {canEdit && (
            <>
              <button
                onClick={onEdit}
                className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                編輯
              </button>
              <button
                onClick={onDelete}
                className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                刪除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Automation Rules (aftersales only)
// ─────────────────────────────────────────────────────

function AutomationRulesSection({
  rules,
  canEdit,
  isPending,
  onToggle,
}: {
  rules: AutomationRuleRow[];
  canEdit: boolean;
  isPending: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden mt-3">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">⚙️ 自動化規則</span>
        <span className="text-[11px] text-[#9A9890]">
          觸發事件 → 推播範本（背景排程，免手動建任務）
        </span>
        <span className="ml-auto text-[11px] text-[#185FA5]">
          啟用 {rules.filter((r) => r.is_active).length} / {rules.length}
        </span>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {rules.map((r) => (
          <AutomationRuleCard
            key={r.id}
            row={r}
            canEdit={canEdit}
            disabled={isPending}
            onToggle={(next) => onToggle(r.id, next)}
          />
        ))}
      </div>
    </section>
  );
}

function AutomationRuleCard({
  row,
  canEdit,
  disabled,
  onToggle,
}: {
  row: AutomationRuleRow;
  canEdit: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const ch = PUSH_CHANNEL_BADGE[row.channel];
  const triggerLabel = AUTOMATION_TRIGGER_LABEL[row.trigger_event] ?? row.trigger_event;
  const cfg = row.trigger_config ?? {};
  const cfgPretty = Object.entries(cfg)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" · ");
  return (
    <div
      className={`border-[1.5px] rounded-lg overflow-hidden bg-white transition-all ${
        row.is_active
          ? "border-[#1A3A5C]/30 shadow-sm"
          : "border-[#EEECE6] opacity-70"
      }`}
    >
      <div className="px-3 py-2.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{row.name}</div>
          <div className="text-[10.5px] text-[#9A9890] mt-0.5">{triggerLabel}</div>
          {cfgPretty && (
            <div className="text-[10px] text-[#5A5955] font-mono mt-1">{cfgPretty}</div>
          )}
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
          style={{ backgroundColor: ch.bg, color: ch.fg }}
        >
          {ch.icon} {ch.label}
        </span>
      </div>
      {row.description && (
        <div className="px-3 pb-2 text-[11px] text-[#5A5955]">{row.description}</div>
      )}
      <div className="px-3 py-2 border-t border-[#EEECE6] flex items-center justify-between gap-2 bg-[#FAFAF8]">
        <span className="text-[11px] text-[#5A5955]">
          {row.is_active ? (
            <span className="text-[#3B6D11] font-semibold">已啟用</span>
          ) : (
            <span className="text-[#9A9890]">已停用</span>
          )}
        </span>
        <ToggleSwitch
          on={row.is_active}
          disabled={!canEdit || disabled}
          onChange={onToggle}
          ariaLabel={`切換自動化規則：${row.name}`}
        />
      </div>
    </div>
  );
}

function ToggleSwitch({
  on,
  disabled,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[22px] w-[38px] rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? "bg-[#1A3A5C]" : "bg-[#D5D3CB]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-[16px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────
// Tab 2: New Campaign — Step 1/2/3
// ─────────────────────────────────────────────────────

function NewCampaignTab(props: {
  step: number;
  setStep: (n: number) => void;
  templates: PushTemplateRow[];
  category: string;
  onCategoryChange: (c: string) => void;
  selectedTpl: PushTemplateRow | null;
  setSelectedTplId: (id: string | null) => void;
  selectedHabc: HabcLevel[];
  setSelectedHabc: (h: HabcLevel[]) => void;
  extraConditions: CampaignExtraConditions;
  setExtraConditions: (c: CampaignExtraConditions) => void;
  audienceCount: number;
  campaignName: string;
  setCampaignName: (s: string) => void;
  scheduleMode: "now" | "schedule";
  setScheduleMode: (m: "now" | "schedule") => void;
  scheduleAt: string;
  setScheduleAt: (s: string) => void;
  isPending: boolean;
  onSubmit: () => void;
}) {
  const {
    step,
    setStep,
    templates,
    category,
    onCategoryChange,
    selectedTpl,
    setSelectedTplId,
    selectedHabc,
    setSelectedHabc,
    extraConditions,
    setExtraConditions,
    audienceCount,
    campaignName,
    setCampaignName,
    scheduleMode,
    setScheduleMode,
    scheduleAt,
    setScheduleAt,
    isPending,
    onSubmit,
  } = props;

  return (
    <div className="space-y-3">
      {/* Step indicator */}
      <div className="flex items-center gap-1.5 mb-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (n <= step || (n === 2 && selectedTpl) || (n === 3 && selectedHabc.length > 0))
                  setStep(n);
              }}
              className={`h-[28px] px-3 rounded-full text-[12px] font-semibold transition-colors ${
                step === n
                  ? "bg-[#1A3A5C] text-white"
                  : n < step
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#9A9890]"
              }`}
            >
              Step {n}
              {n < step && " ✓"}
            </button>
            {n < 3 && <span className="text-[#D5D3CB]">─</span>}
          </div>
        ))}
        <span className="ml-3 text-[11.5px] text-[#5A5955]">
          {step === 1 && "選擇範本"}
          {step === 2 && "鎖定客群"}
          {step === 3 && "發送設定與預覽"}
        </span>
      </div>

      {/* Step 1: 選擇範本 */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A]">Step 1　選擇推播範本</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryChip
              label="全部"
              active={!category}
              onClick={() => onCategoryChange("")}
            />
            {PUSH_TEMPLATE_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={`${PUSH_TEMPLATE_CATEGORY_ICON[c]} ${c}`}
                active={category === c}
                onClick={() => onCategoryChange(c)}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(category ? templates.filter((t) => t.category === category) : templates).map((t) => {
              const selected = selectedTpl?.id === t.id;
              const badge = PUSH_CHANNEL_BADGE[t.channel];
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTplId(t.id)}
                  className={`text-left rounded-lg border-[1.5px] transition-all p-3 bg-white ${
                    selected
                      ? "border-[#1A3A5C] shadow-[0_0_0_2px_rgba(26,58,92,0.15)]"
                      : "border-[#EEECE6] hover:border-[#85B7EB]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[18px]">{t.icon ?? "💬"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#2C2C2A] truncate">{t.name}</div>
                      <div className="text-[10.5px] text-[#9A9890]">{t.category}</div>
                    </div>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: badge.bg, color: badge.fg }}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#5A5955] line-clamp-3 leading-relaxed">{t.body}</div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#EEECE6]">
            <div className="text-[12px] text-[#5A5955]">
              {selectedTpl ? (
                <>
                  <span className="text-[#3B6D11] font-semibold">✓ 已選擇：</span>
                  {selectedTpl.name}
                </>
              ) : (
                <span className="text-[#9A9890]">尚未選擇範本</span>
              )}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedTpl}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 選擇客群 */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A]">Step 2　鎖定推播客群</div>
          {/* HABC */}
          <div className="space-y-1.5">
            <div className={labelClass}>HABC 分級（多選）</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {HABC_LEVELS.map((h) => {
                const sel = selectedHabc.includes(h);
                const badge = HABC_BADGE[h];
                return (
                  <button
                    key={h}
                    onClick={() =>
                      setSelectedHabc(
                        sel ? selectedHabc.filter((x) => x !== h) : [...selectedHabc, h],
                      )
                    }
                    className={`rounded-lg border-[1.5px] py-2.5 px-3 transition-all ${
                      sel
                        ? "shadow-[0_0_0_2px_rgba(26,58,92,0.15)]"
                        : "border-[#EEECE6] hover:border-[#85B7EB]"
                    }`}
                    style={{
                      backgroundColor: sel ? badge.bg : "#fff",
                      borderColor: sel ? badge.fg : undefined,
                    }}
                  >
                    <div
                      className="text-[18px] font-bold leading-none"
                      style={{ color: badge.fg }}
                    >
                      {h}
                    </div>
                    <div className="text-[10.5px] text-[#9A9890] mt-1">{badge.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 附加條件 */}
          <div className="space-y-2 pt-2 border-t border-[#EEECE6]">
            <div className={labelClass}>附加條件（可選）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              <KvField label="是否首購">
                <select
                  className={inputClass}
                  value={extraConditions.first_purchase ?? "all"}
                  onChange={(e) =>
                    setExtraConditions({
                      ...extraConditions,
                      first_purchase: e.target.value as "all" | "yes" | "no",
                    })
                  }
                >
                  <option value="all">不限</option>
                  <option value="yes">首購客戶</option>
                  <option value="no">非首購</option>
                </select>
              </KvField>
              <KvField label="性別">
                <select
                  className={inputClass}
                  value={extraConditions.gender ?? "all"}
                  onChange={(e) =>
                    setExtraConditions({
                      ...extraConditions,
                      gender: e.target.value as "all" | "M" | "F",
                    })
                  }
                >
                  <option value="all">不限</option>
                  <option value="M">男性</option>
                  <option value="F">女性</option>
                </select>
              </KvField>
              <KvField label="縣市（逗號分隔）">
                <input
                  className={inputClass}
                  placeholder="台北市,新北市,桃園市"
                  value={(extraConditions.cities ?? []).join(",")}
                  onChange={(e) =>
                    setExtraConditions({
                      ...extraConditions,
                      cities: e.target.value
                        ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                        : undefined,
                    })
                  }
                />
              </KvField>
              <KvField label="上次跟進距今 ≥ N 天">
                <input
                  type="number"
                  className={inputClass}
                  placeholder="30"
                  value={extraConditions.last_contact_days_gt ?? ""}
                  onChange={(e) =>
                    setExtraConditions({
                      ...extraConditions,
                      last_contact_days_gt: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </KvField>
            </div>
          </div>

          {/* 客群人數 */}
          <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="text-[24px]">🎯</span>
            <div>
              <div className="text-[11px] text-[#185FA5]">符合條件客群</div>
              <div className="text-[20px] font-semibold text-[#1A3A5C] leading-none">
                {audienceCount} <span className="text-[12px] font-normal">位客戶</span>
              </div>
            </div>
            <div className="ml-auto text-[10.5px] text-[#185FA5] max-w-[260px] text-right">
              ℹ️ 估算僅含「已加入 LINE 官方帳號」或「已留存手機」的客戶
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#EEECE6]">
            <button
              onClick={() => setStep(1)}
              className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ← 上一步
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={selectedHabc.length === 0}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
            >
              下一步 →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 發送設定 + 預覽 */}
      {step === 3 && selectedTpl && (
        <div className="space-y-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A]">Step 3　發送設定與預覽</div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-2.5">
              <KvField label="任務名稱 *">
                <input
                  className={inputClass}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="例：5月交車客戶感謝推播"
                />
              </KvField>
              <KvField label="發送通道">
                <div className="flex items-center h-[30px] gap-2 text-[12.5px]">
                  <span
                    className="px-2 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor: PUSH_CHANNEL_BADGE[selectedTpl.channel].bg,
                      color: PUSH_CHANNEL_BADGE[selectedTpl.channel].fg,
                    }}
                  >
                    {PUSH_CHANNEL_BADGE[selectedTpl.channel].icon}{" "}
                    {PUSH_CHANNEL_LABEL[selectedTpl.channel]}
                  </span>
                  <span className="text-[#9A9890] text-[11px]">（依範本設定）</span>
                </div>
              </KvField>
              <KvField label="使用範本">
                <div className="text-[12.5px] text-[#5A5955]">
                  {selectedTpl.icon} {selectedTpl.name}
                </div>
              </KvField>
              <KvField label="目標客群">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedHabc.map((h) => (
                    <span
                      key={h}
                      className="px-1.5 py-0.5 rounded text-[11px] font-bold"
                      style={{
                        backgroundColor: HABC_BADGE[h].bg,
                        color: HABC_BADGE[h].fg,
                      }}
                    >
                      {h}
                    </span>
                  ))}
                  <span className="text-[11.5px] text-[#5A5955]">
                    （約 {audienceCount} 位）
                  </span>
                </div>
              </KvField>
              <KvField label="發送時間">
                <div className="flex items-center gap-2">
                  <select
                    className={inputClass}
                    value={scheduleMode}
                    onChange={(e) => setScheduleMode(e.target.value as "now" | "schedule")}
                  >
                    <option value="schedule">📅 排程發送</option>
                    <option value="now">⚡ 立即發送</option>
                  </select>
                  {scheduleMode === "schedule" && (
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                    />
                  )}
                </div>
              </KvField>
              <KvField label="訊息內容預覽">
                <pre className="text-[12px] text-[#5A5955] bg-[#FAFAF8] border border-[#EEECE6] rounded px-3 py-2 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedTpl.body}
                </pre>
              </KvField>
            </div>

            {/* LINE bubble 預覽 */}
            <div className="space-y-2">
              <div className={labelClass}>📱 {PUSH_CHANNEL_LABEL[selectedTpl.channel]} 預覽</div>
              {selectedTpl.channel === "sms" ? (
                <SmsPreview body={selectedTpl.body} />
              ) : (
                <LineBubblePreview
                  body={selectedTpl.body}
                  buttons={selectedTpl.buttons}
                  brandLabel={moduleLabelDefault()}
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#EEECE6]">
            <button
              onClick={() => setStep(2)}
              className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ← 上一步
            </button>
            <button
              onClick={onSubmit}
              disabled={isPending}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {isPending ? "建立中⋯" : "📤 排程發送"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function moduleLabelDefault() {
  return "indian-motorcycle";
}

function KvField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={labelClass}>{label}</div>
      {children}
    </div>
  );
}

function LineBubblePreview({
  body,
  buttons,
  brandLabel,
}: {
  body: string;
  buttons: Array<{ label: string; url: string }>;
  brandLabel: string;
}) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-xl bg-[#F0F0F0] p-3 border border-[#EEECE6]">
      {/* CRM06B：頭像 32×32 圓形 + 品牌名 */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-full bg-[#06C755] flex items-center justify-center text-white text-[14px] font-bold shadow-sm"
          aria-label="LINE 官方帳號頭像"
        >
          L
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[11.5px] font-semibold text-[#2C2C2A]">{brandLabel}</span>
          <span className="text-[9.5px] text-[#9A9890]">LINE 官方帳號</span>
        </div>
      </div>
      <div className="bg-white rounded-lg p-3 shadow-sm relative">
        <div className="text-[12.5px] text-[#2C2C2A] leading-relaxed whitespace-pre-wrap">
          {body}
        </div>
        {buttons && buttons.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-[#EEECE6] space-y-1.5">
            {buttons.map((b, i) => (
              <div
                key={i}
                className="h-[30px] flex items-center justify-center rounded text-[12px] font-medium text-[#06C755] border border-[#06C755] bg-white"
              >
                {b.label}
              </div>
            ))}
          </div>
        )}
        {/* CRM06B：時間戳 + 已讀 + 雙勾（LINE 風格） */}
        <div className="text-[10px] text-[#9A9890] mt-2 flex items-center justify-end gap-1">
          <span aria-label="已讀標記">已讀</span>
          <span className="text-[#06C755] font-bold leading-none">✓✓</span>
          <span>·</span>
          <span title="訊息送達時間">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}

function SmsPreview({ body }: { body: string }) {
  return (
    <div className="rounded-xl bg-[#F0F0F0] p-3 border border-[#EEECE6]">
      <div className="text-[11px] text-[#9A9890] mb-2 text-center">📱 SMS 簡訊預覽</div>
      <div className="bg-white rounded-lg p-3 shadow-sm">
        <div className="text-[12.5px] text-[#2C2C2A] leading-relaxed whitespace-pre-wrap">
          {body}
        </div>
        <div className="text-[10px] text-[#9A9890] mt-2 text-right">
          {new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Tab 3: Log / Deliveries
// ─────────────────────────────────────────────────────

function LogTab({
  campaigns,
  isPending,
  canEdit,
  onCancel,
  onDelete,
}: {
  campaigns: CampaignRow[];
  isPending: boolean;
  canEdit: boolean;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const columns: DataGridColumn<CampaignRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "任務名稱",
        width: 200,
        hideable: false,
        cell: (r) => (
          <button
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            className="text-left text-[#1A3A5C] hover:underline font-medium truncate"
          >
            {r.name}
          </button>
        ),
        exportValue: (r) => r.name,
        sortValue: (r) => r.name,
      },
      {
        id: "channel",
        header: "通道",
        width: 90,
        cell: (r) => {
          const b = PUSH_CHANNEL_BADGE[r.channel];
          return (
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ backgroundColor: b.bg, color: b.fg }}
            >
              {b.label}
            </span>
          );
        },
        exportValue: (r) => PUSH_CHANNEL_BADGE[r.channel].label,
        sortValue: (r) => r.channel,
      },
      {
        id: "habc",
        header: "客群",
        width: 120,
        cell: (r) => (
          <div className="flex items-center gap-1 flex-wrap">
            {r.target_habc.map((h) => {
              const b = HABC_BADGE[h as HabcLevel];
              if (!b) return null;
              return (
                <span
                  key={h}
                  className="text-[10px] font-bold px-1 py-0.5 rounded"
                  style={{ backgroundColor: b.bg, color: b.fg }}
                >
                  {h}
                </span>
              );
            })}
          </div>
        ),
        exportValue: (r) => r.target_habc.join(","),
        sortable: false,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => {
          const b = CAMPAIGN_STATUS_BADGE[r.status];
          return (
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ backgroundColor: b.bg, color: b.fg }}
            >
              {CAMPAIGN_STATUS_LABEL[r.status]}
            </span>
          );
        },
        exportValue: (r) => CAMPAIGN_STATUS_LABEL[r.status],
        sortValue: (r) => r.status,
      },
      {
        id: "audience",
        header: "目標數",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono">{r.audience_count}</span>,
        exportValue: (r) => String(r.audience_count),
        sortValue: (r) => r.audience_count,
      },
      {
        id: "sent",
        header: "已送/已讀",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#185FA5]">
            {r.sent_count} / {r.read_count}
          </span>
        ),
        exportValue: (r) => `${r.sent_count}/${r.read_count}`,
        sortValue: (r) => r.sent_count,
      },
      {
        id: "open_rate",
        header: "開啟率",
        width: 80,
        align: "right",
        cell: (r) => (
          <span className="font-mono font-semibold text-[#2D7D32]">
            {r.sent_count > 0 ? Math.round((r.read_count / r.sent_count) * 100) : 0}%
          </span>
        ),
        exportValue: (r) =>
          r.sent_count > 0 ? String(Math.round((r.read_count / r.sent_count) * 100)) : "0",
        sortValue: (r) => (r.sent_count > 0 ? r.read_count / r.sent_count : 0),
      },
      {
        id: "convert",
        header: "轉成交",
        width: 80,
        align: "right",
        cell: (r) => <span className="font-mono">{r.convert_count}</span>,
        exportValue: (r) => String(r.convert_count),
        sortValue: (r) => r.convert_count,
      },
      {
        id: "time",
        header: "發送時間",
        width: 140,
        cell: (r) => (
          <span className="text-[11.5px] text-[#5A5955]">
            {r.sent_at
              ? new Date(r.sent_at).toLocaleString("zh-TW", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : r.scheduled_at
                ? `📅 ${new Date(r.scheduled_at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : "—"}
          </span>
        ),
        exportValue: (r) => r.sent_at ?? r.scheduled_at ?? "",
        sortValue: (r) => r.sent_at ?? r.scheduled_at ?? "",
      },
    ],
    [expanded],
  );

  const expandedRow = expanded ? campaigns.find((c) => c.id === expanded) : null;

  return (
    <div className="space-y-3">
      <DataGrid
        columns={columns}
        data={campaigns}
        rowKey={(r) => r.id}
        persistKey="crm/sales/push-notifications/log"
        exportFileName="push-campaigns"
        emptyMessage="尚無推播任務"
        disabled={isPending}
        rowActionsWidth={canEdit ? 150 : undefined}
        rowActions={
          canEdit
            ? (r) => (
                <div className="flex items-center gap-1">
                  {(r.status === "draft" || r.status === "scheduled") && (
                    <button
                      onClick={() => onCancel(r.id)}
                      className="h-[26px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      取消
                    </button>
                  )}
                  {r.status !== "sending" && (
                    <button
                      onClick={() => onDelete(r.id)}
                      className="h-[26px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    >
                      刪除
                    </button>
                  )}
                </div>
              )
            : undefined
        }
      />
      {expandedRow && <CampaignDetail row={expandedRow} onClose={() => setExpanded(null)} />}
    </div>
  );
}

function CampaignDetail({ row, onClose }: { row: CampaignRow; onClose: () => void }) {
  const openRate = row.sent_count > 0 ? Math.round((row.read_count / row.sent_count) * 100) : 0;
  const clickRate = row.sent_count > 0 ? Math.round((row.click_count / row.sent_count) * 100) : 0;
  const convertRate = row.sent_count > 0 ? Math.round((row.convert_count / row.sent_count) * 100) : 0;

  const stats: Array<{ label: string; n: number; rate?: number; color: string }> = [
    { label: "已送達", n: row.sent_count, color: "#1A3A5C" },
    { label: "已讀/開啟", n: row.read_count, rate: openRate, color: "#185FA5" },
    { label: "點擊", n: row.click_count, rate: clickRate, color: "#854F0B" },
    { label: "轉成交", n: row.convert_count, rate: convertRate, color: "#2D7D32" },
  ];

  const maxN = Math.max(1, ...stats.map((s) => s.n));

  return (
    <section className="bg-[#FAFAF8] border border-[#EEECE6] rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">📊 {row.name}</div>
          <div className="text-[11px] text-[#9A9890] mt-0.5">
            {row.template_name ?? "（無對應範本）"} ·{" "}
            {row.sent_at
              ? `發送於 ${new Date(row.sent_at).toLocaleString("zh-TW")}`
              : "未發送"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="h-[26px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          收合
        </button>
      </div>

      {/* 自製 Bar 圖（不引 recharts、避免新依賴） */}
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-[68px] text-[11.5px] text-[#5A5955]">{s.label}</div>
            <div className="flex-1 bg-white border border-[#EEECE6] rounded h-6 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{
                  width: `${(s.n / maxN) * 100}%`,
                  backgroundColor: s.color,
                  opacity: 0.85,
                }}
              />
              <div className="absolute inset-0 flex items-center px-2 text-[11.5px] font-semibold text-white drop-shadow">
                {s.n} {s.rate !== undefined && <span className="ml-1.5 opacity-90">({s.rate}%)</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#EEECE6]">
        <KvBlock label="訊息內容" value={row.message_body} pre />
        <KvBlock
          label="目標客群"
          value={
            <div className="flex items-center gap-1.5 flex-wrap">
              {row.target_habc.map((h) => {
                const b = HABC_BADGE[h as HabcLevel];
                if (!b) return null;
                return (
                  <span
                    key={h}
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: b.bg, color: b.fg }}
                  >
                    {h} - {b.desc}
                  </span>
                );
              })}
              {Object.keys(row.extra_conditions).length > 0 && (
                <span className="text-[10.5px] text-[#9A9890] block w-full mt-1">
                  附加條件：{JSON.stringify(row.extra_conditions)}
                </span>
              )}
            </div>
          }
        />
      </div>
    </section>
  );
}

function KvBlock({
  label,
  value,
  pre = false,
}: {
  label: string;
  value: React.ReactNode;
  pre?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890] font-medium mb-1">{label}</div>
      {pre ? (
        <pre className="text-[12px] text-[#5A5955] bg-white border border-[#EEECE6] rounded px-3 py-2 leading-relaxed whitespace-pre-wrap font-sans">
          {value}
        </pre>
      ) : (
        <div className="text-[12.5px] text-[#2C2C2A]">{value}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 範本 Modal
// ─────────────────────────────────────────────────────

function TemplateModal({
  mode,
  initial,
  onClose,
  onSubmit,
  isPending,
}: {
  mode: "create" | "edit";
  initial: PushTemplateRow | null;
  onClose: () => void;
  onSubmit: (input: {
    category: string;
    name: string;
    channel: PushChannel;
    icon: string;
    body: string;
  }) => void;
  isPending: boolean;
}) {
  const [category, setCategory] = useState<string>(initial?.category ?? PUSH_TEMPLATE_CATEGORIES[0]);
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [channel, setChannel] = useState<PushChannel>(initial?.channel ?? "line");
  const [icon, setIcon] = useState<string>(initial?.icon ?? "");
  const [body, setBody] = useState<string>(initial?.body ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[560px] max-w-[95vw] max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#2C2C2A]">
            {mode === "create" ? "＋ 新增範本" : "編輯範本"}
          </div>
          <button
            onClick={onClose}
            className="h-[24px] w-[24px] flex items-center justify-center rounded text-[#9A9890] hover:bg-[#F2F2F2]"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <KvField label="分類 *">
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {PUSH_TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PUSH_TEMPLATE_CATEGORY_ICON[c]} {c}
                  </option>
                ))}
              </select>
            </KvField>
            <KvField label="通道 *">
              <select
                className={inputClass}
                value={channel}
                onChange={(e) => setChannel(e.target.value as PushChannel)}
              >
                <option value="line">💬 LINE</option>
                <option value="sms">📱 簡訊</option>
                <option value="email">📧 Email</option>
                <option value="both">💬📱 雙通道</option>
              </select>
            </KvField>
          </div>
          <KvField label="範本名稱 *">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：交車慶賀感謝"
            />
          </KvField>
          <KvField label="Icon (emoji)">
            <input
              className={inputClass}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🎉"
              maxLength={4}
            />
          </KvField>
          <KvField label="訊息內容 *（{{變數}} 會在發送時取代）">
            <textarea
              className="min-h-[140px] border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="{{姓名}} 您好！..."
            />
          </KvField>
        </div>

        <div className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit({ category, name, channel, icon, body })}
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : mode === "create" ? "建立範本" : "儲存變更"}
          </button>
        </div>
      </div>
    </div>
  );
}
