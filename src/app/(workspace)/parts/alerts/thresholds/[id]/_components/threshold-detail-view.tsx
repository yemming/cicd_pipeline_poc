"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  ThresholdListRow,
  WarehouseLookup,
  ItemLookup,
} from "@/domain/alerts";
import {
  createThresholdAction,
  updateThresholdAction,
  setThresholdActiveAction,
  deleteThresholdAction,
} from "@/domain/alerts";
import {
  ABC_CHIP,
  ALERT_PRIORITY_CHIP,
  ALERT_PRIORITY_OPTIONS,
} from "@/domain/alerts.constants";

type Draft = {
  warehouse_id: string;
  item_id: string;
  min_stock: string;
  safety_stock: string;
  reorder_point: string;
  max_stock: string;
  abc_class: "" | "A" | "B" | "C";
  alert_priority: "low" | "medium" | "high" | "critical";
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";

const lockedClass =
  "h-[30px] border border-[#EEECE6] bg-[#F8F7F4] rounded px-2 text-[12.5px] text-[#5A5955] w-full inline-flex items-center";

function fromRow(r: ThresholdListRow): Draft {
  return {
    warehouse_id: r.warehouse_id ?? "",
    item_id: r.item_id ?? "",
    min_stock: r.min_stock != null ? String(r.min_stock) : "",
    safety_stock: r.safety_stock != null ? String(r.safety_stock) : "",
    reorder_point: r.reorder_point != null ? String(r.reorder_point) : "",
    max_stock: r.max_stock != null ? String(r.max_stock) : "",
    abc_class: (r.abc_class as "A" | "B" | "C" | null) ?? "",
    alert_priority:
      (r.alert_priority as "low" | "medium" | "high" | "critical" | null) ??
      "medium",
  };
}

function emptyDraft(firstWh: string, firstItem: string): Draft {
  return {
    warehouse_id: firstWh,
    item_id: firstItem,
    min_stock: "0",
    safety_stock: "0",
    reorder_point: "0",
    max_stock: "",
    abc_class: "",
    alert_priority: "medium",
  };
}

export function ThresholdDetailView({
  threshold,
  warehouses,
  items,
  canEdit,
  initialMode = "view",
}: {
  threshold: ThresholdListRow | null;
  warehouses: WarehouseLookup[];
  items: ItemLookup[];
  canEdit: boolean;
  initialMode?: "view" | "edit" | "create";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [draft, setDraft] = useState<Draft>(() => {
    if (initialMode === "create" || !threshold) {
      return emptyDraft(warehouses[0]?.id ?? "", items[0]?.id ?? "");
    }
    return fromRow(threshold);
  });
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function startCreate() {
    setMode("create");
    setDraft(emptyDraft(warehouses[0]?.id ?? "", items[0]?.id ?? ""));
    setFormError(null);
  }

  function startEdit() {
    if (!threshold) return;
    setMode("edit");
    setDraft(fromRow(threshold));
    setFormError(null);
  }

  function cancelEdit() {
    if (!threshold) {
      router.push("/parts/alerts/thresholds");
      return;
    }
    setMode("view");
    setDraft(fromRow(threshold));
    setFormError(null);
  }

  function parseNumber(s: string): number | null {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (Number.isNaN(n)) return null;
    return n;
  }

  function submit() {
    setFormError(null);

    const min = parseNumber(draft.min_stock);
    const safety = parseNumber(draft.safety_stock);
    const reorder = parseNumber(draft.reorder_point);
    const max = parseNumber(draft.max_stock);

    if (min == null || min < 0) {
      setFormError("最低庫存必填、且 ≥ 0");
      return;
    }
    if (reorder == null || reorder < 0) {
      setFormError("再訂購點必填、且 ≥ 0");
      return;
    }
    if (safety != null && safety < 0) {
      setFormError("安全庫存不可為負");
      return;
    }
    if (max != null && max < 0) {
      setFormError("最高水位不可為負");
      return;
    }
    if (max != null && max < reorder) {
      setFormError("最高水位不可低於再訂購點");
      return;
    }

    startTransition(async () => {
      if (mode === "create") {
        if (!draft.warehouse_id || !draft.item_id) {
          setFormError("倉庫 / 料件必選");
          return;
        }
        const res = await createThresholdAction({
          warehouse_id: draft.warehouse_id,
          item_id: draft.item_id,
          min_stock: min,
          safety_stock: safety ?? min,
          reorder_point: reorder,
          max_stock: max,
          abc_class: draft.abc_class || null,
          alert_priority: draft.alert_priority,
        });
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立" });
          router.push(`/parts/alerts/thresholds/${res.data.id}`);
        } else {
          setFormError(res.error);
        }
      } else if (mode === "edit" && threshold) {
        const res = await updateThresholdAction(threshold.id, {
          warehouse_id: draft.warehouse_id,
          item_id: draft.item_id,
          min_stock: min,
          safety_stock: safety ?? min,
          reorder_point: reorder,
          max_stock: max,
          abc_class: draft.abc_class || null,
          alert_priority: draft.alert_priority,
        });
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
    if (!threshold) return;
    startTransition(async () => {
      const res = await setThresholdActiveAction(threshold.id, !threshold.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: threshold.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeThis() {
    if (!threshold) return;
    if (!confirm("確定刪除此水位設定？此動作無法復原。")) return;
    startTransition(async () => {
      const res = await deleteThresholdAction(threshold.id);
      if (res.ok) {
        router.push("/parts/alerts/thresholds");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const isLocked = pending;

  // 顯示用的名稱（view mode 從 threshold 拿；edit mode 從 lookup 找）
  const whName =
    warehouses.find((w) => w.id === draft.warehouse_id)?.name ??
    threshold?.warehouse_name ??
    "—";
  const whCode = warehouses.find((w) => w.id === draft.warehouse_id)?.code ?? "";
  const itName = threshold?.item_name ?? "—";
  const itCode = threshold?.item_code ?? "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1) Breadcrumb + 模式 badge + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/alerts/thresholds"
            className="hover:text-[#185FA5]"
          >
            庫存水位設定
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {isCreating ? "新增" : threshold?.item_code ?? threshold?.id?.slice(0, 8) ?? "—"}
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
          {mode === "view" && threshold && (
            <>
              <Link
                href="/parts/alerts/thresholds"
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
                {threshold.is_active ? "停用" : "啟用"}
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
                href="/parts/alerts/thresholds"
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
                STOCK THRESHOLD ・ 庫存水位
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? "（未建立的水位）" : itName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{isCreating ? "—" : itCode}</span>
                {!isCreating && threshold?.abc_class && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                      ABC_CHIP[threshold.abc_class] ?? ""
                    }`}
                  >
                    {threshold.abc_class}
                  </span>
                )}
                {!isCreating && threshold && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                      threshold.is_active
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#F2F2F2] text-[#6B6A68]"
                    }`}
                  >
                    {threshold.is_active ? "啟用" : "停用"}
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
              {isCreating ? "建立後可看到料件圖" : "（圖片預留）"}
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
            label="倉庫 *"
            value={
              isCreating ? (
                <select
                  value={draft.warehouse_id}
                  onChange={(e) => setDraft({ ...draft, warehouse_id: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} ・ {w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={lockedClass}>
                  {whCode} ・ {whName}
                </span>
              )
            }
          />
          <Kv
            label="料件 *"
            value={
              isCreating ? (
                <select
                  value={draft.item_id}
                  onChange={(e) => setDraft({ ...draft, item_id: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} ・ {i.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={lockedClass}>
                  {itCode} ・ {itName}
                </span>
              )
            }
          />
          <Kv
            label="ABC 類別"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.abc_class}
                  onChange={(e) =>
                    setDraft({ ...draft, abc_class: e.target.value as Draft["abc_class"] })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  <option value="">（未分類）</option>
                  <option value="A">A 類</option>
                  <option value="B">B 類</option>
                  <option value="C">C 類</option>
                </select>
              ) : threshold?.abc_class ? (
                threshold.abc_class
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* 4) Section card — 水位數值 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 水位數值</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-3">
          <Kv
            label="最低庫存 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={0}
                  value={draft.min_stock}
                  onChange={(e) => setDraft({ ...draft, min_stock: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{threshold?.min_stock ?? "—"}</span>
              )
            }
          />
          <Kv
            label="安全庫存"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={0}
                  value={draft.safety_stock}
                  onChange={(e) => setDraft({ ...draft, safety_stock: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{threshold?.safety_stock ?? "—"}</span>
              )
            }
          />
          <Kv
            label="再訂購點 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={0}
                  value={draft.reorder_point}
                  onChange={(e) => setDraft({ ...draft, reorder_point: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{threshold?.reorder_point ?? "—"}</span>
              )
            }
          />
          <Kv
            label="最高水位"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  min={0}
                  value={draft.max_stock}
                  onChange={(e) => setDraft({ ...draft, max_stock: e.target.value })}
                  disabled={isLocked}
                  placeholder="（選填）"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{threshold?.max_stock ?? "—"}</span>
              )
            }
          />
        </div>
      </section>

      {/* 5) Section card — 告警 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 告警設定</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="告警等級"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.alert_priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      alert_priority: e.target.value as Draft["alert_priority"],
                    })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  {ALERT_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                (() => {
                  const def =
                    ALERT_PRIORITY_CHIP[threshold?.alert_priority ?? ""] ??
                    ALERT_PRIORITY_CHIP.normal;
                  return (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
                    >
                      {def.label}
                    </span>
                  );
                })()
              )
            }
          />
          <Kv
            label="建立時間"
            value={
              <span className="font-mono text-[11.5px] text-[#9A9890]">
                {threshold?.created_at ? threshold.created_at.slice(0, 10) : "—"}
              </span>
            }
            small
          />
          <Kv
            label="更新時間"
            value={
              <span className="font-mono text-[11.5px] text-[#9A9890]">
                {threshold?.updated_at ? threshold.updated_at.slice(0, 10) : "—"}
              </span>
            }
            small
          />
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
