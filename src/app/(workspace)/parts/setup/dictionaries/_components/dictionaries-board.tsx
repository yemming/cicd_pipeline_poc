"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addDictionary,
  updateDictionary,
  setDictionaryActive,
  deleteDictionary,
  type DictionaryInput,
  type DictionaryKind,
  type DictionaryRow,
} from "@/domain/dictionaries";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Banner = { ok: boolean; msg: string } | null;

const TABS: { kind: DictionaryKind; label: string; hint: string }[] = [
  { kind: "category", label: "品類", hint: "備件主檔的「品類」下拉，例：耗材、煞車系統" },
  { kind: "control_level", label: "管控等級", hint: "備件主檔的「管控」下拉，例：A 類 / B 類 / C 類" },
  { kind: "uom", label: "單位", hint: "備件主檔的「單位」下拉，例：個、瓶、組" },
];

const ACCENT_OPTIONS = [
  { value: "", label: "—" },
  { value: "red", label: "紅" },
  { value: "amber", label: "琥珀" },
  { value: "teal", label: "綠" },
  { value: "blue", label: "藍" },
  { value: "navy", label: "深藍" },
  { value: "gray", label: "灰" },
];

function accentClass(c: string | null): string {
  switch (c) {
    case "red":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "amber":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "teal":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "blue":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "navy":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "gray":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F8F7F4] text-[#5A5955]";
  }
}

const TAB_LABEL = Object.fromEntries(TABS.map((t) => [t.kind, t.label]));

function blankDraft(k: DictionaryKind): DictionaryInput {
  return {
    kind: k,
    code: "",
    label: "",
    description: "",
    accent_color: "",
    sort_order: 0,
    is_active: true,
  };
}

export function DictionariesBoard({
  rows,
  canEdit,
  referenceCounts,
}: {
  rows: DictionaryRow[];
  canEdit: boolean;
  referenceCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [activeKind, setActiveKind] = useState<DictionaryKind>("category");
  const [modalMode, setModalMode] = useState<
    { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string }
  >({ kind: "closed" });
  const [draft, setDraft] = useState<DictionaryInput>(() => blankDraft("category"));
  const [confirmDeleteId, setConfirmDeleteId] = useState<{ id: string; label: string } | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<DictionaryKind, DictionaryRow[]>();
    for (const r of rows) {
      const arr = m.get(r.kind) ?? [];
      arr.push(r);
      m.set(r.kind, arr);
    }
    return m;
  }, [rows]);

  const visibleRows = grouped.get(activeKind) ?? [];

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function switchTab(k: DictionaryKind) {
    setActiveKind(k);
    setModalMode({ kind: "closed" });
    setDraft(blankDraft(k));
  }

  function openCreate() {
    setDraft(blankDraft(activeKind));
    setModalMode({ kind: "create" });
  }

  function openEdit(r: DictionaryRow) {
    setDraft({
      kind: r.kind,
      code: r.code,
      label: r.label,
      description: r.description ?? "",
      accent_color: r.accent_color ?? "",
      sort_order: r.sort_order,
      is_active: r.is_active,
    });
    setModalMode({ kind: "edit", id: r.id });
  }

  function handleSubmit() {
    startTransition(async () => {
      const res =
        modalMode.kind === "edit"
          ? await updateDictionary(modalMode.id, {
              code: draft.code,
              label: draft.label,
              description: draft.description ?? "",
              accent_color: draft.accent_color ?? "",
              sort_order: draft.sort_order,
              is_active: draft.is_active,
            })
          : modalMode.kind === "create"
            ? await addDictionary({ ...draft, kind: activeKind })
            : null;
      if (!res) return;
      if (res.ok) {
        flash({
          ok: true,
          msg: modalMode.kind === "edit" ? "✓ 已儲存變更" : "✓ 已新增",
        });
        setModalMode({ kind: "closed" });
        setDraft(blankDraft(activeKind));
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  }

  function toggleActive(id: string, next: boolean) {
    startTransition(async () => {
      const res = await setDictionaryActive(id, next);
      if (res.ok) {
        flash({ ok: true, msg: next ? "✓ 已啟用" : "✓ 已停用" });
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  }

  function confirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId.id;
    startTransition(async () => {
      const res = await deleteDictionary(id);
      if (res.ok) {
        flash({ ok: true, msg: "✓ 已刪除" });
        setConfirmDeleteId(null);
        if (modalMode.kind === "edit" && modalMode.id === id) setModalMode({ kind: "closed" });
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
        setConfirmDeleteId(null);
      }
    });
  }

  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] disabled:bg-[#F8F7F4]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const tabHint = TABS.find((t) => t.kind === activeKind)?.hint ?? "";

  const columns: DataGridColumn<DictionaryRow>[] = useMemo(
    () => [
      {
        id: "code",
        header: "代碼",
        width: 140,
        hideable: false,
        cell: (r) => <span className="font-mono text-[12px]">{r.code}</span>,
        exportValue: (r) => r.code,
        sortValue: (r) => r.code,
      },
      {
        id: "label",
        header: "顯示名稱",
        width: 220,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-medium ${accentClass(
              r.accent_color,
            )}`}
          >
            {r.label}
          </span>
        ),
        exportValue: (r) => r.label,
        sortValue: (r) => r.label,
        editable: canEdit
          ? {
              type: "text",
              getValue: (r) => r.label,
              onSave: async (r, value) => {
                const v = value.trim();
                if (!v) return { ok: false, error: "顯示名稱不可為空" };
                const res = await updateDictionary(r.id, { label: v });
                if (res.ok) {
                  flash({ ok: true, msg: "✓ 已更新" });
                  router.refresh();
                }
                return res;
              },
            }
          : undefined,
      },
      {
        id: "description",
        header: "說明",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.description || "—"}</span>
        ),
        exportValue: (r) => r.description ?? "",
        sortValue: (r) => r.description ?? "",
        editable: canEdit
          ? {
              type: "textarea",
              getValue: (r) => r.description ?? "",
              onSave: async (r, value) => {
                const res = await updateDictionary(r.id, { description: value });
                if (res.ok) {
                  flash({ ok: true, msg: "✓ 已更新" });
                  router.refresh();
                }
                return res;
              },
            }
          : undefined,
      },
      {
        id: "sort_order",
        header: "排序",
        width: 80,
        align: "right",
        defaultHidden: true,
        cell: (r) => <span className="font-mono text-[12px] text-[#5A5955]">{r.sort_order}</span>,
        exportValue: (r) => r.sort_order,
        sortValue: (r) => r.sort_order,
      },
      {
        id: "accent_color",
        header: "顏色",
        width: 80,
        defaultHidden: true,
        sortable: false,
        cell: (r) => (
          <span className="text-[11px] text-[#9A9890]">{r.accent_color || "—"}</span>
        ),
        exportValue: (r) => r.accent_color ?? "",
      },
      {
        id: "is_active",
        header: "狀態",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
    ],
    [canEdit, router],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">下拉選單對應 (Mapping)</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          基礎設定
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理備件主檔下拉選單的可選項目（品類 / 管控等級 / 單位）
        </span>
        <Link
          href="/parts/setup/items"
          className="ml-auto h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 回商品主檔
        </Link>
      </header>

      {/* Tabs */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="flex border-b border-[#EEECE6] bg-[#F8F7F4]">
          {TABS.map((t) => {
            const count = (grouped.get(t.kind) ?? []).length;
            const active = t.kind === activeKind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => switchTab(t.kind)}
                className={`px-4 h-[40px] text-[12.5px] font-medium border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] border-b-2 border-b-[#0F6E56] -mb-px"
                    : "text-[#5A5955] hover:bg-white"
                }`}
              >
                {t.label}
                <span
                  className={`ml-2 inline-flex items-center px-1.5 rounded text-[10.5px] ${
                    active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#EEECE6] text-[#5A5955]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-[#9A9890] border-b border-[#EEECE6]">
          <span>{tabHint}</span>
          <span className="text-[#5A5955]">
            共 <b className="text-[#2C2C2A]">{visibleRows.length}</b> 筆
          </span>
          <button
            type="button"
            disabled={!canEdit || isPending}
            onClick={openCreate}
            className="ml-auto h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增{TAB_LABEL[activeKind]}
          </button>
        </div>

        <div className="px-3 pt-3 pb-3">
          <DataGrid
            columns={columns}
            data={visibleRows}
            rowKey={(r) => r.id}
            persistKey={`parts/setup/dictionaries/${activeKind}`}
            exportFileName={`dictionaries-${activeKind}`}
            emptyMessage="尚無項目，按右上角「新增」開始建立"
            disabled={isPending}
            rowActionsWidth={210}
            rowActions={
              canEdit
                ? (r) => (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(r.id, !r.is_active)}
                        className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        {r.is_active ? "停用" : "啟用"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId({ id: r.id, label: r.label })}
                        className="h-[26px] px-2.5 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9]"
                      >
                        刪除
                      </button>
                    </>
                  )
                : undefined
            }
          />
        </div>
      </section>

      {/* Footer note about control_level */}
      {activeKind === "control_level" ? (
        <p className="text-[11.5px] text-[#9A9890] leading-relaxed">
          ⚠ 管控等級的完整定義（價格基準、盤點頻率、容差％等）請至{" "}
          <Link href="/parts/setup/control-types" className="text-[#185FA5] underline">
            管控類型定義
          </Link>{" "}
          頁面設定；本頁僅維護下拉顯示用的代碼與標籤。
        </p>
      ) : null}

      {/* Create / Edit Modal */}
      {modalMode.kind !== "closed" ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[600px] max-h-[90vh] overflow-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {modalMode.kind === "edit"
                  ? `編輯${TAB_LABEL[activeKind]}：${draft.code || "—"}`
                  : `新增${TAB_LABEL[activeKind]}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode({ kind: "closed" })}
                className="text-[#9A9890] hover:text-[#5A5955] text-[18px] leading-none"
              >
                ×
              </button>
            </header>
            <div className="px-4 py-3 grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className={labelClass}>代碼 *</label>
                {(() => {
                  const editingId = modalMode.kind === "edit" ? modalMode.id : null;
                  const refCount = editingId ? referenceCounts[editingId] ?? 0 : 0;
                  const codeLocked = editingId !== null && refCount > 0;
                  return (
                    <>
                      <input
                        value={draft.code}
                        onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                        className={inputClass + " font-mono"}
                        placeholder={activeKind === "control_level" ? "A / B / C" : ""}
                        disabled={codeLocked}
                        title={codeLocked ? `被 ${refCount} 筆商品引用，不可改代碼` : undefined}
                      />
                      {codeLocked ? (
                        <div className="text-[10.5px] text-[#854F0B] mt-0.5">
                          🔒 已被 {refCount} 筆商品使用、不可改代碼
                        </div>
                      ) : editingId ? (
                        <div className="text-[10.5px] text-[#9A9890] mt-0.5">
                          無商品引用、可改代碼
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <div className="col-span-8">
                <label className={labelClass}>顯示名稱 *</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="col-span-12">
                <label className={labelClass}>說明</label>
                <input
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="col-span-3">
                <label className={labelClass}>排序</label>
                <input
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
                  className={inputClass + " font-mono"}
                />
              </div>
              <div className="col-span-3">
                <label className={labelClass}>顏色</label>
                <select
                  value={draft.accent_color ?? ""}
                  onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })}
                  className={inputClass}
                >
                  {ACCENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {modalMode.kind === "edit" ? (
                <div className="col-span-6 flex items-end">
                  <label className="inline-flex items-center gap-1.5 text-[12px]">
                    <input
                      type="checkbox"
                      checked={draft.is_active ?? true}
                      onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                    />
                    啟用
                  </label>
                </div>
              ) : null}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalMode({ kind: "closed" })}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending
                  ? modalMode.kind === "edit"
                    ? "儲存中⋯"
                    : "建立中⋯"
                  : modalMode.kind === "edit"
                    ? "儲存變更"
                    : "建立"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Delete confirm Modal */}
      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#CC0000]">確認刪除</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              確定要刪除「<b>{confirmDeleteId.label}</b>」？此動作無法還原。
              <div className="text-[11px] text-[#9A9890] mt-1">
                如該項目仍被商品引用，系統會擋下並提示。
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                {isPending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner fixed bottom-right */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
