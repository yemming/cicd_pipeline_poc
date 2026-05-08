"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createControlTypeAction,
  deleteControlTypeAction,
  updateControlTypeAction,
  type ControlTypeInput,
} from "@/lib/parts-setup/control-type-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type ControlTypeRow = {
  id: string;
  class_code: string;
  class_name: string;
  price_basis: string | null;
  count_frequency: string | null;
  serial_tracking_label: string | null;
  serial_tracking_color: string;
  issue_review_label: string | null;
  issue_review_color: string;
  tolerance_pct: number | null;
  example_text: string | null;
  accent_color: string;
  is_active: boolean;
  sort_order: number;
};

export type DistributionRow = {
  class_code: string;
  item_count: number;
};

type Banner = { ok: boolean; msg: string } | null;

const COLOR_OPTIONS: Array<{
  key: string;
  label: string;
  badge: string;
  header: string;
  border: string;
}> = [
  {
    key: "red",
    label: "紅（嚴格）",
    badge: "bg-[#FDECEA] text-[#CC0000]",
    header: "bg-[#CC0000]",
    border: "border-[#CC0000]",
  },
  {
    key: "amber",
    label: "黃（一般）",
    badge: "bg-[#FDF3E3] text-[#854F0B]",
    header: "bg-[#854F0B]",
    border: "border-[#854F0B]",
  },
  {
    key: "teal",
    label: "青（簡易）",
    badge: "bg-[#E8F5F0] text-[#0F6E56]",
    header: "bg-[#0F6E56]",
    border: "border-[#0F6E56]",
  },
  {
    key: "green",
    label: "綠",
    badge: "bg-[#EAF3DE] text-[#3B6D11]",
    header: "bg-[#3B6D11]",
    border: "border-[#3B6D11]",
  },
  {
    key: "navy",
    label: "藍",
    badge: "bg-[#EBF3FF] text-[#1A3A5C]",
    header: "bg-[#1A3A5C]",
    border: "border-[#1A3A5C]",
  },
  {
    key: "gray",
    label: "灰",
    badge: "bg-[#F2F2F2] text-[#5A5955]",
    header: "bg-[#9A9890]",
    border: "border-[#9A9890]",
  },
];
function colorMeta(key: string) {
  return COLOR_OPTIONS.find((c) => c.key === key) ?? COLOR_OPTIONS[5];
}

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function ControlTypesBoard({
  rows,
  distribution,
  canEdit,
}: {
  rows: ControlTypeRow[];
  distribution: DistributionRow[];
  canEdit: boolean;
}) {
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState<ControlTypeRow | "new" | null>(null);

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
            管控類型定義
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            1.5
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          定義 A / B / C 類商品的管控規則，影響補貨、盤點、告警行為
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

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="px-2.5 h-[28px] rounded bg-[#0F6E56] hover:bg-[#0a5642] text-white text-[11.5px] font-medium"
          >
            ＋ 新增類別
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.length === 0 && (
          <div className="col-span-full rounded-md border border-[#EEECE6] bg-white px-6 py-12 text-center text-[12px] text-[#9A9890]">
            尚無管控類型，請點「＋ 新增類別」開始建立。
          </div>
        )}
        {rows.map((r) => (
          <ClassCard
            key={r.id}
            row={r}
            canEdit={canEdit}
            onEdit={() => setEditing(r)}
            onResult={setBanner}
          />
        ))}
      </div>

      <DistributionCard rows={rows} distribution={distribution} />

      {editing && canEdit && (
        <EditModal
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onResult={(b) => {
            setBanner(b);
            if (b?.ok) setEditing(null);
          }}
        />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Class Card
// ──────────────────────────────────────────────────────────

function ClassCard({
  row,
  canEdit,
  onEdit,
  onResult,
}: {
  row: ControlTypeRow;
  canEdit: boolean;
  onEdit: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const accent = colorMeta(row.accent_color);
  const serialColor = colorMeta(row.serial_tracking_color);
  const issueColor = colorMeta(row.issue_review_color);

  function onDelete() {
    if (!confirm(`刪除「${row.class_name}（${row.class_code} 類）」？`)) return;
    startTransition(async () => {
      const res = await deleteControlTypeAction(row.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除類別" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div
      className={`rounded-lg overflow-hidden border-2 ${accent.border} bg-white ${
        pending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className={`${accent.header} px-4 py-2.5 text-white relative`}>
        <div className="text-[18px] font-bold leading-tight">
          {`${row.class_code} 類`}
        </div>
        <div className="text-[11px] opacity-90 mt-0.5">{row.class_name}</div>
        {!row.is_active && (
          <span className="absolute top-2 right-2 text-[10px] bg-white/20 px-1.5 py-0.5 rounded">
            停用
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-1.5 text-[12px] text-[#2C2C2A]">
        {row.price_basis && (
          <KV label="金額基準" value={row.price_basis} />
        )}
        {row.count_frequency && (
          <KV label="盤點頻率" value={row.count_frequency} />
        )}
        {row.serial_tracking_label && (
          <KV
            label="序列號追蹤"
            valueNode={
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${serialColor.badge}`}
              >
                {row.serial_tracking_label}
              </span>
            }
          />
        )}
        {row.issue_review_label && (
          <KV
            label="出庫審核"
            valueNode={
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${issueColor.badge}`}
              >
                {row.issue_review_label}
              </span>
            }
          />
        )}
        <KV
          label="告警差異容許"
          value={
            row.tolerance_pct === null
              ? "—"
              : Number.isInteger(row.tolerance_pct)
              ? `${row.tolerance_pct}%`
              : `${row.tolerance_pct}%`
          }
        />
        {row.example_text && (
          <div className="text-[11.5px] text-[#9A9890] mt-1 pt-1.5 border-t border-[#EEECE6]">
            {row.example_text}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="px-4 py-2 border-t border-[#EEECE6] bg-[#FAFAF9] flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-2 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 h-[26px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[11px] hover:bg-[#FDECEA]"
          >
            刪除
          </button>
        </div>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-[#5A5955] text-[11.5px]">{label}</span>
      <span className="text-right">{valueNode ?? value}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Distribution Card（讀 abc_classification_results）
// ──────────────────────────────────────────────────────────

function DistributionCard({
  rows,
  distribution,
}: {
  rows: ControlTypeRow[];
  distribution: DistributionRow[];
}) {
  const total = distribution.reduce((acc, d) => acc + d.item_count, 0);
  const byClass = new Map(distribution.map((d) => [d.class_code, d.item_count]));

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6]">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          📊 商品類型分佈（目前庫存）
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        {total === 0 ? (
          <div className="text-[12px] text-[#9A9890] py-4 text-center">
            尚無 ABC 分類結果（abc_classification_results 為空）
          </div>
        ) : (
          <>
            <div className="h-2 rounded overflow-hidden flex">
              {rows.map((r) => {
                const count = byClass.get(r.class_code) ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                if (pct === 0) return null;
                const color = colorMeta(r.accent_color);
                return (
                  <div
                    key={r.id}
                    className={color.header}
                    style={{ width: `${pct}%` }}
                    title={`${r.class_code} 類 ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
              {rows.map((r) => {
                const count = byClass.get(r.class_code) ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                const color = colorMeta(r.accent_color);
                return (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-sm ${color.header}`}
                    />
                    <span className="text-[#5A5955]">
                      {`${r.class_code} 類 ${pct.toFixed(0)}% (`}
                      <span className="font-mono">{count}</span>
                      {" 料號)"}
                    </span>
                  </span>
                );
              })}
              <span className="ml-auto text-[11px] text-[#9A9890]">
                樣本數：<span className="font-mono">{total}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// Edit Modal
// ──────────────────────────────────────────────────────────

function EditModal({
  row,
  onClose,
  onResult,
}: {
  row: ControlTypeRow | null;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(row?.class_code ?? "");
  const [name, setName] = useState(row?.class_name ?? "");
  const [priceBasis, setPriceBasis] = useState(row?.price_basis ?? "");
  const [countFreq, setCountFreq] = useState(row?.count_frequency ?? "");
  const [serialLabel, setSerialLabel] = useState(
    row?.serial_tracking_label ?? "",
  );
  const [serialColor, setSerialColor] = useState(
    row?.serial_tracking_color ?? "gray",
  );
  const [issueLabel, setIssueLabel] = useState(row?.issue_review_label ?? "");
  const [issueColor, setIssueColor] = useState(
    row?.issue_review_color ?? "gray",
  );
  const [tolerance, setTolerance] = useState(
    row?.tolerance_pct === null || row?.tolerance_pct === undefined
      ? ""
      : String(row.tolerance_pct),
  );
  const [example, setExample] = useState(row?.example_text ?? "");
  const [accent, setAccent] = useState(row?.accent_color ?? "gray");
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(row?.sort_order ?? 99);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!code.trim() || !name.trim()) {
      setErr("代碼與名稱為必填");
      return;
    }
    const payload: ControlTypeInput = {
      class_code: code,
      class_name: name,
      price_basis: priceBasis,
      count_frequency: countFreq,
      serial_tracking_label: serialLabel,
      serial_tracking_color: serialColor,
      issue_review_label: issueLabel,
      issue_review_color: issueColor,
      tolerance_pct: tolerance,
      example_text: example,
      accent_color: accent,
      is_active: isActive,
      sort_order: sortOrder,
    };
    startTransition(async () => {
      const res = row
        ? await updateControlTypeAction(row.id, payload)
        : await createControlTypeAction(payload);
      if (res.ok) {
        onResult({ ok: true, msg: row ? "✓ 已更新類別" : "✓ 已新增類別" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <Modal
      title={row ? `編輯類別：${row.class_code} 類` : "新增類別"}
      onClose={onClose}
    >
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="代碼 *">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={pending || !!row}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
              placeholder="A / B / C"
            />
          </Field>
          <Field label="名稱 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="高價值・嚴格管控"
            />
          </Field>
          <Field label="主色">
            <select
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
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
          <div className="col-span-2">
            <Field label="金額基準">
              <input
                value={priceBasis}
                onChange={(e) => setPriceBasis(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="單價 > NT$ 5,000"
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="盤點頻率">
              <input
                value={countFreq}
                onChange={(e) => setCountFreq(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="每月全盤"
              />
            </Field>
          </div>
          <Field label="序列號追蹤標籤">
            <input
              value={serialLabel}
              onChange={(e) => setSerialLabel(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="必須 / 依需求 / 不需要"
            />
          </Field>
          <Field label="序列號標籤顏色">
            <select
              value={serialColor}
              onChange={(e) => setSerialColor(e.target.value)}
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
          <Field label="出庫審核標籤">
            <input
              value={issueLabel}
              onChange={(e) => setIssueLabel(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="必須主管審核 / 自動出庫"
            />
          </Field>
          <Field label="出庫審核顏色">
            <select
              value={issueColor}
              onChange={(e) => setIssueColor(e.target.value)}
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
          <Field label="告警差異容許 (%)">
            <input
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              disabled={pending}
              placeholder="0 / 2 / 5（留空 = 不限）"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
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
              啟用此類別
            </label>
          </Field>
          <div className="col-span-2">
            <Field label="範例（顯示於卡片底部）">
              <input
                value={example}
                onChange={(e) => setExample(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="例：引擎組件、電子控制單元"
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
            ) : row ? (
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
      <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-full max-w-[640px] max-h-[90vh] overflow-y-auto">
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
