"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  saveCountToleranceRule,
  createCountWorkflowAction,
  updateCountWorkflowAction,
  setCountWorkflowActiveAction,
  deleteCountWorkflowAction,
} from "@/domain/rules";
import type {
  BusinessRuleRow,
  CountToleranceConfig,
  CountWorkflowConfig,
  CountWorkflowInput,
} from "@/domain/rules";
import { KpiCard } from "@/components/visualization";

type Banner = { ok: boolean; msg: string } | null;

type WorkflowFormState = {
  id?: string;
  category: CountWorkflowInput["category"];
  label: string;
  description: string;
  tone: CountWorkflowInput["tone"];
  badge_label: string;
  badge_kind: CountWorkflowInput["badge_kind"];
};

const CATEGORY_OPTIONS: Array<{ value: CountWorkflowInput["category"]; label: string }> = [
  { value: "within", label: "差異在容許率內" },
  { value: "overflow", label: "差異超過容許率" },
  { value: "a_class_force", label: "A 類強制審核" },
];

const TONE_OPTIONS: Array<{ value: CountWorkflowInput["tone"]; label: string }> = [
  { value: "neutral", label: "中性（綠／灰底）" },
  { value: "amber", label: "提醒（amber）" },
  { value: "red", label: "嚴重（red）" },
];

const BADGE_OPTIONS: Array<{ value: CountWorkflowInput["badge_kind"]; label: string }> = [
  { value: "teal", label: "自動回傳（teal）" },
  { value: "pend", label: "等待審核（amber）" },
  { value: "red", label: "強制審核（red）" },
];

function parsePct(input: string): number | null {
  const trimmed = input.trim().replace(/%/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0%";
  return `${n}%`;
}

function emptyWorkflowForm(): WorkflowFormState {
  return {
    category: "within",
    label: "",
    description: "",
    tone: "neutral",
    badge_label: "",
    badge_kind: "teal",
  };
}

function rowToForm(row: BusinessRuleRow): WorkflowFormState {
  const cfg = (row.config ?? {}) as Partial<CountWorkflowConfig>;
  return {
    id: row.id,
    category: (cfg.category ?? "within") as WorkflowFormState["category"],
    label: cfg.label ?? "",
    description: cfg.description ?? "",
    tone: (cfg.tone ?? "neutral") as WorkflowFormState["tone"],
    badge_label: cfg.badge?.label ?? "",
    badge_kind: (cfg.badge?.kind ?? "teal") as WorkflowFormState["badge_kind"],
  };
}

export function CountRulesBoard({
  toleranceRule,
  workflowRules,
  canEdit,
}: {
  toleranceRule: BusinessRuleRow | null;
  workflowRules: BusinessRuleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const initial = (toleranceRule?.config ?? {
    abc_tolerance_pcts: { A: 0, B: 2, C: 5 },
  }) as CountToleranceConfig;

  const [pcts, setPcts] = useState({
    A: formatPct(initial.abc_tolerance_pcts?.A),
    B: formatPct(initial.abc_tolerance_pcts?.B),
    C: formatPct(initial.abc_tolerance_pcts?.C),
  });

  const initialPctSig = useMemo(
    () =>
      `${formatPct(initial.abc_tolerance_pcts?.A)}|${formatPct(initial.abc_tolerance_pcts?.B)}|${formatPct(initial.abc_tolerance_pcts?.C)}`,
    [initial.abc_tolerance_pcts?.A, initial.abc_tolerance_pcts?.B, initial.abc_tolerance_pcts?.C],
  );
  const currentPctSig = `${pcts.A}|${pcts.B}|${pcts.C}`;
  const pctsDirty = initialPctSig !== currentPctSig;

  // KPI 計算
  const kpi = useMemo(() => {
    const total = workflowRules.length;
    const active = workflowRules.filter((r) => r.is_active).length;
    const aPct = initial.abc_tolerance_pcts?.A ?? 0;
    const bPct = initial.abc_tolerance_pcts?.B ?? 0;
    const cPct = initial.abc_tolerance_pcts?.C ?? 0;
    const avgPct = Math.round(((aPct + bPct + cPct) / 3) * 10) / 10;
    const forced = workflowRules.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<CountWorkflowConfig>;
      return cfg.badge?.kind === "red" && r.is_active;
    }).length;
    return { total, active, avgPct, forced };
  }, [workflowRules, initial.abc_tolerance_pcts?.A, initial.abc_tolerance_pcts?.B, initial.abc_tolerance_pcts?.C]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState<WorkflowFormState>(emptyWorkflowForm());
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [modalError, setModalError] = useState<string | null>(null);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleSaveTolerance() {
    setBanner(null);
    const a = parsePct(pcts.A);
    const b = parsePct(pcts.B);
    const c = parsePct(pcts.C);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) {
      showBanner({ ok: false, msg: "容許率必須是 0–100 之間的數字（可加 %）" });
      return;
    }
    startTransition(async () => {
      const res = await saveCountToleranceRule({
        abc_tolerance_pcts: { A: a ?? 0, B: b ?? 0, C: c ?? 0 },
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "已儲存容許率設定" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function openCreate() {
    setModalMode("create");
    setModalForm(emptyWorkflowForm());
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(row: BusinessRuleRow) {
    setModalMode("edit");
    setModalForm(rowToForm(row));
    setModalError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (isPending) return;
    setModalOpen(false);
    setModalError(null);
  }

  function handleModalSubmit() {
    setModalError(null);
    const input: CountWorkflowInput = {
      category: modalForm.category,
      label: modalForm.label,
      description: modalForm.description,
      tone: modalForm.tone,
      badge_label: modalForm.badge_label,
      badge_kind: modalForm.badge_kind,
    };
    startTransition(async () => {
      const res =
        modalMode === "create"
          ? await createCountWorkflowAction(input)
          : await updateCountWorkflowAction(modalForm.id!, input);
      if (res.ok) {
        setModalOpen(false);
        showBanner({
          ok: true,
          msg: modalMode === "create" ? "已新增審核流程規則" : "已更新審核流程規則",
        });
        router.refresh();
      } else {
        setModalError(res.error);
      }
    });
  }

  function handleToggleActive(row: BusinessRuleRow) {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setCountWorkflowActiveAction(row.id, !row.is_active);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: row.is_active ? "已停用此規則" : "已啟用此規則",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete(row: BusinessRuleRow) {
    if (!canEdit) return;
    const cfg = (row.config ?? {}) as Partial<CountWorkflowConfig>;
    if (!confirm(`確定要刪除「${cfg.label ?? "未命名"}」這條規則？`)) return;
    startTransition(async () => {
      const res = await deleteCountWorkflowAction(row.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "已刪除規則" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
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

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">盤點回傳規則</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定盤點差異的審核流程與自動回傳規則
        </span>
        {pctsDirty && (
          <span className="ml-2 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            容許率有未儲存的變更
          </span>
        )}
        {!canEdit && (
          <span className="ml-2 px-2 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68] font-medium">
            僅檢視（無編輯權限）
          </span>
        )}
      </header>

      {/* KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="總規則數"
          value={kpi.total}
          tone="blue"
          icon={<span className="text-[18px]">📋</span>}
        />
        <KpiCard
          label="啟用中"
          value={`${kpi.active} / ${kpi.total}`}
          tone={kpi.active === kpi.total && kpi.total > 0 ? "green" : "amber"}
          icon={<span className="text-[18px]">✓</span>}
        />
        <KpiCard
          label="平均容許率"
          value={`${kpi.avgPct}%`}
          tone={kpi.avgPct <= 3 ? "teal" : kpi.avgPct <= 6 ? "amber" : "red"}
          icon={<span className="text-[18px]">📊</span>}
        />
        <KpiCard
          label="強制審核情境"
          value={kpi.forced}
          tone={kpi.forced > 0 ? "red" : "gray"}
          icon={<span className="text-[18px]">⚠</span>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左卡：差異容許區間 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              差異容許區間設定
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveTolerance}
                disabled={isPending || !pctsDirty}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "儲存中⋯" : "儲存"}
              </button>
            )}
          </header>
          <div className="px-4 py-4 flex flex-col gap-3">
            {(["A", "B", "C"] as const).map((cls) => {
              const labelMap: Record<typeof cls, string> = {
                A: "A 類商品（高價）差異容許率",
                B: "B 類商品（中價）差異容許率",
                C: "C 類商品（耗材）差異容許率",
              };
              return (
                <div key={cls} className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    {labelMap[cls]}
                  </label>
                  <input
                    type="text"
                    value={pcts[cls]}
                    onChange={(e) =>
                      setPcts((prev) => ({ ...prev, [cls]: e.target.value }))
                    }
                    disabled={!canEdit}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2.5 font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4] disabled:cursor-not-allowed"
                  />
                </div>
              );
            })}
            <div className="px-3 py-2.5 bg-[#FDF3E3] rounded-md text-[12px] text-[#854F0B]">
              ⚠ 超過容許率的差異項目將進入審核流程，不會自動回傳
            </div>
          </div>
        </section>

        {/* 右卡：審核流程規則（可編輯） */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              審核流程設定（{workflowRules.length}）
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={openCreate}
                disabled={isPending}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增規則
              </button>
            )}
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {workflowRules.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-[#9A9890] border border-dashed border-[#D5D3CB] rounded-md bg-[#F8F7F4]">
                尚無審核流程規則
                {canEdit && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={openCreate}
                      className="text-[#185FA5] hover:underline"
                    >
                      點此新增第一條規則
                    </button>
                  </div>
                )}
              </div>
            ) : (
              workflowRules.map((rule) => {
                const cfg = (rule.config ?? {}) as Partial<CountWorkflowConfig>;
                const tone = cfg.tone ?? "neutral";
                const inactive = !rule.is_active;
                const card =
                  inactive
                    ? "bg-[#F8F7F4] border border-[#EEECE6] opacity-60"
                    : tone === "amber"
                      ? "bg-[#FDF3E3] border border-[#FAC775]"
                      : tone === "red"
                        ? "bg-[#FDECEA] border border-[#F5AEAD]"
                        : "bg-[#EAF3DE] border border-[#C5DC9F]";
                const titleColor =
                  inactive
                    ? "text-[#5A5955]"
                    : tone === "amber"
                      ? "text-[#854F0B]"
                      : tone === "red"
                        ? "text-[#CC0000]"
                        : "text-[#3B6D11]";
                const badge = cfg.badge;
                const badgeClass = badge
                  ? badge.kind === "teal"
                    ? "bg-[#E8F5F0] text-[#0F6E56]"
                    : badge.kind === "pend"
                      ? "bg-[#FDF3E3] text-[#854F0B]"
                      : "bg-[#FDECEA] text-[#CC0000]"
                  : "";
                return (
                  <div key={rule.id} className={`px-3 py-2.5 rounded-md ${card}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12.5px] font-semibold mb-1 ${titleColor}`}>
                          {cfg.label ?? "（未命名）"}
                          {inactive && (
                            <span className="ml-2 text-[11px] font-normal text-[#9A9890]">
                              （已停用）
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-[#5A5955]">
                          {cfg.description ?? "—"}
                        </div>
                        {badge && (
                          <div className="mt-2">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${badgeClass}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(rule)}
                            disabled={isPending}
                            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(rule)}
                            disabled={isPending}
                            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                          >
                            {rule.is_active ? "停用" : "啟用"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rule)}
                            disabled={isPending}
                            className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                          >
                            刪除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Modal — 新增 / 編輯 workflow rule */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4"
          onClick={closeModal}
        >
          <div
            className="bg-white border border-[#EEECE6] rounded-lg shadow-xl w-full max-w-[480px]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#2C2C2A]">
                {modalMode === "create" ? "新增審核流程規則" : "編輯審核流程規則"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
              >
                ×
              </button>
            </header>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">適用情境</label>
                <select
                  value={modalForm.category}
                  onChange={(e) =>
                    setModalForm((f) => ({
                      ...f,
                      category: e.target.value as CountWorkflowInput["category"],
                    }))
                  }
                  disabled={isPending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">規則名稱</label>
                <input
                  type="text"
                  value={modalForm.label}
                  onChange={(e) => setModalForm((f) => ({ ...f, label: e.target.value }))}
                  disabled={isPending}
                  placeholder="例：差異在容許率內"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">規則描述</label>
                <textarea
                  value={modalForm.description}
                  onChange={(e) =>
                    setModalForm((f) => ({ ...f, description: e.target.value }))
                  }
                  disabled={isPending}
                  rows={2}
                  placeholder="例：直接回傳系統，庫存自動調整，無需審核"
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">卡片色調</label>
                  <select
                    value={modalForm.tone}
                    onChange={(e) =>
                      setModalForm((f) => ({
                        ...f,
                        tone: e.target.value as CountWorkflowInput["tone"],
                      }))
                    }
                    disabled={isPending}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    {TONE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">徽章類型</label>
                  <select
                    value={modalForm.badge_kind}
                    onChange={(e) =>
                      setModalForm((f) => ({
                        ...f,
                        badge_kind: e.target.value as CountWorkflowInput["badge_kind"],
                      }))
                    }
                    disabled={isPending}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    {BADGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">徽章文字</label>
                <input
                  type="text"
                  value={modalForm.badge_label}
                  onChange={(e) =>
                    setModalForm((f) => ({ ...f, badge_label: e.target.value }))
                  }
                  disabled={isPending}
                  placeholder="例：自動回傳 / 等待審核 / 強制審核"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
              {modalError && (
                <div className="px-3 py-2 bg-[#FDECEA] border border-[#F5AEAD] rounded text-[12px] text-[#CC0000]">
                  {modalError}
                </div>
              )}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleModalSubmit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending
                  ? modalMode === "create"
                    ? "建立中⋯"
                    : "儲存中⋯"
                  : modalMode === "create"
                    ? "建立"
                    : "儲存變更"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
