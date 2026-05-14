"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  updateWarrantyFlowConfig,
  createFlowStep,
  updateFlowStep,
  deleteFlowStep,
  createClaimType,
  updateClaimType,
  deleteClaimType,
  upsertTimingRule,
  deleteTimingRule,
  type FlowConfigRow,
  type FlowStepRow,
  type ClaimTypeRow,
  type TimingRuleWithType,
} from "@/domain/warranty";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const ACCENT_MAP: Record<string, { bg: string; border: string; text: string; label: string }> = {
  navy:  { bg: "bg-[#EAF4FB]", border: "border-[#B5D4F4]", text: "text-[#1A3A5C]", label: "深藍" },
  teal:  { bg: "bg-[#E8F5F0]", border: "border-[#9FD4C4]", text: "text-[#0F6E56]", label: "綠色" },
  amber: { bg: "bg-[#FDF3E3]", border: "border-[#F0C97E]", text: "text-[#854F0B]", label: "橘色" },
  red:   { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", text: "text-[#CC0000]", label: "紅色" },
};

const QUICK_LINKS = [
  { label: "→ 舊件出入庫邏輯設定", href: "/parts/warranty/used-parts-flow" },
  { label: "→ 暫存倉設定", href: "/parts/warranty/staging-warehouse" },
  { label: "→ RO 工單串接設定", href: "/parts/warranty/ro-link" },
  { label: "→ 索賠費用回收追蹤", href: "/parts/warranty/cost-recovery" },
  { label: "→ 舊件管理介面", href: "/parts/warranty/used-parts" },
];

type Banner = { ok: boolean; msg: string } | null;

type StepFormState = {
  mode: "create" | "edit";
  id?: string;
  step_no: number;
  title: string;
  description: string;
  is_terminal: boolean;
};

type TypeFormState = {
  mode: "create" | "edit";
  id?: string;
  code: string;
  label: string;
  icon: string;
  description: string;
  accent: string;
};

type TimingFormState = {
  mode: "create" | "edit";
  id?: string;
  claim_type_id: string;
  apply_window: string;
  storage_rule: string;
  close_goal_days: number;
};

export function WarrantyFlowBoard({
  config,
  steps,
  claimTypes,
  timingRules,
  canEdit,
}: {
  config: FlowConfigRow;
  steps: FlowStepRow[];
  claimTypes: ClaimTypeRow[];
  timingRules: TimingRuleWithType[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [bannerText, setBannerText] = useState(config.banner_text);
  const [bannerEnabled, setBannerEnabled] = useState(config.banner_enabled);

  const [stepForm, setStepForm] = useState<StepFormState | null>(null);
  const [typeForm, setTypeForm] = useState<TypeFormState | null>(null);
  const [timingForm, setTimingForm] = useState<TimingFormState | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  function saveConfig() {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateWarrantyFlowConfig({
        banner_text: bannerText,
        banner_enabled: bannerEnabled,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存 banner" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }

  // Step columns
  const stepColumns = useMemo<DataGridColumn<FlowStepRow>[]>(
    () => [
      {
        id: "step_no",
        header: "順序",
        width: 70,
        hideable: false,
        cell: (r) => (
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white ${
              r.is_terminal ? "bg-[#0F6E56]" : "bg-[#1A3A5C]"
            }`}
          >
            {r.step_no}
          </span>
        ),
        exportValue: (r) => String(r.step_no),
        sortValue: (r) => r.step_no,
      },
      {
        id: "title",
        header: "步驟名稱",
        width: 220,
        cell: (r) => (
          <span className="font-semibold text-[#2C2C2A]">{r.title}</span>
        ),
        exportValue: (r) => r.title,
        sortValue: (r) => r.title,
      },
      {
        id: "description",
        header: "說明",
        cell: (r) => <span className="text-[#5A5955]">{r.description}</span>,
        exportValue: (r) => r.description,
      },
      {
        id: "is_terminal",
        header: "結案步驟",
        width: 90,
        cell: (r) =>
          r.is_terminal ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
              是
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        sortValue: (r) => (r.is_terminal ? 1 : 0),
        exportValue: (r) => (r.is_terminal ? "是" : ""),
      },
      {
        id: "status",
        header: "狀態",
        width: 80,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        sortValue: (r) => (r.is_active ? 1 : 0),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      },
    ],
    [],
  );

  function openStepCreate() {
    setStepForm({
      mode: "create",
      step_no: (steps[steps.length - 1]?.step_no ?? 0) + 1,
      title: "",
      description: "",
      is_terminal: false,
    });
  }
  function openStepEdit(r: FlowStepRow) {
    setStepForm({
      mode: "edit",
      id: r.id,
      step_no: r.step_no,
      title: r.title,
      description: r.description,
      is_terminal: r.is_terminal,
    });
  }
  function submitStep() {
    if (!stepForm) return;
    startTransition(async () => {
      const res =
        stepForm.mode === "create"
          ? await createFlowStep({
              step_no: stepForm.step_no,
              title: stepForm.title,
              description: stepForm.description,
              is_terminal: stepForm.is_terminal,
            })
          : await updateFlowStep(stepForm.id!, {
              step_no: stepForm.step_no,
              title: stepForm.title,
              description: stepForm.description,
              is_terminal: stepForm.is_terminal,
            });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: stepForm.mode === "create" ? "✓ 已建立步驟" : "✓ 已更新步驟",
        });
        setStepForm(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function toggleStepActive(r: FlowStepRow) {
    startTransition(async () => {
      const res = await updateFlowStep(r.id, { is_active: !r.is_active });
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用步驟" : "✓ 已啟用步驟" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function removeStep(r: FlowStepRow) {
    if (!confirm(`刪除步驟「${r.step_no}. ${r.title}」？`)) return;
    startTransition(async () => {
      const res = await deleteFlowStep(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除步驟" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }

  // Claim type columns
  const typeColumns = useMemo<DataGridColumn<ClaimTypeRow>[]>(
    () => [
      {
        id: "code",
        header: "代碼",
        width: 110,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C]">{r.code}</span>
        ),
        exportValue: (r) => r.code,
        sortValue: (r) => r.code,
      },
      {
        id: "label",
        header: "名稱",
        width: 200,
        cell: (r) => {
          const a = ACCENT_MAP[r.accent] ?? ACCENT_MAP.navy;
          return (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] border ${a.bg} ${a.border} ${a.text}`}
            >
              <span>{r.icon}</span>
              <span className="font-semibold">{r.label}</span>
            </span>
          );
        },
        exportValue: (r) => r.label,
        sortValue: (r) => r.label,
      },
      {
        id: "description",
        header: "說明",
        cell: (r) => <span className="text-[#5A5955]">{r.description}</span>,
        exportValue: (r) => r.description,
      },
      {
        id: "accent",
        header: "色票",
        width: 90,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">
            {ACCENT_MAP[r.accent]?.label ?? r.accent}
          </span>
        ),
        exportValue: (r) => r.accent,
        sortValue: (r) => r.accent,
      },
      {
        id: "status",
        header: "狀態",
        width: 80,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        sortValue: (r) => (r.is_active ? 1 : 0),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      },
    ],
    [],
  );

  function openTypeCreate() {
    setTypeForm({
      mode: "create",
      code: "",
      label: "",
      icon: "🛡",
      description: "",
      accent: "navy",
    });
  }
  function openTypeEdit(r: ClaimTypeRow) {
    setTypeForm({
      mode: "edit",
      id: r.id,
      code: r.code,
      label: r.label,
      icon: r.icon,
      description: r.description,
      accent: r.accent,
    });
  }
  function submitType() {
    if (!typeForm) return;
    startTransition(async () => {
      const res =
        typeForm.mode === "create"
          ? await createClaimType({
              code: typeForm.code,
              label: typeForm.label,
              icon: typeForm.icon,
              description: typeForm.description,
              accent: typeForm.accent,
            })
          : await updateClaimType(typeForm.id!, {
              code: typeForm.code,
              label: typeForm.label,
              icon: typeForm.icon,
              description: typeForm.description,
              accent: typeForm.accent,
            });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: typeForm.mode === "create" ? "✓ 已建立類型" : "✓ 已更新類型",
        });
        setTypeForm(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function toggleTypeActive(r: ClaimTypeRow) {
    startTransition(async () => {
      const res = await updateClaimType(r.id, { is_active: !r.is_active });
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用類型" : "✓ 已啟用類型" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function removeType(r: ClaimTypeRow) {
    if (!confirm(`刪除類型「${r.code}」？相關時效規定會一併刪除。`)) return;
    startTransition(async () => {
      const res = await deleteClaimType(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除類型" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }

  // Timing columns
  const timingColumns = useMemo<DataGridColumn<TimingRuleWithType>[]>(
    () => [
      {
        id: "claim_type",
        header: "索賠類型",
        width: 180,
        hideable: false,
        cell: (r) => (
          <span className="font-semibold text-[#2C2C2A]">{r.claim_type_label}</span>
        ),
        exportValue: (r) => r.claim_type_label,
        sortValue: (r) => r.claim_type_label,
      },
      {
        id: "apply_window",
        header: "申請期限",
        cell: (r) => r.apply_window || "—",
        exportValue: (r) => r.apply_window,
      },
      {
        id: "storage_rule",
        header: "舊件保存",
        cell: (r) => (
          <span className="text-[#5A5955]">{r.storage_rule || "—"}</span>
        ),
        exportValue: (r) => r.storage_rule,
      },
      {
        id: "close_goal_days",
        header: "結案目標",
        width: 110,
        cell: (r) => {
          const fast = r.close_goal_days <= 45;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                fast
                  ? "bg-[#EAF3DE] text-[#3B6D11]"
                  : "bg-[#FDF3E3] text-[#854F0B]"
              }`}
            >
              {r.close_goal_days} 天
            </span>
          );
        },
        exportValue: (r) => `${r.close_goal_days} 天`,
        sortValue: (r) => r.close_goal_days,
      },
    ],
    [],
  );

  function openTimingCreate() {
    // 找一個還沒設定時效的 claim type 當預設
    const usedTypeIds = new Set(timingRules.map((t) => t.claim_type_id));
    const firstFree = claimTypes.find((t) => !usedTypeIds.has(t.id));
    setTimingForm({
      mode: "create",
      claim_type_id: firstFree?.id ?? claimTypes[0]?.id ?? "",
      apply_window: "",
      storage_rule: "",
      close_goal_days: 60,
    });
  }
  function openTimingEdit(r: TimingRuleWithType) {
    setTimingForm({
      mode: "edit",
      id: r.id,
      claim_type_id: r.claim_type_id,
      apply_window: r.apply_window,
      storage_rule: r.storage_rule,
      close_goal_days: r.close_goal_days,
    });
  }
  function submitTiming() {
    if (!timingForm) return;
    if (!timingForm.claim_type_id) {
      showBanner({ ok: false, msg: "索賠類型必選" });
      return;
    }
    startTransition(async () => {
      const res = await upsertTimingRule({
        claim_type_id: timingForm.claim_type_id,
        apply_window: timingForm.apply_window,
        storage_rule: timingForm.storage_rule,
        close_goal_days: timingForm.close_goal_days,
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: timingForm.mode === "create" ? "✓ 已建立時效" : "✓ 已更新時效",
        });
        setTimingForm(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }
  function removeTiming(r: TimingRuleWithType) {
    if (!confirm(`刪除「${r.claim_type_label}」的時效規定？`)) return;
    startTransition(async () => {
      const res = await deleteTimingRule(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除時效" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">索賠流程說明</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          保固零件索賠端對端流程 / 類型定義 / 時效規定
        </span>
      </header>

      {banner ? (
        <div
          data-testid="warranty-flow-banner"
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Banner config */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">⚠️ 頂部說明 Banner</h2>
          <label className="flex items-center gap-1.5 text-[11.5px] text-[#5A5955]">
            <input
              type="checkbox"
              disabled={!canEdit || isPending}
              checked={bannerEnabled}
              onChange={(e) => setBannerEnabled(e.target.checked)}
            />
            顯示 banner
          </label>
        </header>
        <div className="px-4 py-3 space-y-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Banner 文字</label>
            <textarea
              data-testid="banner-text"
              disabled={!canEdit || isPending}
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              rows={2}
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
            />
          </div>
          {bannerEnabled ? (
            <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-3 py-2 text-[12px] text-[#854F0B]">
              預覽：{bannerText}
            </div>
          ) : null}
          <div className="flex justify-end">
            <button
              data-testid="banner-save"
              type="button"
              disabled={!canEdit || isPending}
              onClick={saveConfig}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "儲存中⋯" : "儲存 Banner"}
            </button>
          </div>
        </div>
      </section>

      {/* Flow steps */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📋 索賠流程步驟（{steps.length}）</h2>
          <button
            data-testid="step-create-open"
            type="button"
            disabled={!canEdit || isPending}
            onClick={openStepCreate}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增步驟
          </button>
        </header>
        <div className="p-3">
          <DataGrid
            columns={stepColumns}
            data={steps}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/flow/steps"
            exportFileName="warranty-flow-steps"
            emptyMessage="尚未設定任何步驟"
            disabled={isPending}
            rowActionsWidth={220}
            rowActions={(r) => (
              <>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openStepEdit(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleStepActive(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {r.is_active ? "停用" : "啟用"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeStep(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </div>
      </section>

      {/* Claim types */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔑 索賠類型定義（{claimTypes.length}）</h2>
          <button
            data-testid="type-create-open"
            type="button"
            disabled={!canEdit || isPending}
            onClick={openTypeCreate}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增類型
          </button>
        </header>
        <div className="p-3">
          <DataGrid
            columns={typeColumns}
            data={claimTypes}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/flow/claim-types"
            exportFileName="warranty-claim-types"
            emptyMessage="尚未設定任何索賠類型"
            disabled={isPending}
            rowActionsWidth={220}
            rowActions={(r) => (
              <>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openTypeEdit(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleTypeActive(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {r.is_active ? "停用" : "啟用"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeType(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </div>
      </section>

      {/* Timing rules */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">⏱ 時效規定（{timingRules.length}）</h2>
          <button
            data-testid="timing-create-open"
            type="button"
            disabled={!canEdit || isPending || claimTypes.length === 0}
            onClick={openTimingCreate}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增時效
          </button>
        </header>
        <div className="p-3">
          <DataGrid
            columns={timingColumns}
            data={timingRules}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/flow/timing-rules"
            exportFileName="warranty-timing-rules"
            emptyMessage="尚未設定任何時效規定"
            disabled={isPending}
            rowActionsWidth={150}
            rowActions={(r) => (
              <>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openTimingEdit(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  編輯
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeTiming(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔗 相關頁面快速跳轉</h2>
        </header>
        <div className="px-3 py-3 flex gap-2 flex-wrap">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Step modal */}
      {stepForm ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {stepForm.mode === "create" ? "新增流程步驟" : "編輯流程步驟"}
              </h3>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>步驟編號</label>
                <input
                  data-testid="step-form-step-no"
                  type="number"
                  min={1}
                  value={stepForm.step_no}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, step_no: Number(e.target.value) || 1 })
                  }
                  className={`${inputClass} w-[110px]`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>步驟名稱</label>
                <input
                  data-testid="step-form-title"
                  type="text"
                  value={stepForm.title}
                  onChange={(e) => setStepForm({ ...stepForm, title: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>說明</label>
                <textarea
                  data-testid="step-form-description"
                  rows={3}
                  value={stepForm.description}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, description: e.target.value })
                  }
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={stepForm.is_terminal}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, is_terminal: e.target.checked })
                  }
                />
                結案步驟（用綠色顯示）
              </label>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setStepForm(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                data-testid="step-form-submit"
                type="button"
                disabled={isPending}
                onClick={submitStep}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? stepForm.mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : stepForm.mode === "create"
                    ? "建立"
                    : "儲存"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Type modal */}
      {typeForm ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {typeForm.mode === "create" ? "新增索賠類型" : "編輯索賠類型"}
              </h3>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>代碼（英文大寫）</label>
                  <input
                    data-testid="type-form-code"
                    type="text"
                    value={typeForm.code}
                    onChange={(e) =>
                      setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })
                    }
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>Icon (emoji)</label>
                  <input
                    type="text"
                    value={typeForm.icon}
                    onChange={(e) => setTypeForm({ ...typeForm, icon: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>顯示名稱</label>
                <input
                  data-testid="type-form-label"
                  type="text"
                  value={typeForm.label}
                  onChange={(e) => setTypeForm({ ...typeForm, label: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>說明</label>
                <textarea
                  rows={3}
                  value={typeForm.description}
                  onChange={(e) =>
                    setTypeForm({ ...typeForm, description: e.target.value })
                  }
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>色票</label>
                <select
                  value={typeForm.accent}
                  onChange={(e) => setTypeForm({ ...typeForm, accent: e.target.value })}
                  className={inputClass}
                >
                  <option value="navy">深藍 (navy)</option>
                  <option value="teal">綠色 (teal)</option>
                  <option value="amber">橘色 (amber)</option>
                  <option value="red">紅色 (red)</option>
                </select>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setTypeForm(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                data-testid="type-form-submit"
                type="button"
                disabled={isPending}
                onClick={submitType}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? typeForm.mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : typeForm.mode === "create"
                    ? "建立"
                    : "儲存"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Timing modal */}
      {timingForm ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {timingForm.mode === "create" ? "新增時效規定" : "編輯時效規定"}
              </h3>
            </header>
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>索賠類型</label>
                <select
                  data-testid="timing-form-claim-type"
                  value={timingForm.claim_type_id}
                  disabled={timingForm.mode === "edit"}
                  onChange={(e) =>
                    setTimingForm({ ...timingForm, claim_type_id: e.target.value })
                  }
                  className={inputClass}
                >
                  {claimTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>申請期限（描述）</label>
                <input
                  data-testid="timing-form-apply"
                  type="text"
                  value={timingForm.apply_window}
                  onChange={(e) =>
                    setTimingForm({ ...timingForm, apply_window: e.target.value })
                  }
                  placeholder="例：維修完成後 30 天"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>舊件保存規則（描述）</label>
                <input
                  type="text"
                  value={timingForm.storage_rule}
                  onChange={(e) =>
                    setTimingForm({ ...timingForm, storage_rule: e.target.value })
                  }
                  placeholder="例：核准前不得處置"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>結案目標（天數）</label>
                <input
                  data-testid="timing-form-goal"
                  type="number"
                  min={0}
                  value={timingForm.close_goal_days}
                  onChange={(e) =>
                    setTimingForm({
                      ...timingForm,
                      close_goal_days: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className={`${inputClass} w-[120px]`}
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setTimingForm(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                data-testid="timing-form-submit"
                type="button"
                disabled={isPending}
                onClick={submitTiming}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? timingForm.mode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : timingForm.mode === "create"
                    ? "建立"
                    : "儲存"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
