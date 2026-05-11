"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCompatAction,
  updateCompatAction,
  toggleVerifiedAction,
  deleteCompatAction,
  type CompatInput,
} from "@/lib/parts-setup/compatibility-actions";
import {
  type CompatWithModel,
  type SeriesOption,
  type ItemOption,
  type ModelOption,
} from "@/domain/compatibility";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import { CompatibilityLookup } from "./compatibility-lookup";

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

function formatYearRange(s: number | null, e: number | null): string {
  if (s == null && e == null) return "—";
  if (s != null && e != null) return `${s}–${e}`;
  return s != null ? `${s}–` : `—${e}`;
}

const blankInput = (): CompatInput => ({
  item_id: "",
  vehicle_model_id: "",
  year_start: null,
  year_end: null,
  notes: "",
  is_verified: false,
});

const fromRow = (r: CompatWithModel): CompatInput => ({
  item_id: r.item_id,
  vehicle_model_id: r.vehicle_model_id,
  year_start: r.year_start,
  year_end: r.year_end,
  notes: r.notes ?? "",
  is_verified: r.is_verified,
});

export function CompatibilityBoard({
  seriesList,
  activeSeries,
  rows,
  canEdit,
  items,
  models,
}: {
  seriesList: SeriesOption[];
  activeSeries: string | null;
  rows: CompatWithModel[];
  canEdit: boolean;
  items: ItemOption[];
  models: ModelOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [formDraft, setFormDraft] = useState<CompatInput>(blankInput());
  const [formSeries, setFormSeries] = useState<string>("");
  const [itemQuery, setItemQuery] = useState<string>("");

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const allSeries = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) if (m.series) set.add(m.series);
    return Array.from(set).sort();
  }, [models]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((i) =>
        i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [items, itemQuery]);

  const modelsForFormSeries = useMemo(
    () => (formSeries ? models.filter((m) => m.series === formSeries) : []),
    [models, formSeries],
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const openCreate = () => {
    setFormDraft(blankInput());
    setFormSeries(activeSeries ?? "");
    setItemQuery("");
    setFormMode({ kind: "create" });
  };
  const openEdit = (r: CompatWithModel) => {
    setFormDraft(fromRow(r));
    setFormSeries(r.series);
    setItemQuery("");
    setFormMode({ kind: "edit", id: r.id });
  };
  const closeForm = () => setFormMode({ kind: "closed" });

  const submitForm = () => {
    startTransition(async () => {
      const res =
        formMode.kind === "edit"
          ? await updateCompatAction(formMode.id, formDraft)
          : formMode.kind === "create"
            ? await createCompatAction(formDraft)
            : null;
      if (!res) return;
      if (res.ok) {
        showBanner({
          ok: true,
          msg: formMode.kind === "edit" ? "✓ 已儲存變更" : "✓ 已新增適配",
        });
        closeForm();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleVerified = (r: CompatWithModel) => {
    startTransition(async () => {
      const res = await toggleVerifiedAction(r.id, !r.is_verified);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_verified ? "✓ 已改為待確認" : "✓ 已標記為已驗證" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const deleteRow = (r: CompatWithModel) => {
    const it = itemMap.get(r.item_id);
    const label = it ? `${it.code} ${it.name}` : `備件 ${r.item_id.slice(0, 8)}`;
    if (
      !confirm(
        `確定要刪除這筆適配？\n備件：${label}\n車型：${r.display_name || r.model_name}（${formatYearRange(r.year_start, r.year_end)}）\n\n此動作為永久刪除、無法復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCompatAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除適配" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";

  const columns: DataGridColumn<CompatWithModel>[] = [
    {
      id: "item",
      header: "備件",
      width: 220,
      cell: (r) => {
        const it = itemMap.get(r.item_id);
        return (
          <div>
            <div className="font-mono text-[12px] text-[#185FA5]">{it?.code ?? "—"}</div>
            <div className="text-[11.5px] text-[#2C2C2A]">{it?.name ?? "（未知備件）"}</div>
          </div>
        );
      },
      exportValue: (r) => itemMap.get(r.item_id)?.code ?? "",
      sortValue: (r) => itemMap.get(r.item_id)?.code ?? "",
    },
    {
      id: "series",
      header: "車系",
      width: 120,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
          {r.series}
        </span>
      ),
      exportValue: (r) => r.series,
      sortValue: (r) => r.series,
    },
    {
      id: "model_name",
      header: "車型",
      width: 140,
      cell: (r) => <span className="text-[12.5px] font-semibold">{r.model_name}</span>,
      exportValue: (r) => r.model_name,
      sortValue: (r) => r.model_name,
    },
    {
      id: "year_range",
      header: "適用年份",
      width: 120,
      cell: (r) => (
        <span className="font-mono text-[12px]">{formatYearRange(r.year_start, r.year_end)}</span>
      ),
      exportValue: (r) => formatYearRange(r.year_start, r.year_end),
      sortValue: (r) => r.year_start ?? r.year_end ?? 0,
    },
    {
      id: "notes",
      header: "說明",
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>,
      exportValue: (r) => r.notes ?? "",
      sortValue: (r) => r.notes ?? "",
      editable: canEdit
        ? {
            type: "text",
            getValue: (r) => r.notes ?? "",
            onSave: async (r, value) => {
              const v = value.trim();
              const res = await updateCompatAction(r.id, { notes: v || null });
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新說明" });
                router.refresh();
                return { ok: true };
              }
              return { ok: false, error: res.error };
            },
          }
        : undefined,
    },
    {
      id: "is_verified",
      header: "驗證狀態",
      width: 100,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.is_verified ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDF3E3] text-[#854F0B]"}`}
        >
          {r.is_verified ? "已驗證" : "待確認"}
        </span>
      ),
      exportValue: (r) => (r.is_verified ? "已驗證" : "待確認"),
      sortValue: (r) => (r.is_verified ? 1 : 0),
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">適配設定（料-車/年份）</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定備件適用的車型與年份・是 Ducati 庫存系統的核心差異功能
        </span>
      </header>

      <div className="bg-[#E8F5F0] border border-[#9CCEBC] rounded-md px-4 py-2.5 text-[12px] text-[#0F6E56] flex items-center gap-2.5">
        🏍{" "}
        <span>
          適配設定讓 SA 在開立工單時，可以<b>依車型 + 年份快速篩選</b>正確備件，避免領錯料。此功能是 Ducati 庫存管理的核心差異化設計。
        </span>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                {activeSeries ? `${activeSeries} 車系適配清單` : "請選擇車系"}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-[#9A9890]">共 {rows.length} 筆</span>
                <button
                  type="button"
                  disabled={!canEdit || isPending}
                  onClick={openCreate}
                  className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="compat-add"
                >
                  ＋ 新增適配
                </button>
              </div>
            </header>
            <div className="px-3 py-3">
              <DataGrid
                columns={columns}
                data={rows}
                rowKey={(r) => r.id}
                persistKey="parts/setup/compatibility"
                exportFileName={`compatibility-${new Date().toISOString().slice(0, 10)}`}
                disabled={isPending}
                emptyMessage="此車系尚無適配資料"
                rowActionsWidth={210}
                rowActions={
                  canEdit
                    ? (r) => (
                        <>
                          <button
                            type="button"
                            disabled={!canEdit || isPending}
                            onClick={() => openEdit(r)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                            data-testid="compat-edit"
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit || isPending}
                            onClick={() => toggleVerified(r)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                            data-testid="compat-toggle"
                          >
                            {r.is_verified ? "改待確認" : "標已驗證"}
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit || isPending}
                            onClick={() => deleteRow(r)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                            data-testid="compat-delete"
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

          <CompatibilityLookup models={models} />
        </div>

        <aside className="w-[200px] flex-shrink-0 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] text-[12px] font-semibold text-[#5A5955]">
            車系
          </div>
          {seriesList.length === 0 ? (
            <div className="px-3 py-6 text-[11px] text-[#9A9890] text-center">尚無車系</div>
          ) : (
            seriesList.map((s) => {
              const isActive = activeSeries === s.series;
              return (
                <Link
                  key={s.series}
                  href={`/parts/setup/compatibility?series=${encodeURIComponent(s.series)}`}
                  className={`block px-3 py-2 border-b border-[#EEECE6] last:border-b-0 hover:bg-[#F8F7F4] text-[12px] ${isActive ? "bg-[#EAF4FB] text-[#185FA5] font-medium" : "text-[#2C2C2A]"}`}
                >
                  🏍 {s.series}
                  <span className="ml-1 text-[10px] text-[#9A9890]">({s.count})</span>
                </Link>
              );
            })
          )}
        </aside>
      </div>
      {!canEdit && (
        <div className="text-[11px] text-[#9A9890]">💡 你目前沒有編輯權限，僅顯示</div>
      )}

      {formMode.kind !== "closed" ? (
        <Modal
          title={formMode.kind === "edit" ? "編輯適配" : "新增適配"}
          onClose={closeForm}
        >
          <div className={`space-y-3 ${lockedClass}`}>
            <Field label="備件 *">
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="輸入料號或品名搜尋..."
                className={inputClass}
                data-testid="form-item-query"
              />
              <select
                value={formDraft.item_id}
                onChange={(e) => setFormDraft({ ...formDraft, item_id: e.target.value })}
                className={`${inputClass} mt-1 w-full`}
                size={6}
                data-testid="form-item-select"
              >
                {filteredItems.length === 0 ? (
                  <option value="" disabled>
                    （無符合條件的備件）
                  </option>
                ) : null}
                {filteredItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} — {i.name}
                  </option>
                ))}
              </select>
              {formDraft.item_id ? (
                <div className="text-[11.5px] text-[#5A5955] mt-1">
                  已選：
                  <span className="font-mono text-[#185FA5]">
                    {itemMap.get(formDraft.item_id)?.code ?? "—"}
                  </span>{" "}
                  {itemMap.get(formDraft.item_id)?.name ?? ""}
                </div>
              ) : null}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="車系 *">
                <select
                  value={formSeries}
                  onChange={(e) => {
                    setFormSeries(e.target.value);
                    setFormDraft({ ...formDraft, vehicle_model_id: "" });
                  }}
                  className={inputClass}
                  data-testid="form-series-select"
                >
                  <option value="">— 請選擇 —</option>
                  {allSeries.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="車型 *">
                <select
                  value={formDraft.vehicle_model_id}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, vehicle_model_id: e.target.value })
                  }
                  className={inputClass}
                  disabled={!formSeries}
                  data-testid="form-model-select"
                >
                  <option value="">{formSeries ? "— 請選擇 —" : "先選車系"}</option>
                  {modelsForFormSeries.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name || m.model_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="起始年份">
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={formDraft.year_start ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      year_start: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="例：2020"
                  className={`${inputClass} font-mono`}
                  data-testid="form-year-start"
                />
              </Field>
              <Field label="結束年份">
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  value={formDraft.year_end ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      year_end: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="例：2025"
                  className={`${inputClass} font-mono`}
                  data-testid="form-year-end"
                />
              </Field>
            </div>
            <Field label="說明">
              <input
                type="text"
                value={formDraft.notes ?? ""}
                onChange={(e) => setFormDraft({ ...formDraft, notes: e.target.value })}
                placeholder="例：僅限歐規 / 全 SuperSport 通用..."
                className={inputClass}
                data-testid="form-notes"
              />
            </Field>
            <Field label="驗證狀態">
              <label className="inline-flex items-center gap-1.5 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={formDraft.is_verified ?? false}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, is_verified: e.target.checked })
                  }
                />
                標記為已驗證
              </label>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white disabled:opacity-60"
              data-testid="form-submit"
            >
              {isPending
                ? formMode.kind === "edit"
                  ? "儲存中⋯"
                  : "建立中⋯"
                : formMode.kind === "edit"
                  ? "儲存變更"
                  : "建立"}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="compat-modal"
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
