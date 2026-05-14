"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createAlertRuleAction,
  updateAlertRuleAction,
  setAlertRuleActiveAction,
  deleteAlertRuleAction,
  type BusinessRuleRow,
  type AlertRuleConfig,
} from "@/domain/rules";
import {
  ALERT_RULE_PRIORITY_CHIP,
  ALERT_RULE_PRIORITY_OPTIONS,
  ALERT_RULE_TONE_CHIP,
  ALERT_RULE_TONE_OPTIONS,
  ALERT_RULE_CHANNEL_OPTIONS,
} from "@/domain/rules.constants";

type Draft = {
  code: string;
  label: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  tone: "red" | "amber" | "navy" | "neutral";
  channels: string[];
  sort_order: string;
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const lockedClass =
  "h-[30px] border border-[#EEECE6] bg-[#F8F7F4] rounded px-2 text-[12.5px] text-[#5A5955] w-full inline-flex items-center";

function emptyDraft(): Draft {
  return {
    code: "",
    label: "",
    description: "",
    priority: "normal",
    tone: "neutral",
    channels: ["dashboard"],
    sort_order: "99",
  };
}

function fromRow(row: BusinessRuleRow): Draft {
  const cfg = (row.config ?? {}) as Partial<AlertRuleConfig>;
  return {
    code: cfg.code ?? "",
    label: cfg.label ?? "",
    description: cfg.description ?? "",
    priority: (cfg.priority as Draft["priority"]) ?? "normal",
    tone: (cfg.tone as Draft["tone"]) ?? "neutral",
    channels: cfg.channels ?? [],
    sort_order: row.sort_order != null ? String(row.sort_order) : "99",
  };
}

export function AlertRuleDetailView({
  rule,
  canEdit,
  initialMode = "view",
}: {
  rule: BusinessRuleRow | null;
  canEdit: boolean;
  initialMode?: "view" | "edit" | "create";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [draft, setDraft] = useState<Draft>(() =>
    initialMode === "create" || !rule ? emptyDraft() : fromRow(rule),
  );
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const cfg = (rule?.config ?? {}) as Partial<AlertRuleConfig>;

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function startCreate() {
    setMode("create");
    setDraft(emptyDraft());
    setFormError(null);
  }
  function startEdit() {
    if (!rule) return;
    setMode("edit");
    setDraft(fromRow(rule));
    setFormError(null);
  }
  function cancelEdit() {
    if (!rule) {
      router.push("/parts/alerts/rules");
      return;
    }
    setMode("view");
    setDraft(fromRow(rule));
    setFormError(null);
  }

  function toggleChannel(value: string) {
    const has = draft.channels.includes(value);
    setDraft({
      ...draft,
      channels: has
        ? draft.channels.filter((c) => c !== value)
        : [...draft.channels, value],
    });
  }

  function submit() {
    setFormError(null);
    if (!draft.code.trim()) {
      setFormError("代碼必填");
      return;
    }
    if (!draft.label.trim()) {
      setFormError("名稱必填");
      return;
    }
    const sortNum = Number(draft.sort_order);
    if (Number.isNaN(sortNum)) {
      setFormError("排序必須是數字");
      return;
    }

    const payload = {
      code: draft.code.trim(),
      label: draft.label.trim(),
      description: draft.description.trim(),
      priority: draft.priority,
      tone: draft.tone,
      channels: draft.channels,
      sort_order: sortNum,
    };

    startTransition(async () => {
      if (mode === "create") {
        const res = await createAlertRuleAction(payload);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立" });
          router.push(`/parts/alerts/rules/${res.data.id}`);
        } else {
          setFormError(res.error);
        }
      } else if (mode === "edit" && rule) {
        const res = await updateAlertRuleAction(rule.id, payload);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已更新" });
          setMode("view");
          router.refresh();
        } else {
          setFormError(res.error);
        }
      }
    });
  }

  function toggleActive() {
    if (!rule) return;
    startTransition(async () => {
      const res = await setAlertRuleActiveAction(rule.id, !rule.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: rule.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeThis() {
    if (!rule) return;
    if (!confirm("確定刪除此告警規則？此動作無法復原。")) return;
    startTransition(async () => {
      const res = await deleteAlertRuleAction(rule.id);
      if (res.ok) {
        router.push("/parts/alerts/rules");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const isLocked = pending;
  const priChip =
    ALERT_RULE_PRIORITY_CHIP[cfg.priority ?? ""] ?? ALERT_RULE_PRIORITY_CHIP.normal;
  const toneChip = ALERT_RULE_TONE_CHIP[cfg.tone ?? ""] ?? ALERT_RULE_TONE_CHIP.neutral;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1) Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/alerts/rules" className="hover:text-[#185FA5]">
            告警類型與規則
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {isCreating ? "新增" : cfg.code ?? rule?.id?.slice(0, 8) ?? "—"}
          </span>
          {isEditing && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          )}
          {isCreating && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && rule && (
            <>
              <Link
                href="/parts/alerts/rules"
                className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={startCreate}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                onClick={startEdit}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={removeThis}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={toggleActive}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {rule.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {isCreating && (
            <>
              <Link
                href="/parts/alerts/rules"
                className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2) Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                ALERT RULE ・ 告警類型
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? "（未命名告警規則）" : cfg.label ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">
                  {isCreating ? "—" : cfg.code ?? "—"}
                </span>
                {!isCreating && cfg.priority && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${priChip.chip}`}
                  >
                    {priChip.label}
                  </span>
                )}
                {!isCreating && cfg.tone && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${toneChip.chip}`}
                  >
                    {toneChip.label}
                  </span>
                )}
                {!isCreating && rule && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                      rule.is_active
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#F2F2F2] text-[#6B6A68]"
                    }`}
                  >
                    {rule.is_active ? "啟用" : "停用"}
                  </span>
                )}
                {isCreating && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
              {isCreating ? "建立後可看到觸發歷史" : "（觸發歷史預留）"}
            </div>
          </div>
        </div>
      </header>

      {/* 3) Section card — 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="代碼 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：low_stock"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{cfg.code ?? "—"}</span>
              )
            }
          />
          <Kv
            label="名稱 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：庫存低於再訂購點"
                  className={inputClass}
                />
              ) : (
                cfg.label ?? "—"
              )
            }
          />
          <Kv
            label="排序"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{rule?.sort_order ?? "—"}</span>
              )
            }
          />
          <div className="md:col-span-3">
            <Kv
              label="描述"
              value={
                isEditing || isCreating ? (
                  <textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                    disabled={isLocked}
                    rows={2}
                    placeholder="觸發條件描述..."
                    className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                  />
                ) : (
                  <span className="text-[12.5px] text-[#5A5955]">
                    {cfg.description ?? "—"}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      {/* 4) Section card — 嚴重度與視覺 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 嚴重度與視覺</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="優先度"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({ ...draft, priority: e.target.value as Draft["priority"] })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  {ALERT_RULE_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${priChip.chip}`}
                >
                  {priChip.label}
                </span>
              )
            }
          />
          <Kv
            label="色調"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.tone}
                  onChange={(e) =>
                    setDraft({ ...draft, tone: e.target.value as Draft["tone"] })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  {ALERT_RULE_TONE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${toneChip.chip}`}
                >
                  {toneChip.label}
                </span>
              )
            }
          />
          <Kv
            label="kind / 啟用狀態"
            value={
              <span className={lockedClass}>
                alert_rule ・ {rule?.is_active === false ? "停用" : "啟用"}
              </span>
            }
          />
        </div>
      </section>

      {/* 5) Section card — 通知通道 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 通知通道</span>
        </header>
        <div className="px-4 py-4">
          {isEditing || isCreating ? (
            <div className="flex flex-wrap gap-2">
              {ALERT_RULE_CHANNEL_OPTIONS.map((o) => {
                const active = draft.channels.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleChannel(o.value)}
                    disabled={isLocked}
                    className={`h-[28px] px-3 rounded-full text-[12px] border transition-colors ${
                      active
                        ? "bg-[#EAF4FB] border-[#185FA5] text-[#185FA5]"
                        : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    } disabled:opacity-50`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(cfg.channels ?? []).length === 0 ? (
                <span className="text-[12px] text-[#9A9890]">—</span>
              ) : (
                (cfg.channels ?? []).map((ch) => (
                  <span
                    key={ch}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] bg-[#EAF4FB] text-[#185FA5]"
                  >
                    {ch}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {formError && (
        <div className="rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
          {formError}
        </div>
      )}

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
    </main>
  );
}

function Kv({
  label,
  value,
  small,
}: {
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <div className={small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"}>
        {value}
      </div>
    </div>
  );
}
