"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createReviewRuleAction,
  deleteReviewRuleAction,
  updateReviewRuleAction,
  upsertToleranceAction,
} from "@/lib/parts-setup/count-rule-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type ToleranceConfig = {
  tolerance_a_pct: number;
  tolerance_b_pct: number;
  tolerance_c_pct: number;
  warning_text: string | null;
  notes: string | null;
};

export type ReviewRuleRow = {
  id: string;
  rule_code: string;
  rule_name: string;
  description: string | null;
  badge_label: string;
  badge_color: string;
  panel_color: string;
  action: string | null;
  is_active: boolean;
  sort_order: number;
};

type Banner = { ok: boolean; msg: string } | null;

const COLOR_OPTIONS: Array<{
  key: string;
  label: string;
  badge: string;
  panel: string;
  panelBorder: string;
  textOnPanel: string;
}> = [
  {
    key: "gray",
    label: "灰（預設）",
    badge: "bg-[#F2F2F2] text-[#5A5955]",
    panel: "bg-[#F8F7F4]",
    panelBorder: "border-[#EEECE6]",
    textOnPanel: "text-[#2C2C2A]",
  },
  {
    key: "teal",
    label: "青（自動）",
    badge: "bg-[#E8F5F0] text-[#0F6E56]",
    panel: "bg-[#E8F5F0]",
    panelBorder: "border-[#A8D8C7]",
    textOnPanel: "text-[#0F6E56]",
  },
  {
    key: "amber",
    label: "黃（待審）",
    badge: "bg-[#FDF3E3] text-[#854F0B]",
    panel: "bg-[#FDF3E3]",
    panelBorder: "border-[#FAC775]",
    textOnPanel: "text-[#854F0B]",
  },
  {
    key: "red",
    label: "紅（強制）",
    badge: "bg-[#FDECEA] text-[#CC0000]",
    panel: "bg-[#FDECEA]",
    panelBorder: "border-[#F5AEAD]",
    textOnPanel: "text-[#CC0000]",
  },
  {
    key: "navy",
    label: "藍",
    badge: "bg-[#EBF3FF] text-[#1A3A5C]",
    panel: "bg-[#EBF3FF]",
    panelBorder: "border-[#B5D4F4]",
    textOnPanel: "text-[#1A3A5C]",
  },
  {
    key: "green",
    label: "綠",
    badge: "bg-[#EAF3DE] text-[#3B6D11]",
    panel: "bg-[#EAF3DE]",
    panelBorder: "border-[#C7E0AC]",
    textOnPanel: "text-[#3B6D11]",
  },
];
function colorMeta(key: string) {
  return COLOR_OPTIONS.find((c) => c.key === key) ?? COLOR_OPTIONS[0];
}

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto_post", label: "自動回傳系統" },
  { value: "store_manager", label: "送門店主管審核" },
  { value: "region_manager", label: "送區域主管審核" },
  { value: "manual", label: "人工處理（不自動）" },
];

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function CountRulesBoard({
  tolerance,
  rules,
  canEdit,
}: {
  tolerance: ToleranceConfig;
  rules: ReviewRuleRow[];
  canEdit: boolean;
}) {
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (!banner || !banner.ok) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  return (
    <main className="px-6 py-6 space-y-5 bg-[#F8F7F4] min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            盤點回傳規則
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            1.4
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          設定盤點差異的審核流程與自動回傳規則
        </p>
      </header>

      {banner && (
        <div
          className={`rounded-md px-4 py-2 text-[12px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C7E0AC]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ToleranceCard
          tolerance={tolerance}
          canEdit={canEdit}
          onBanner={setBanner}
        />
        <ReviewRulesCard
          rules={rules}
          canEdit={canEdit}
          onBanner={setBanner}
        />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Tolerance Card（差異容許區間設定）
// ──────────────────────────────────────────────────────────

function ToleranceCard({
  tolerance,
  canEdit,
  onBanner,
}: {
  tolerance: ToleranceConfig;
  canEdit: boolean;
  onBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const [a, setA] = useState(formatPct(tolerance.tolerance_a_pct));
  const [b, setB] = useState(formatPct(tolerance.tolerance_b_pct));
  const [c, setC] = useState(formatPct(tolerance.tolerance_c_pct));
  const [warningText, setWarningText] = useState(tolerance.warning_text ?? "");
  const [pending, startTransition] = useTransition();

  // 重置 — 當 server 端的值變動時
  useEffect(() => {
    setA(formatPct(tolerance.tolerance_a_pct));
    setB(formatPct(tolerance.tolerance_b_pct));
    setC(formatPct(tolerance.tolerance_c_pct));
    setWarningText(tolerance.warning_text ?? "");
  }, [
    tolerance.tolerance_a_pct,
    tolerance.tolerance_b_pct,
    tolerance.tolerance_c_pct,
    tolerance.warning_text,
  ]);

  const dirty =
    parsePctClient(a) !== tolerance.tolerance_a_pct ||
    parsePctClient(b) !== tolerance.tolerance_b_pct ||
    parsePctClient(c) !== tolerance.tolerance_c_pct ||
    (warningText || null) !== (tolerance.warning_text ?? null);

  function onSave() {
    if (!dirty) {
      onBanner({ ok: false, msg: "沒有要儲存的變更" });
      return;
    }
    startTransition(async () => {
      const res = await upsertToleranceAction({
        tolerance_a_pct: a,
        tolerance_b_pct: b,
        tolerance_c_pct: c,
        warning_text: warningText,
      });
      if (res.ok) {
        onBanner({ ok: true, msg: "✓ 已儲存容許區間" });
        router.refresh();
      } else {
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          📐 差異容許區間設定
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || pending}
            className={`px-3 h-[26px] rounded text-[11.5px] font-medium ${
              dirty && !pending
                ? "bg-[#1A3A5C] hover:bg-[#0F2A45] text-white"
                : "bg-[#F2F2F2] text-[#9A9890] cursor-not-allowed"
            }`}
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> 儲存中⋯
              </span>
            ) : (
              "儲存"
            )}
          </button>
        )}
      </div>

      <div
        className={`px-4 py-4 space-y-3 ${
          pending ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <ToleranceField
          label="A 類商品（高價）差異容許率"
          value={a}
          serverValue={tolerance.tolerance_a_pct}
          onChange={setA}
          disabled={!canEdit}
          accent="red"
          hint="建議 0%：高單價零件不容許差異"
        />
        <ToleranceField
          label="B 類商品（中價）差異容許率"
          value={b}
          serverValue={tolerance.tolerance_b_pct}
          onChange={setB}
          disabled={!canEdit}
          accent="amber"
          hint="建議 1–3%"
        />
        <ToleranceField
          label="C 類商品（耗材）差異容許率"
          value={c}
          serverValue={tolerance.tolerance_c_pct}
          onChange={setC}
          disabled={!canEdit}
          accent="teal"
          hint="建議 3–5%"
        />

        <div>
          <label className="text-[11px] font-medium text-[#9A9890]">
            警語文字（顯示在卡片底部）
          </label>
          <input
            value={warningText}
            disabled={!canEdit}
            onChange={(e) => setWarningText(e.target.value)}
            className="w-full h-[30px] mt-1 px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
            placeholder="例：⚠ 超過容許率的差異項目將進入審核流程"
          />
        </div>

        <div className="rounded-md bg-[#FDF3E3] border border-[#FAC775] px-3 py-2 text-[12px] text-[#854F0B]">
          {warningText || "⚠ 超過容許率的差異項目將進入審核流程，不會自動回傳"}
        </div>
      </div>
    </section>
  );
}

function ToleranceField({
  label,
  value,
  serverValue,
  onChange,
  disabled,
  accent,
  hint,
}: {
  label: string;
  value: string;
  serverValue: number;
  onChange: (v: string) => void;
  disabled?: boolean;
  accent: "red" | "amber" | "teal";
  hint?: string;
}) {
  const accentClass =
    accent === "red"
      ? "border-l-[#CC0000]"
      : accent === "amber"
      ? "border-l-[#854F0B]"
      : "border-l-[#0F6E56]";
  const dirty = parsePctClient(value) !== serverValue;
  return (
    <div className={`border-l-2 ${accentClass} pl-3`}>
      <label className="text-[11.5px] font-medium text-[#5A5955]">
        {label}
      </label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0%"
          className={`flex-1 h-[30px] px-2 border rounded font-mono text-[12.5px] outline-none ${
            dirty
              ? "border-[#854F0B] bg-[#FFFBEA]"
              : "border-[#D5D3CB] focus:border-[#185FA5]"
          } disabled:bg-[#F8F7F4]`}
        />
        <span className="text-[11px] text-[#9A9890] font-mono">
          原值：{formatPct(serverValue)}
        </span>
      </div>
      {hint && (
        <div className="text-[11px] text-[#9A9890] mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function formatPct(n: number): string {
  if (Number.isInteger(n)) return `${n}%`;
  return `${n}%`;
}
function parsePctClient(v: string): number | null {
  const s = String(v ?? "")
    .trim()
    .replace(/%|\s/g, "");
  if (s.length === 0) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

// ──────────────────────────────────────────────────────────
// Review Rules Card
// ──────────────────────────────────────────────────────────

function ReviewRulesCard({
  rules,
  canEdit,
  onBanner,
}: {
  rules: ReviewRuleRow[];
  canEdit: boolean;
  onBanner: (b: Banner) => void;
}) {
  const [editing, setEditing] = useState<ReviewRuleRow | "new" | null>(null);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🔁 審核流程設定
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="px-2.5 h-[26px] rounded bg-[#0F6E56] hover:bg-[#0a5642] text-white text-[11.5px] font-medium"
          >
            ＋ 新增規則
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {rules.length === 0 && (
          <div className="px-2 py-8 text-center text-[12px] text-[#9A9890]">
            尚無審核流程規則。
          </div>
        )}

        {rules.map((r) => (
          <RuleCard
            key={r.id}
            rule={r}
            canEdit={canEdit}
            onEdit={() => setEditing(r)}
            onResult={onBanner}
          />
        ))}
      </div>

      {editing && canEdit && (
        <RuleEditModal
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onResult={(b) => {
            onBanner(b);
            if (b?.ok) setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function RuleCard({
  rule,
  canEdit,
  onEdit,
  onResult,
}: {
  rule: ReviewRuleRow;
  canEdit: boolean;
  onEdit: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const panel = colorMeta(rule.panel_color);
  const badge = colorMeta(rule.badge_color);

  function onDelete() {
    if (!confirm(`刪除「${rule.rule_name}」規則？`)) return;
    startTransition(async () => {
      const res = await deleteReviewRuleAction(rule.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除規則" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
      }
    });
  }

  const actionLabel = ACTION_OPTIONS.find((a) => a.value === rule.action)?.label;

  return (
    <div
      className={`rounded-md border ${panel.panelBorder} ${panel.panel} px-3 py-2.5 ${
        pending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`text-[12.5px] font-semibold ${panel.textOnPanel}`}>
            {rule.rule_name}
            <span className="ml-2 font-mono text-[10.5px] text-[#9A9890] font-normal">
              {rule.rule_code}
            </span>
            {!rule.is_active && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-[#F2F2F2] text-[#9A9890] text-[10px] font-medium">
                停用
              </span>
            )}
          </div>
          {rule.description && (
            <div className="text-[12px] text-[#5A5955] mt-1">
              {rule.description}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${badge.badge}`}
            >
              {rule.badge_label}
            </span>
            {actionLabel && (
              <span className="text-[10.5px] text-[#9A9890]">
                · 動作：{actionLabel}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="px-2 h-[24px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 h-[24px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[11px] hover:bg-[#FDECEA]"
            >
              刪除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleEditModal({
  rule,
  onClose,
  onResult,
}: {
  rule: ReviewRuleRow | null;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(rule?.rule_code ?? "");
  const [name, setName] = useState(rule?.rule_name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [badgeLabel, setBadgeLabel] = useState(rule?.badge_label ?? "");
  const [badgeColor, setBadgeColor] = useState(rule?.badge_color ?? "navy");
  const [panelColor, setPanelColor] = useState(rule?.panel_color ?? "gray");
  const [action, setAction] = useState(rule?.action ?? "");
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(rule?.sort_order ?? 99);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!code.trim() || !name.trim() || !badgeLabel.trim()) {
      setErr("代碼／名稱／徽章文字為必填");
      return;
    }
    startTransition(async () => {
      const payload = {
        rule_code: code,
        rule_name: name,
        description,
        badge_label: badgeLabel,
        badge_color: badgeColor,
        panel_color: panelColor,
        action: action || undefined,
        is_active: isActive,
        sort_order: sortOrder,
      };
      const res = rule
        ? await updateReviewRuleAction(rule.id, payload)
        : await createReviewRuleAction(payload);
      if (res.ok) {
        onResult({ ok: true, msg: rule ? "✓ 已更新規則" : "✓ 已新增規則" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // Live preview
  const previewPanel = colorMeta(panelColor);
  const previewBadge = colorMeta(badgeColor);

  return (
    <Modal
      title={rule ? `編輯規則：${rule.rule_name}` : "新增規則"}
      onClose={onClose}
    >
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="代碼 *">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toLowerCase().replace(/\s/g, "_"))
              }
              disabled={pending || !!rule}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
              placeholder="within_tolerance"
            />
          </Field>
          <Field label="名稱 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="差異在容許率內"
            />
          </Field>
          <div className="col-span-2">
            <Field label="說明">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="例：直接回傳系統，庫存自動調整，無需審核"
              />
            </Field>
          </div>
          <Field label="徽章文字 *">
            <input
              value={badgeLabel}
              onChange={(e) => setBadgeLabel(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="自動回傳 / 等待審核 / 強制審核"
            />
          </Field>
          <Field label="動作">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">— 未指定 —</option>
              {ACTION_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="徽章顏色">
            <select
              value={badgeColor}
              onChange={(e) => setBadgeColor(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="卡片底色">
            <select
              value={panelColor}
              onChange={(e) => setPanelColor(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {COLOR_OPTIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="排序">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="啟用">
            <label className="inline-flex items-center gap-2 h-[30px] text-[12.5px] text-[#5A5955]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending}
                className="w-4 h-4 accent-[#1A3A5C]"
              />
              啟用此規則
            </label>
          </Field>
        </div>

        <div className="mt-3 pt-3 border-t border-[#EEECE6]">
          <div className="text-[11px] font-semibold text-[#6B6A68] mb-1.5">
            預覽
          </div>
          <div
            className={`rounded-md border ${previewPanel.panelBorder} ${previewPanel.panel} px-3 py-2.5`}
          >
            <div
              className={`text-[12.5px] font-semibold ${previewPanel.textOnPanel}`}
            >
              {name || "規則名稱"}
            </div>
            {description && (
              <div className="text-[12px] text-[#5A5955] mt-1">{description}</div>
            )}
            <div className="mt-1.5">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${previewBadge.badge}`}
              >
                {badgeLabel || "徽章"}
              </span>
            </div>
          </div>
        </div>

        {err && <div className="text-[11.5px] text-[#CC0000] mt-2">{err}</div>}

        <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-[#EEECE6]">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-3 h-[28px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="px-3 h-[28px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {pending ? (
              <>
                <Spinner /> 儲存中⋯
              </>
            ) : rule ? (
              "更新"
            ) : (
              "建立"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1A1917]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-full max-w-[600px] max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1A1917]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium text-[#9A9890]">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
