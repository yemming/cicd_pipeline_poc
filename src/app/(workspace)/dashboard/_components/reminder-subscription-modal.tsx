"use client";

/**
 * 自訂提醒 Modal
 *
 * 結構：
 *   上半：「我的提醒（6 slot）」— 可拖曳排序；每個 slot 右側 x 鈕取消
 *   下半：「可訂閱清單」— 按 category 分組；點 + 加入空 slot；已訂閱顯示 ✓
 *   底部：[取消] [儲存]，儲存呼叫 reorderRemindersAction
 *
 * 滿 6 個按「+ 加入」會提示「請先取消或拖曳替換」。
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  ACCENT_HEX,
  CATEGORY_LABEL,
  MAX_REMINDER_SLOTS,
  type ReminderCategory,
  type ReminderDefinition,
  type ReminderItem,
  type ReminderSlots,
} from "@/domain/reminders.constants";
import { reorderRemindersAction } from "@/lib/dashboard/reminder-actions";

// Modal 內部用的「slot row」資料；id 一定要存在才能拖曳，
// 對空 slot 用 `__empty_{idx}` 當 id。
type SlotRow =
  | { kind: "filled"; id: string; code: string; def: ReminderDefinition }
  | { kind: "empty"; id: string };

function buildInitialRows(
  slots: ReminderSlots,
  catalogByCode: Map<string, ReminderDefinition>,
): SlotRow[] {
  return Array.from({ length: MAX_REMINDER_SLOTS }).map((_, idx) => {
    const item = slots[idx];
    if (item) {
      const def = catalogByCode.get(item.code);
      if (def) {
        return { kind: "filled", id: `code:${item.code}`, code: item.code, def };
      }
    }
    return { kind: "empty", id: `__empty_${idx}` };
  });
}

function rowsToCodes(rows: SlotRow[]): (string | null)[] {
  return rows.map((r) => (r.kind === "filled" ? r.code : null));
}

// 把 saved 後的 codes 轉回 ReminderSlots（不包含 count，需要 server 端 refresh）
function codesToOptimisticSlots(
  codes: (string | null)[],
  catalogByCode: Map<string, ReminderDefinition>,
  prevSlots: ReminderSlots,
): ReminderSlots {
  const prevByCode = new Map<string, ReminderItem>();
  for (const item of prevSlots) {
    if (item) prevByCode.set(item.code, item);
  }
  return codes.map((code, idx) => {
    if (!code) return null;
    const def = catalogByCode.get(code);
    if (!def) return null;
    const prev = prevByCode.get(code);
    const item: ReminderItem = {
      slotIndex: idx,
      code,
      label: def.label,
      description: def.description,
      icon: def.icon,
      accent: def.accent,
      category: def.category,
      // 樂觀更新：原本訂閱過的保留舊 count，新訂閱的先顯示 0（重新整理後會更新）
      count: prev?.count ?? 0,
      targetHref: def.target_href_template,
      error: prev?.error ?? null,
    };
    return item;
  });
}

export default function ReminderSubscriptionModal({
  open,
  onClose,
  currentSlots,
  catalog,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentSlots: ReminderSlots;
  catalog: ReminderDefinition[];
  onSaved: (nextSlots: ReminderSlots) => void;
}) {
  const catalogByCode = useMemo(
    () => new Map(catalog.map((c) => [c.code, c])),
    [catalog],
  );

  const [rows, setRows] = useState<SlotRow[]>(() =>
    buildInitialRows(currentSlots, catalogByCode),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(buildInitialRows(currentSlots, catalogByCode));
  }, [currentSlots, catalogByCode]);

  // ESC 關 modal（只在 open 時掛 listener）
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const usedCodes = useMemo(
    () => new Set(rows.filter((r): r is Extract<SlotRow, { kind: "filled" }> => r.kind === "filled").map((r) => r.code)),
    [rows],
  );
  const filledCount = usedCodes.size;
  const remainingSlots = MAX_REMINDER_SLOTS - filledCount;

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIdx = prev.findIndex((r) => r.id === active.id);
      const newIdx = prev.findIndex((r) => r.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  function handleRemove(code: string) {
    setError(null);
    setRows((prev) =>
      prev.map((r, idx) =>
        r.kind === "filled" && r.code === code ? { kind: "empty", id: `__empty_${idx}` } : r,
      ),
    );
  }

  function handleAdd(def: ReminderDefinition) {
    setError(null);
    if (usedCodes.has(def.code)) return;
    if (remainingSlots <= 0) {
      setError("已達 6 個上限、請先取消或拖曳取代");
      return;
    }
    setRows((prev) => {
      const emptyIdx = prev.findIndex((r) => r.kind === "empty");
      if (emptyIdx < 0) return prev;
      const next = [...prev];
      next[emptyIdx] = { kind: "filled", id: `code:${def.code}`, code: def.code, def };
      return next;
    });
  }

  function handleSave() {
    setError(null);
    const codes = rowsToCodes(rows);
    startTransition(async () => {
      const res = await reorderRemindersAction(codes);
      if (res.ok) {
        const optimistic = codesToOptimisticSlots(codes, catalogByCode, currentSlots);
        onSaved(optimistic);
      } else {
        setError(res.error);
      }
    });
  }

  // 依 category 分組 catalog
  const grouped = useMemo(() => {
    const map = new Map<ReminderCategory, ReminderDefinition[]>();
    for (const d of catalog) {
      const arr = map.get(d.category) ?? [];
      arr.push(d);
      map.set(d.category, arr);
    }
    return Array.from(map.entries());
  }, [catalog]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3.5 border-b border-[#EEECE6] flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[#1A3A5C]">tune</span>
          <h2 className="text-[15px] font-semibold text-[#2C2C2A]">自訂提醒</h2>
          <span className="text-[12px] text-[#9A9890]">
            最多 {MAX_REMINDER_SLOTS} 個・拖曳調整順序
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="ml-auto text-slate-400 hover:text-slate-700 text-[20px]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 上半：我的提醒 */}
          <section>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-[13px] font-semibold text-[#2C2C2A]">
                我的提醒
              </h3>
              <span className="text-[11px] text-[#9A9890]">
                {filledCount} / {MAX_REMINDER_SLOTS}
              </span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rows.map((r) => r.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-3 gap-2">
                  {rows.map((row) => (
                    <SortableSlot key={row.id} row={row} onRemove={handleRemove} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>

          {/* 下半：可訂閱清單 */}
          <section>
            <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-2">可訂閱清單</h3>
            <div className="space-y-3">
              {grouped.map(([category, defs]) => (
                <div key={category} className="border border-[#EEECE6] rounded-lg overflow-hidden">
                  <header className="px-3 py-1.5 bg-[#F8F7F4] border-b border-[#EEECE6]">
                    <span className="text-[12px] font-semibold text-[#5A5955]">
                      {CATEGORY_LABEL[category]}
                    </span>
                  </header>
                  <div className="divide-y divide-[#F1F0EC]">
                    {defs.map((def) => {
                      const subscribed = usedCodes.has(def.code);
                      return (
                        <CatalogRow
                          key={def.code}
                          def={def}
                          subscribed={subscribed}
                          disabled={pending}
                          onAdd={() => handleAdd(def)}
                          onRemove={() => handleRemove(def.code)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] bg-[#FAFAF7] flex items-center gap-3">
          {error && <div className="text-[12px] text-[#CC0000]">{error}</div>}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium text-white shadow-sm disabled:opacity-60 ${
                pending ? "bg-[#0F6E56]/70 pointer-events-none" : "bg-[#0F6E56] hover:bg-[#0a5742]"
              }`}
            >
              {pending ? "儲存中⋯" : "儲存"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SortableSlot({
  row,
  onRemove,
}: {
  row: SlotRow;
  onRemove: (code: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  if (row.kind === "empty") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="border border-dashed border-slate-300 rounded-lg px-3 py-2 h-[58px] flex items-center justify-center text-[11px] text-slate-400 bg-white/60"
      >
        空 slot
      </div>
    );
  }

  const accent = ACCENT_HEX[row.def.accent];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-[#EEECE6] rounded-lg bg-white px-3 py-2 h-[58px] flex items-center gap-2"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 select-none"
        title="拖曳"
      >
        <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
      </div>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        <span className="material-symbols-outlined text-[16px]">{row.def.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-[#2C2C2A] truncate">{row.def.label}</div>
        <div className="text-[10.5px] text-[#9A9890] truncate">{row.def.description ?? ""}</div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(row.code)}
        className="text-slate-400 hover:text-[#CC0000] text-[16px]"
        title="取消訂閱"
        aria-label="取消訂閱"
      >
        ×
      </button>
    </div>
  );
}

function CatalogRow({
  def,
  subscribed,
  disabled,
  onAdd,
  onRemove,
}: {
  def: ReminderDefinition;
  subscribed: boolean;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const accent = ACCENT_HEX[def.accent];
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        <span className="material-symbols-outlined text-[16px]">{def.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-[#2C2C2A] truncate">{def.label}</div>
        <div className="text-[10.5px] text-[#9A9890] truncate">{def.description ?? ""}</div>
      </div>
      {subscribed ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px] text-[#0F6E56]">check</span>
          取消訂閱
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          ＋ 加入
        </button>
      )}
    </div>
  );
}
