"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteLayerMetaAction,
  upsertLayerMetaAction,
} from "@/lib/parts-setup/warehouse-arch-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type LayerMetaRow = {
  id: string;
  layer_index: number;
  layer_title: string;
  layer_name: string;
  icon: string | null;
  description: string | null;
  badge_text: string | null;
  badge_color: string;
  accent_color: string;
  is_active: boolean;
};

export type WarehouseSummary = {
  id: string;
  name: string;
  type: string;
  zone_count: number;
  bin_count: number;
  slot_count: number;
  utilization_pct: number; // 0-100
};

type Banner = { ok: boolean; msg: string } | null;

const COLOR_OPTIONS = [
  { key: "navy", label: "藍（深）", header: "bg-[#1A3A5C]", border: "border-[#1A3A5C]", badge: "bg-[#EBF3FF] text-[#1A3A5C]" },
  { key: "blue", label: "藍", header: "bg-[#185FA5]", border: "border-[#185FA5]", badge: "bg-[#EAF4FB] text-[#185FA5]" },
  { key: "teal", label: "青", header: "bg-[#0F6E56]", border: "border-[#0F6E56]", badge: "bg-[#E8F5F0] text-[#0F6E56]" },
  { key: "green", label: "綠", header: "bg-[#3B6D11]", border: "border-[#3B6D11]", badge: "bg-[#EAF3DE] text-[#3B6D11]" },
  { key: "amber", label: "黃", header: "bg-[#854F0B]", border: "border-[#854F0B]", badge: "bg-[#FDF3E3] text-[#854F0B]" },
  { key: "red", label: "紅", header: "bg-[#CC0000]", border: "border-[#CC0000]", badge: "bg-[#FDECEA] text-[#CC0000]" },
  { key: "gray", label: "紫灰", header: "bg-[#7F77DD]", border: "border-[#7F77DD]", badge: "bg-[#F2F2F2] text-[#5A5955]" },
];
function colorMeta(key: string) {
  return COLOR_OPTIONS.find((c) => c.key === key) ?? COLOR_OPTIONS[0];
}

const TYPE_LABEL: Record<string, string> = {
  main: "主倉",
  consignment: "寄存",
  warranty: "保固",
  transit: "在途",
  temporary: "臨時",
  quarantine: "隔離",
  virtual: "虛擬",
};
const TYPE_BADGE: Record<string, string> = {
  main: "bg-[#EBF3FF] text-[#1A3A5C]",
  consignment: "bg-[#E8F5F0] text-[#0F6E56]",
  warranty: "bg-[#FDECEA] text-[#CC0000]",
  transit: "bg-[#FDF3E3] text-[#854F0B]",
  temporary: "bg-[#F2F2F2] text-[#5A5955]",
  quarantine: "bg-[#FDF3E3] text-[#854F0B]",
  virtual: "bg-[#F2F2F2] text-[#5A5955]",
};
function typeBar(pct: number) {
  if (pct >= 80) return "bg-[#CC0000]";
  if (pct >= 60) return "bg-[#0F6E56]";
  if (pct >= 30) return "bg-[#854F0B]";
  return "bg-[#9A9890]";
}

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function WarehouseArchBoard({
  layers,
  warehouses,
  canEdit,
}: {
  layers: LayerMetaRow[];
  warehouses: WarehouseSummary[];
  canEdit: boolean;
}) {
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState<LayerMetaRow | "new" | null>(null);

  useEffect(() => {
    if (!banner || !banner.ok) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  const totalZones = warehouses.reduce((a, w) => a + w.zone_count, 0);
  const totalBins = warehouses.reduce((a, w) => a + w.bin_count, 0);
  const totalSlots = warehouses.reduce((a, w) => a + w.slot_count, 0);

  return (
    <main className="px-6 py-6 space-y-5 bg-[#F8F7F4] min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            倉儲四層架構
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            2.1
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          倉庫 → 庫區 → 庫位 → 擺放位　四層結構說明與設定導覽
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
            ＋ 新增層級
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {layers.length === 0 && (
          <div className="col-span-full rounded-md border border-[#EEECE6] bg-white px-6 py-12 text-center text-[12px] text-[#9A9890]">
            尚無層級設定。
          </div>
        )}
        {layers.map((l) => (
          <LayerCard
            key={l.id}
            layer={l}
            canEdit={canEdit}
            onEdit={() => setEditing(l)}
            onResult={setBanner}
          />
        ))}
      </div>

      <SummaryTable
        warehouses={warehouses}
        totals={{ zones: totalZones, bins: totalBins, slots: totalSlots }}
      />

      {editing && canEdit && (
        <LayerEditModal
          layer={editing === "new" ? null : editing}
          existingIndices={layers.map((l) => l.layer_index)}
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
// Layer Card
// ──────────────────────────────────────────────────────────

function LayerCard({
  layer,
  canEdit,
  onEdit,
  onResult,
}: {
  layer: LayerMetaRow;
  canEdit: boolean;
  onEdit: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const accent = colorMeta(layer.accent_color);
  const badge = colorMeta(layer.badge_color);

  function onDelete() {
    if (!confirm(`刪除「${layer.layer_title}：${layer.layer_name}」？`)) return;
    startTransition(async () => {
      const res = await deleteLayerMetaAction(layer.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除層級" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div
      className={`rounded-lg overflow-hidden border ${accent.border} bg-white ${
        pending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className={`${accent.header} text-white text-center px-3 py-2.5`}>
        {layer.icon && <div className="text-[22px] leading-none">{layer.icon}</div>}
        <div className="text-[14px] font-semibold mt-1">{layer.layer_title}</div>
        <div className="text-[11.5px] opacity-90 mt-0.5">{layer.layer_name}</div>
      </div>
      <div className="px-3 py-3 text-center text-[11.5px] text-[#5A5955] leading-relaxed min-h-[72px]">
        {layer.description}
      </div>
      {layer.badge_text && (
        <div className="px-3 pb-3 text-center">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${badge.badge}`}
          >
            {layer.badge_text}
          </span>
        </div>
      )}
      {canEdit && (
        <div className="px-3 py-2 border-t border-[#EEECE6] bg-[#FAFAF9] flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 px-2 h-[24px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[10.5px]"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-2 h-[24px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[10.5px] hover:bg-[#FDECEA]"
          >
            刪除
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Summary Table（讀現有 warehouses/zones/bins/slots）
// ──────────────────────────────────────────────────────────

function SummaryTable({
  warehouses,
  totals,
}: {
  warehouses: WarehouseSummary[];
  totals: { zones: number; bins: number; slots: number };
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          📋 倉儲架構總覽
        </span>
        <a
          href="/parts/setup/warehouse-bins"
          className="px-2.5 h-[26px] inline-flex items-center rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium"
        >
          進入庫位設定 →
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F7F4] border-b border-[#EEECE6]">
              <Th>倉庫</Th>
              <Th align="center">庫區數</Th>
              <Th align="center">庫位數</Th>
              <Th align="center">擺放位數</Th>
              <Th>使用率</Th>
              <Th align="center">倉庫類型</Th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[12px] text-[#9A9890]"
                >
                  尚無倉庫資料。
                </td>
              </tr>
            )}
            {warehouses.map((w) => (
              <tr key={w.id} className="border-b border-[#EEECE6] last:border-b-0">
                <td className="px-3 py-2 text-[12.5px] font-semibold text-[#2C2C2A]">
                  {w.name}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {w.zone_count}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {w.bin_count}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {w.slot_count}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 min-w-[140px]">
                    <div className="flex-1 h-[6px] rounded bg-[#EEECE6] overflow-hidden">
                      <div
                        className={`h-full rounded ${typeBar(w.utilization_pct)}`}
                        style={{ width: `${Math.max(0, Math.min(100, w.utilization_pct))}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-[#5A5955] w-[40px] text-right">
                      {w.utilization_pct.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                      TYPE_BADGE[w.type] ?? "bg-[#F2F2F2] text-[#5A5955]"
                    }`}
                  >
                    {TYPE_LABEL[w.type] ?? w.type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {warehouses.length > 0 && (
            <tfoot>
              <tr className="bg-[#FAFAF9] border-t border-[#EEECE6]">
                <td className="px-3 py-2 text-[11.5px] font-semibold text-[#5A5955]">
                  合計
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {totals.zones}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {totals.bins}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[11.5px]">
                  {totals.slots}
                </td>
                <td colSpan={2} className="px-3 py-2 text-[11px] text-[#9A9890]">
                  共 {warehouses.length} 座倉庫
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap ${
        align === "center" ? "text-center" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

// ──────────────────────────────────────────────────────────
// Layer Edit Modal
// ──────────────────────────────────────────────────────────

function LayerEditModal({
  layer,
  existingIndices,
  onClose,
  onResult,
}: {
  layer: LayerMetaRow | null;
  existingIndices: number[];
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const nextIndex = (() => {
    for (let i = 1; i <= 9; i++)
      if (!existingIndices.includes(i)) return i;
    return 1;
  })();
  const [layerIndex, setLayerIndex] = useState(layer?.layer_index ?? nextIndex);
  const [title, setTitle] = useState(layer?.layer_title ?? "");
  const [name, setName] = useState(layer?.layer_name ?? "");
  const [icon, setIcon] = useState(layer?.icon ?? "");
  const [description, setDescription] = useState(layer?.description ?? "");
  const [badgeText, setBadgeText] = useState(layer?.badge_text ?? "");
  const [badgeColor, setBadgeColor] = useState(layer?.badge_color ?? "navy");
  const [accentColor, setAccentColor] = useState(layer?.accent_color ?? "navy");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!title.trim() || !name.trim()) {
      setErr("層級標題與名稱必填");
      return;
    }
    startTransition(async () => {
      const res = await upsertLayerMetaAction(layer?.id ?? null, {
        layer_index: layerIndex,
        layer_title: title,
        layer_name: name,
        icon,
        description,
        badge_text: badgeText,
        badge_color: badgeColor,
        accent_color: accentColor,
      });
      if (res.ok) {
        onResult({ ok: true, msg: layer ? "✓ 已更新層級" : "✓ 已新增層級" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <Modal title={layer ? `編輯層級：${layer.layer_title}` : "新增層級"} onClose={onClose}>
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="層級索引 *">
            <input
              type="number"
              min={1}
              max={9}
              value={layerIndex}
              onChange={(e) => setLayerIndex(Number(e.target.value) || 1)}
              disabled={pending || !!layer}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
            />
          </Field>
          <Field label="Icon (emoji)">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              disabled={pending}
              placeholder="🏗 / 📦 / 📌"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="層級標題 *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
              placeholder="第一層"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="層級名稱 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="倉庫 Warehouse"
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="主色">
            <select
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
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
          <Field label="底部徽章顏色">
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
          <div className="col-span-2">
            <Field label="說明文字">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                rows={3}
                className="w-full px-2 py-1.5 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="整個儲存設施的最大單位..."
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="底部徽章文字">
              <input
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                disabled={pending}
                placeholder="例：A 類商品必須設定"
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
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
            ) : layer ? (
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
