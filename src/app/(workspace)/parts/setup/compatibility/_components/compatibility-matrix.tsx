"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkApplyCompatibilityAction,
  createCompatAction,
  updateCompatAction,
  deleteCompatAction,
  type BulkApplyInput,
} from "@/lib/parts-setup/compatibility-actions";
import {
  type CompatMatrix,
  type MatrixItemRow,
  type MatrixModelCol,
  type MatrixCell,
} from "@/domain/compatibility";
import { MatrixSelector } from "@/components/visualization";

type Banner = { ok: boolean; msg: string } | null;
type CellModal =
  | { kind: "closed" }
  | {
      kind: "cell";
      item: MatrixItemRow;
      model: MatrixModelCol;
      existing: MatrixCell | null;
    };
type BulkModal =
  | { kind: "closed" }
  | { kind: "rowItems"; preset?: { itemId?: string; modelId?: string } };

function fmtRange(s: number | null, e: number | null): string {
  if (s == null && e == null) return "全年份";
  if (s != null && e != null) {
    if (s === e) return String(s);
    return `${s}–${e}`;
  }
  return s != null ? `${s}+` : `–${e}`;
}

export function CompatibilityMatrix({
  matrix,
  filter,
  canEdit,
  allSeries,
}: {
  matrix: CompatMatrix;
  filter: { series: string | null; category: string | null; search: string | null };
  canEdit: boolean;
  allSeries: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [cellModal, setCellModal] = useState<CellModal>({ kind: "closed" });
  const [bulkModal, setBulkModal] = useState<BulkModal>({ kind: "closed" });
  const [searchInput, setSearchInput] = useState<string>(filter.search ?? "");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const pushFilter = (next: { series?: string | null; category?: string | null; search?: string | null }) => {
    const params = new URLSearchParams();
    const series = next.series !== undefined ? next.series : filter.series;
    const category = next.category !== undefined ? next.category : filter.category;
    const search = next.search !== undefined ? next.search : filter.search;
    if (series) params.set("series", series);
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    params.set("view", "matrix");
    router.push(`/parts/setup/compatibility?${params.toString()}`);
  };

  const cellOf = (itemId: string, modelId: string): MatrixCell | null =>
    matrix.cells[`${itemId}|${modelId}`] ?? null;

  const openCell = (item: MatrixItemRow, model: MatrixModelCol) => {
    setCellModal({ kind: "cell", item, model, existing: cellOf(item.id, model.id) });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <section className="space-y-3" data-testid="compatibility-matrix">
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[100] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">車系</label>
            <select
              value={filter.series ?? ""}
              onChange={(e) => pushFilter({ series: e.target.value || null })}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
              data-testid="matrix-series"
            >
              <option value="">— 全部車系 —</option>
              {allSeries.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">品類</label>
            <select
              value={filter.category ?? ""}
              onChange={(e) => pushFilter({ category: e.target.value || null })}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
              data-testid="matrix-category"
            >
              <option value="">— 全部品類 —</option>
              {matrix.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋料號 / 名稱</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") pushFilter({ search: searchInput.trim() || null });
              }}
              placeholder="例：HOND-OIL / 機油"
              className="h-[30px] w-[200px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
              data-testid="matrix-search"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              disabled={isPending}
              onClick={() => pushFilter({ search: searchInput.trim() || null })}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              data-testid="matrix-apply-filter"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setSearchInput("");
                pushFilter({ series: null, category: null, search: null });
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              disabled={!canEdit || isPending}
              onClick={() => setBulkModal({ kind: "rowItems" })}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              data-testid="matrix-bulk-open"
            >
              ＋ 批次套用適配
            </button>
          </div>
        </div>
      </section>

      {/* Matrix */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            適配矩陣（料號 × 車型）
          </h2>
          <span className="text-[11.5px] text-[#9A9890]">
            {matrix.items.length} 個備件 × {matrix.models.length} 個車型 ・ {Object.keys(matrix.cells).length} 筆適配
          </span>
        </header>
        {matrix.items.length === 0 || matrix.models.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12.5px] text-[#9A9890]">
            {matrix.items.length === 0
              ? "沒有符合條件的備件（請放寬品類 / 搜尋）"
              : "沒有可用車型（請選別的車系）"}
          </div>
        ) : (
          <div className={`relative overflow-auto max-h-[640px] ${lockedClass}`}>
            <table className="border-collapse text-[12px]" data-testid="matrix-table">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 top-0 z-30 bg-[#F8F7F4] border-b border-r border-[#EEECE6] px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium"
                    style={{ minWidth: 220 }}
                  >
                    料號 / 名稱
                  </th>
                  {matrix.models.map((m) => (
                    <th
                      key={m.id}
                      className="sticky top-0 z-20 bg-[#F8F7F4] border-b border-[#EEECE6] px-2 py-2 text-center text-[11px] text-[#2C2C2A] font-semibold whitespace-nowrap"
                      style={{ minWidth: 110 }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span>{m.display_name || m.model_name}</span>
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          onClick={() => setBulkModal({ kind: "rowItems", preset: { modelId: m.id } })}
                          className="text-[10px] text-[#185FA5] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`套用整欄到 ${m.display_name || m.model_name}`}
                          data-testid={`matrix-col-batch-${m.id}`}
                        >
                          套用整欄
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.items.map((it) => (
                  <tr key={it.id} className="hover:bg-[#FCFBF8]">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white border-b border-r border-[#EEECE6] px-3 py-2 text-left whitespace-nowrap"
                      style={{ minWidth: 220 }}
                    >
                      <div className="font-mono text-[12px] text-[#185FA5]">{it.code}</div>
                      <div className="text-[11.5px] text-[#2C2C2A] font-normal">{it.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {it.category ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-[#EEF4FB] text-[#185FA5]">
                            {it.category}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          onClick={() => setBulkModal({ kind: "rowItems", preset: { itemId: it.id } })}
                          className="text-[10px] text-[#185FA5] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                          title={`套用整列到 ${it.code}`}
                          data-testid={`matrix-row-batch-${it.id}`}
                        >
                          套用整列
                        </button>
                      </div>
                    </th>
                    {matrix.models.map((m) => {
                      const c = cellOf(it.id, m.id);
                      const has = !!c;
                      return (
                        <td
                          key={m.id}
                          className="border-b border-[#EEECE6] text-center p-0"
                          style={{ minWidth: 110 }}
                        >
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => openCell(it, m)}
                            className={`w-full h-[44px] inline-flex items-center justify-center text-[11px] transition-colors hover:bg-[#EAF4FB] disabled:cursor-not-allowed ${
                              has
                                ? c!.is_verified
                                  ? "bg-[#EAF3DE] text-[#3B6D11] font-semibold"
                                  : "bg-[#FDF3E3] text-[#854F0B] font-medium"
                                : "bg-white text-[#9A9890]"
                            }`}
                            aria-label={`${it.code} × ${m.model_name} ${has ? `${fmtRange(c!.year_start, c!.year_end)}` : "未設定"}`}
                            data-testid={`matrix-cell-${it.id}-${m.id}`}
                          >
                            {has ? fmtRange(c!.year_start, c!.year_end) : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3 text-[11px] text-[#9A9890]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[#EAF3DE] border border-[#C5DC9F]" />
          已驗證
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[#FDF3E3] border border-[#F5DDB1]" />
          待確認
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-white border border-[#EEECE6]" />
          未設定（點擊建立）
        </span>
        {!canEdit ? <span className="ml-auto">💡 唯讀模式</span> : null}
      </div>

      {/* Cell Modal */}
      {cellModal.kind === "cell" ? (
        <CellEditModal
          item={cellModal.item}
          model={cellModal.model}
          existing={cellModal.existing}
          canEdit={canEdit}
          isPending={isPending}
          onClose={() => setCellModal({ kind: "closed" })}
          onSave={(input, mode) => {
            startTransition(async () => {
              if (mode === "delete" && cellModal.existing) {
                const res = await deleteCompatAction(cellModal.existing.compat_id);
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已移除此適配" });
                  setCellModal({ kind: "closed" });
                  router.refresh();
                } else {
                  showBanner({ ok: false, msg: res.error });
                }
                return;
              }
              const res = cellModal.existing
                ? await updateCompatAction(cellModal.existing.compat_id, input)
                : await createCompatAction({
                    item_id: cellModal.item.id,
                    vehicle_model_id: cellModal.model.id,
                    year_start: input.year_start ?? null,
                    year_end: input.year_end ?? null,
                    notes: input.notes ?? null,
                    is_verified: input.is_verified ?? false,
                  });
              if (res.ok) {
                showBanner({
                  ok: true,
                  msg: cellModal.existing ? "✓ 已更新適配" : "✓ 已新增適配",
                });
                setCellModal({ kind: "closed" });
                router.refresh();
              } else {
                showBanner({ ok: false, msg: res.error });
              }
            });
          }}
        />
      ) : null}

      {/* Bulk Modal */}
      {bulkModal.kind === "rowItems" ? (
        <BulkApplyModal
          matrix={matrix}
          preset={bulkModal.preset}
          isPending={isPending}
          onClose={() => setBulkModal({ kind: "closed" })}
          onApply={(input) => {
            startTransition(async () => {
              const res = await bulkApplyCompatibilityAction(input);
              if (res.ok) {
                const { inserted, updated, skipped } = res.data;
                showBanner({
                  ok: true,
                  msg: `✓ 批次完成：新增 ${inserted} ・ 更新 ${updated}${skipped ? ` ・ 略過 ${skipped}` : ""}`,
                });
                setBulkModal({ kind: "closed" });
                router.refresh();
              } else {
                showBanner({ ok: false, msg: res.error });
              }
            });
          }}
        />
      ) : null}
    </section>
  );
}

// ───────────────────────────────────────────────────────── Cell modal

function CellEditModal({
  item,
  model,
  existing,
  canEdit,
  isPending,
  onClose,
  onSave,
}: {
  item: MatrixItemRow;
  model: MatrixModelCol;
  existing: MatrixCell | null;
  canEdit: boolean;
  isPending: boolean;
  onClose: () => void;
  onSave: (
    input: {
      year_start: number | null;
      year_end: number | null;
      notes: string | null;
      is_verified: boolean;
    },
    mode: "save" | "delete",
  ) => void;
}) {
  const [yearStart, setYearStart] = useState<string>(
    existing?.year_start != null ? String(existing.year_start) : "",
  );
  const [yearEnd, setYearEnd] = useState<string>(
    existing?.year_end != null ? String(existing.year_end) : "",
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [verified, setVerified] = useState<boolean>(existing?.is_verified ?? false);

  const submit = () => {
    onSave(
      {
        year_start: yearStart ? Number(yearStart) : null,
        year_end: yearEnd ? Number(yearEnd) : null,
        notes: notes.trim() || null,
        is_verified: verified,
      },
      "save",
    );
  };

  return (
    <ModalShell
      title={existing ? "編輯適配" : "建立適配"}
      onClose={onClose}
      testId="matrix-cell-modal"
    >
      <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded px-3 py-2 text-[12px]">
          <div>
            <span className="text-[#9A9890]">備件：</span>
            <span className="font-mono text-[#185FA5]">{item.code}</span>{" "}
            <span className="text-[#2C2C2A]">{item.name}</span>
          </div>
          <div>
            <span className="text-[#9A9890]">車型：</span>
            <span className="text-[#2C2C2A] font-semibold">
              {model.display_name || model.model_name}
            </span>{" "}
            <span className="text-[#9A9890]">（{model.series}）</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="起始年份">
            <input
              type="number"
              min={1900}
              max={2100}
              value={yearStart}
              onChange={(e) => setYearStart(e.target.value)}
              placeholder="例：2020（留空=不限）"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] font-mono"
              data-testid="matrix-cell-year-start"
            />
          </Field>
          <Field label="結束年份">
            <input
              type="number"
              min={1900}
              max={2100}
              value={yearEnd}
              onChange={(e) => setYearEnd(e.target.value)}
              placeholder="例：2025（留空=不限）"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] font-mono"
              data-testid="matrix-cell-year-end"
            />
          </Field>
        </div>
        <Field label="說明（選填）">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="例：僅限歐規 / 第 2 代起適用"
            className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
            data-testid="matrix-cell-notes"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
            data-testid="matrix-cell-verified"
          />
          標記為已驗證
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {existing ? (
          <button
            type="button"
            disabled={!canEdit || isPending}
            onClick={() =>
              onSave(
                { year_start: null, year_end: null, notes: null, is_verified: false },
                "delete",
              )
            }
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] mr-auto disabled:opacity-50"
            data-testid="matrix-cell-delete"
          >
            移除適配
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!canEdit || isPending}
          onClick={submit}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          data-testid="matrix-cell-save"
        >
          {isPending ? "儲存中⋯" : existing ? "儲存變更" : "建立適配"}
        </button>
      </div>
    </ModalShell>
  );
}

// ───────────────────────────────────────────────────────── Bulk apply modal

function BulkApplyModal({
  matrix,
  preset,
  isPending,
  onClose,
  onApply,
}: {
  matrix: CompatMatrix;
  preset?: { itemId?: string; modelId?: string };
  isPending: boolean;
  onClose: () => void;
  onApply: (input: BulkApplyInput) => void;
}) {
  // selected: row=item id, col=model id (true=選中)
  const initial = useMemo<Record<string, Record<string, boolean>>>(() => {
    const out: Record<string, Record<string, boolean>> = {};
    for (const it of matrix.items) {
      out[it.id] = {};
      for (const m of matrix.models) {
        const allSelectedForItem = preset?.itemId === it.id;
        const allSelectedForModel = preset?.modelId === m.id;
        out[it.id][m.id] = !!(allSelectedForItem || allSelectedForModel);
      }
    }
    return out;
  }, [matrix.items, matrix.models, preset?.itemId, preset?.modelId]);
  const [selected, setSelected] = useState<Record<string, Record<string, boolean>>>(initial);
  const [yearStart, setYearStart] = useState<string>("");
  const [yearEnd, setYearEnd] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const toggleCell = (rowId: string, colId: string, value: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [colId]: value },
    }));
  };

  const toggleRow = (rowId: string) => {
    setSelected((prev) => {
      const row = prev[rowId] ?? {};
      const allOn = matrix.models.every((m) => row[m.id]);
      const next: Record<string, boolean> = {};
      for (const m of matrix.models) next[m.id] = !allOn;
      return { ...prev, [rowId]: next };
    });
  };
  const toggleCol = (colId: string) => {
    setSelected((prev) => {
      const allOn = matrix.items.every((i) => prev[i.id]?.[colId]);
      const next = { ...prev };
      for (const i of matrix.items) {
        next[i.id] = { ...next[i.id], [colId]: !allOn };
      }
      return next;
    });
  };

  const { itemIds, modelIds, count } = useMemo(() => {
    const sItems = new Set<string>();
    const sModels = new Set<string>();
    let c = 0;
    for (const it of matrix.items) {
      for (const m of matrix.models) {
        if (selected[it.id]?.[m.id]) {
          sItems.add(it.id);
          sModels.add(m.id);
          c++;
        }
      }
    }
    return {
      itemIds: Array.from(sItems),
      modelIds: Array.from(sModels),
      count: c,
    };
  }, [selected, matrix.items, matrix.models]);

  const submit = () => {
    onApply({
      item_ids: itemIds,
      vehicle_model_ids: modelIds,
      year_start: yearStart ? Number(yearStart) : null,
      year_end: yearEnd ? Number(yearEnd) : null,
      notes: notes.trim() || null,
    });
  };

  // 把 selected 變成 MatrixSelector 要的 shape — 直接重用即可
  const rows = matrix.items.map((i) => ({ id: i.id, label: `${i.code} ${i.name}` }));
  const cols = matrix.models.map((m) => ({
    id: m.id,
    label: m.display_name || m.model_name,
  }));

  return (
    <ModalShell title="批次套用適配" onClose={onClose} testId="matrix-bulk-modal" wide>
      <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="起始年份">
            <input
              type="number"
              min={1900}
              max={2100}
              value={yearStart}
              onChange={(e) => setYearStart(e.target.value)}
              placeholder="留空=不限"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white font-mono outline-none focus:border-[#185FA5]"
              data-testid="bulk-year-start"
            />
          </Field>
          <Field label="結束年份">
            <input
              type="number"
              min={1900}
              max={2100}
              value={yearEnd}
              onChange={(e) => setYearEnd(e.target.value)}
              placeholder="留空=不限"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white font-mono outline-none focus:border-[#185FA5]"
              data-testid="bulk-year-end"
            />
          </Field>
          <Field label="說明（選填）">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：原廠通用 / 第 2 代起適用"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
              data-testid="bulk-notes"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 text-[11.5px] text-[#5A5955]">
          <span>快速：</span>
          <select
            onChange={(e) => {
              const id = e.target.value;
              if (id) toggleRow(id);
              e.target.value = "";
            }}
            className="h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] bg-white"
            data-testid="bulk-quick-row"
          >
            <option value="">↔ 切換整列（選備件）</option>
            {matrix.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} {i.name}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              const id = e.target.value;
              if (id) toggleCol(id);
              e.target.value = "";
            }}
            className="h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] bg-white"
            data-testid="bulk-quick-col"
          >
            <option value="">↕ 切換整欄（選車型）</option>
            {matrix.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.model_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const empty: Record<string, Record<string, boolean>> = {};
              for (const it of matrix.items) empty[it.id] = {};
              setSelected(empty);
            }}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            清除選取
          </button>
          <span className="ml-auto text-[12px] text-[#185FA5] font-medium">
            已選 {count} 格（{itemIds.length} 備件 × {modelIds.length} 車型）
          </span>
        </div>

        <MatrixSelector
          rows={rows}
          cols={cols}
          selected={selected}
          onChange={toggleCell}
          tone="blue"
        />

        <p className="text-[11px] text-[#9A9890]">
          ⚠ 已存在的 (備件 × 車型) 適配將被
          <b className="text-[#185FA5]">覆蓋</b>為上方的年份範圍；不存在的會新增。
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || count === 0}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          data-testid="bulk-submit"
        >
          {isPending ? "套用中⋯" : `套用到 ${count} 格`}
        </button>
      </div>
    </ModalShell>
  );
}

// ───────────────────────────────────────────────────────── shared shells

function ModalShell({
  title,
  onClose,
  children,
  testId,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-xl"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
