"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSerialRuleAction,
  deleteSerialRuleAction,
  lookupSerialAction,
  updateSerialRuleAction,
  type SerialLookupResult,
} from "@/lib/parts-setup/serial-rule-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type SerialRuleRow = {
  id: string;
  class_code: string;
  rule_label: string;
  is_required: boolean;
  is_locked: boolean;
  description: string | null;
  panel_color: string;
  is_active: boolean;
  sort_order: number;
};

export type RecentSerial = {
  serial_no: string;
  status: string | null;
  item_name: string | null;
};

type Banner = { ok: boolean; msg: string } | null;

const COLOR_OPTIONS = [
  { key: "red", label: "紅", panel: "bg-[#FDECEA]", border: "border-[#F5AEAD]", text: "text-[#CC0000]" },
  { key: "amber", label: "黃", panel: "bg-[#FDF3E3]", border: "border-[#FAC775]", text: "text-[#854F0B]" },
  { key: "teal", label: "青", panel: "bg-[#E8F5F0]", border: "border-[#A8D8C7]", text: "text-[#0F6E56]" },
  { key: "green", label: "綠", panel: "bg-[#EAF3DE]", border: "border-[#C7E0AC]", text: "text-[#3B6D11]" },
  { key: "navy", label: "藍", panel: "bg-[#EBF3FF]", border: "border-[#B5D4F4]", text: "text-[#1A3A5C]" },
  { key: "gray", label: "灰", panel: "bg-[#F8F7F4]", border: "border-[#EEECE6]", text: "text-[#2C2C2A]" },
];
function colorMeta(key: string) {
  return COLOR_OPTIONS.find((c) => c.key === key) ?? COLOR_OPTIONS[5];
}

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function SerialRulesBoard({
  rules,
  recentSerials,
  canEdit,
}: {
  rules: SerialRuleRow[];
  recentSerials: RecentSerial[];
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
            序列號/批號追蹤設定
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            3.5
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          設定哪些備件需要序列號追蹤・追蹤規則與查詢
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
        <RulesCard rules={rules} canEdit={canEdit} onBanner={setBanner} />
        <LookupCard recent={recentSerials} canEdit={canEdit} />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Rules Card
// ──────────────────────────────────────────────────────────

function RulesCard({
  rules,
  canEdit,
  onBanner,
}: {
  rules: SerialRuleRow[];
  canEdit: boolean;
  onBanner: (b: Banner) => void;
}) {
  const [editing, setEditing] = useState<SerialRuleRow | "new" | null>(null);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🔖 追蹤規則設定
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
            尚無追蹤規則。
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
  rule: SerialRuleRow;
  canEdit: boolean;
  onEdit: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const c = colorMeta(rule.panel_color);
  const [requiredLocal, setRequiredLocal] = useState(rule.is_required);
  useEffect(() => setRequiredLocal(rule.is_required), [rule.is_required]);

  const dirty = requiredLocal !== rule.is_required;

  function onToggle() {
    if (rule.is_locked) return;
    setRequiredLocal((v) => !v);
  }
  function onSaveToggle() {
    if (!dirty) return;
    startTransition(async () => {
      const res = await updateSerialRuleAction(rule.id, {
        is_required: requiredLocal,
      });
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已更新規則啟用狀態" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
        setRequiredLocal(rule.is_required);
      }
    });
  }
  function onDelete() {
    if (!confirm(`刪除「${rule.class_code} 類」規則？`)) return;
    startTransition(async () => {
      const res = await deleteSerialRuleAction(rule.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除規則" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div
      className={`rounded-md border ${c.border} ${c.panel} px-3 py-2.5 ${
        pending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-[12.5px] font-semibold ${c.text}`}>
            {`${rule.class_code} 類商品`}
            <span className="ml-2 font-normal text-[10.5px] text-[#9A9890]">
              {rule.rule_label}
            </span>
            {rule.is_locked && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-white/60 text-[#CC0000] text-[10px] font-medium border border-[#F5AEAD]">
                強制不可關
              </span>
            )}
          </div>
          {rule.description && (
            <div className="text-[12px] text-[#5A5955] mt-1">
              {rule.description}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requiredLocal}
              disabled={!canEdit || rule.is_locked || pending}
              onChange={onToggle}
              className="w-4 h-4 accent-[#0F6E56]"
            />
            {rule.is_required && rule.is_locked ? "強制序列號" : "啟用追蹤"}
          </label>
          {dirty && canEdit && (
            <button
              type="button"
              onClick={onSaveToggle}
              disabled={pending}
              className="px-2 h-[24px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[10.5px] font-medium"
            >
              {pending ? "儲存中…" : "儲存"}
            </button>
          )}
          {canEdit && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="px-2 h-[22px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[10.5px]"
              >
                編輯
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="px-2 h-[22px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[10.5px] hover:bg-[#FDECEA]"
              >
                刪除
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleEditModal({
  rule,
  onClose,
  onResult,
}: {
  rule: SerialRuleRow | null;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(rule?.class_code ?? "");
  const [label, setLabel] = useState(rule?.rule_label ?? "");
  const [required, setRequired] = useState(rule?.is_required ?? false);
  const [locked, setLocked] = useState(rule?.is_locked ?? false);
  const [description, setDescription] = useState(rule?.description ?? "");
  const [color, setColor] = useState(rule?.panel_color ?? "gray");
  const [sortOrder, setSortOrder] = useState(rule?.sort_order ?? 99);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!code.trim() || !label.trim()) {
      setErr("代碼與規則標籤為必填");
      return;
    }
    startTransition(async () => {
      const payload = {
        class_code: code,
        rule_label: label,
        is_required: required,
        is_locked: locked,
        description,
        panel_color: color,
        sort_order: sortOrder,
      };
      const res = rule
        ? await updateSerialRuleAction(rule.id, payload)
        : await createSerialRuleAction(payload);
      if (res.ok) {
        onResult({ ok: true, msg: rule ? "✓ 已更新規則" : "✓ 已新增規則" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <Modal title={rule ? `編輯：${rule.class_code} 類規則` : "新增規則"} onClose={onClose}>
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="類別代碼 *">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={pending || !!rule}
              placeholder="A / B / C"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
            />
          </Field>
          <Field label="規則標籤 *">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={pending}
              placeholder="強制序列號 / 部分品類啟用 / 不追蹤"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="底色">
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
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
          <Field label="預設啟用追蹤">
            <label className="inline-flex items-center gap-2 h-[30px] text-[12.5px] text-[#5A5955]">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                disabled={pending}
                className="w-4 h-4 accent-[#0F6E56]"
              />
              預設勾選
            </label>
          </Field>
          <Field label="鎖定不可關">
            <label className="inline-flex items-center gap-2 h-[30px] text-[12.5px] text-[#5A5955]">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
                disabled={pending}
                className="w-4 h-4 accent-[#CC0000]"
              />
              鎖死（A 類強制）
            </label>
          </Field>
          <div className="col-span-2">
            <Field label="說明">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="例：所有 A 類商品入庫、出庫均須掃描序列號"
              />
            </Field>
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
// Lookup Card
// ──────────────────────────────────────────────────────────

function LookupCard({
  recent,
  canEdit: _canEdit,
}: {
  recent: RecentSerial[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SerialLookupResult[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSearch() {
    setErr(null);
    if (query.trim().length < 2) {
      setErr("請輸入至少 2 字元");
      return;
    }
    startTransition(async () => {
      const res = await lookupSerialAction(query);
      if (res.ok) {
        setResults(res.data);
        if (res.data.length === 0) setErr("查無符合的序列號");
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6]">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🔍 序列號查詢
        </span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[10.5px] font-medium text-[#9A9890]">
              輸入序列號
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              disabled={pending}
              placeholder="掃描或輸入序列號…"
              className="w-full h-[30px] mt-0.5 px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onSearch}
            disabled={pending}
            className="px-3 h-[30px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {pending ? (
              <>
                <Spinner /> 查詢中…
              </>
            ) : (
              "查詢"
            )}
          </button>
        </div>

        {err && (
          <div className="rounded-md bg-[#FDF3E3] border border-[#FAC775] px-3 py-2 text-[12px] text-[#854F0B]">
            {err}
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-[#9A9890]">
              {`查詢結果（${results.length} 筆）`}
            </div>
            {results.map((r, i) => (
              <div
                key={`${r.serial_no}-${i}`}
                className="rounded border border-[#EEECE6] bg-[#FAFAF9] px-3 py-2 text-[12px] space-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-[#2C2C2A]">
                    {r.serial_no}
                  </span>
                  <span className="text-[10.5px] text-[#0F6E56] font-medium">
                    {r.status ?? "—"}
                  </span>
                </div>
                <div className="text-[11.5px] text-[#5A5955]">
                  {r.item_name ?? "(未命名商品)"}
                  {r.item_code && (
                    <span className="ml-1.5 font-mono text-[10.5px] text-[#9A9890]">
                      {r.item_code}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#9A9890]">
                  位置：{r.warehouse_name ?? "—"}
                  {r.bin_code && ` / ${r.bin_code}`}
                </div>
                {(r.warranty_start || r.warranty_end) && (
                  <div className="text-[11px] text-[#9A9890]">
                    保固：{r.warranty_start ?? "—"} ~ {r.warranty_end ?? "—"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {results === null && (
          <div className="rounded-md bg-[#F8F7F4] border border-[#EEECE6] px-3 py-3 text-center text-[12px] text-[#9A9890]">
            輸入序列號後顯示完整軌跡記錄
          </div>
        )}

        <div className="pt-2 border-t border-[#EEECE6]">
          <div className="text-[11px] font-semibold text-[#9A9890] mb-1.5">
            最近追蹤紀錄
          </div>
          <div className="space-y-1">
            {recent.length === 0 ? (
              <div className="text-[11px] text-[#9A9890] py-1.5">
                尚無資料（stock_items 中無 serial_no）
              </div>
            ) : (
              recent.map((r, i) => (
                <button
                  type="button"
                  key={`${r.serial_no}-${i}`}
                  onClick={() => {
                    setQuery(r.serial_no);
                    setErr(null);
                  }}
                  className="w-full text-left rounded border border-[#EEECE6] bg-white hover:bg-[#FAFAF9] px-2 py-1 text-[12px] flex items-center justify-between"
                >
                  <span className="font-mono">{r.serial_no}</span>
                  <span className="text-[#9A9890]">
                    {r.item_name ?? "—"}
                    {r.status && ` · ${r.status}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
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
        <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between sticky top-0 bg-white">
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
