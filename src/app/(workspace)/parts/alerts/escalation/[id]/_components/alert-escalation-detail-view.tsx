"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createAlertEscalationAction,
  updateAlertEscalationAction,
  setAlertEscalationActiveAction,
  deleteAlertEscalationAction,
  type BusinessRuleRow,
  type AlertEscalationConfig,
} from "@/domain/rules";
import {
  ALERT_ESCALATION_CHANNEL_OPTIONS,
  ALERT_ESCALATION_LEVEL_CHIP,
  ALERT_ESCALATION_RECIPIENT_OPTIONS,
} from "@/domain/rules.constants";

type Draft = {
  level: string;
  label: string;
  timeout_min: string;
  recipients: string[];
  channels: string[];
  sort_order: string;
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const lockedClass =
  "h-[30px] border border-[#EEECE6] bg-[#F8F7F4] rounded px-2 text-[12.5px] text-[#5A5955] w-full inline-flex items-center";

function emptyDraft(): Draft {
  return {
    level: "1",
    label: "",
    timeout_min: "0",
    recipients: [],
    channels: ["dashboard"],
    sort_order: "99",
  };
}

function fromRow(row: BusinessRuleRow): Draft {
  const cfg = (row.config ?? {}) as Partial<AlertEscalationConfig>;
  return {
    level: cfg.level != null ? String(cfg.level) : "1",
    label: cfg.label ?? "",
    timeout_min: cfg.timeout_min != null ? String(cfg.timeout_min) : "0",
    recipients: cfg.recipients ?? [],
    channels: cfg.channels ?? [],
    sort_order: row.sort_order != null ? String(row.sort_order) : "99",
  };
}

export function AlertEscalationDetailView({
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

  const cfg = (rule?.config ?? {}) as Partial<AlertEscalationConfig>;

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
      router.push("/parts/alerts/escalation");
      return;
    }
    setMode("view");
    setDraft(fromRow(rule));
    setFormError(null);
  }

  function toggleArray(field: "recipients" | "channels", value: string) {
    const has = draft[field].includes(value);
    setDraft({
      ...draft,
      [field]: has ? draft[field].filter((c) => c !== value) : [...draft[field], value],
    });
  }

  function submit() {
    setFormError(null);
    if (!draft.label.trim()) {
      setFormError("名稱必填");
      return;
    }
    const levelNum = Number(draft.level);
    if (!Number.isFinite(levelNum) || levelNum < 1) {
      setFormError("層級必須是正整數");
      return;
    }
    const timeoutNum = Number(draft.timeout_min);
    if (!Number.isFinite(timeoutNum) || timeoutNum < 0) {
      setFormError("升級延遲必須是 0 或正整數分鐘");
      return;
    }
    if (draft.recipients.length === 0) {
      setFormError("通知對象至少選一項");
      return;
    }
    if (draft.channels.length === 0) {
      setFormError("通知通道至少選一項");
      return;
    }
    const sortNum = Number(draft.sort_order);
    if (Number.isNaN(sortNum)) {
      setFormError("排序必須是數字");
      return;
    }

    const payload = {
      level: levelNum,
      label: draft.label.trim(),
      timeout_min: timeoutNum,
      recipients: draft.recipients,
      channels: draft.channels,
      sort_order: sortNum,
    };

    startTransition(async () => {
      if (mode === "create") {
        const res = await createAlertEscalationAction(payload);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立" });
          router.push(`/parts/alerts/escalation/${res.data.id}`);
        } else {
          setFormError(res.error);
        }
      } else if (mode === "edit" && rule) {
        const res = await updateAlertEscalationAction(rule.id, payload);
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
      const res = await setAlertEscalationActiveAction(rule.id, !rule.is_active);
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
    if (!confirm("確定刪除此告警階層？此動作無法復原。")) return;
    startTransition(async () => {
      const res = await deleteAlertEscalationAction(rule.id);
      if (res.ok) {
        router.push("/parts/alerts/escalation");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const isLocked = pending;
  const lvlChip =
    ALERT_ESCALATION_LEVEL_CHIP[cfg.level ?? 0] ?? {
      chip: "bg-[#F2F2F2] text-[#6B6A68]",
      label: `L${cfg.level ?? "?"}`,
    };

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1) Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/alerts/escalation" className="hover:text-[#185FA5]">
            告警階層設定
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {isCreating ? "新增" : `L${cfg.level ?? "?"}`}
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
                href="/parts/alerts/escalation"
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
                href="/parts/alerts/escalation"
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
                ALERT ESCALATION ・ 告警升級階層
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? "（未命名告警階層）" : cfg.label ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {!isCreating && cfg.level && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${lvlChip.chip}`}
                  >
                    {lvlChip.label}
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
              {isCreating ? "建立後可看到升級紀錄" : "（升級歷史預留）"}
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
            label="層級 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={1}
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">L{cfg.level ?? "?"}</span>
              )
            }
          />
          <Kv
            label="階層名稱 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：L1 自動推送"
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
        </div>
      </section>

      {/* 4) Section card — 升級時機 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 升級時機</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="升級延遲（分鐘）*"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={0}
                  value={draft.timeout_min}
                  onChange={(e) => setDraft({ ...draft, timeout_min: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{cfg.timeout_min ?? 0} 分鐘</span>
              )
            }
          />
          <Kv
            label="kind / 啟用狀態"
            value={
              <span className={lockedClass}>
                alert_escalation ・ {rule?.is_active === false ? "停用" : "啟用"}
              </span>
            }
          />
        </div>
      </section>

      {/* 5) Section card — 通知對象 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 通知對象</span>
        </header>
        <div className="px-4 py-4">
          {isEditing || isCreating ? (
            <div className="flex flex-wrap gap-2">
              {ALERT_ESCALATION_RECIPIENT_OPTIONS.map((o) => {
                const active = draft.recipients.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleArray("recipients", o.value)}
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
              {(cfg.recipients ?? []).length === 0 ? (
                <span className="text-[12px] text-[#9A9890]">—</span>
              ) : (
                (cfg.recipients ?? []).map((r) => {
                  const opt = ALERT_ESCALATION_RECIPIENT_OPTIONS.find((o) => o.value === r);
                  return (
                    <span
                      key={r}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] bg-[#EAF4FB] text-[#185FA5]"
                    >
                      {opt?.label ?? r}
                    </span>
                  );
                })
              )}
            </div>
          )}
        </div>
      </section>

      {/* 6) Section card — 通知通道 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 通知通道</span>
        </header>
        <div className="px-4 py-4">
          {isEditing || isCreating ? (
            <div className="flex flex-wrap gap-2">
              {ALERT_ESCALATION_CHANNEL_OPTIONS.map((o) => {
                const active = draft.channels.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggleArray("channels", o.value)}
                    disabled={isLocked}
                    className={`h-[28px] px-3 rounded-full text-[12px] border transition-colors ${
                      active
                        ? "bg-[#E8F5F0] border-[#0F6E56] text-[#0F6E56]"
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
                (cfg.channels ?? []).map((ch) => {
                  const opt = ALERT_ESCALATION_CHANNEL_OPTIONS.find((o) => o.value === ch);
                  return (
                    <span
                      key={ch}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] bg-[#E8F5F0] text-[#0F6E56]"
                    >
                      {opt?.label ?? ch}
                    </span>
                  );
                })
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
