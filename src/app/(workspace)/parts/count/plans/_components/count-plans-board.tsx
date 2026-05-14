"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { CountPlanListRow } from "@/domain/count";
import {
  createCountPlanAction,
  updateCountPlanAction,
  setCountPlanActiveAction,
  deleteCountPlanAction,
} from "@/domain/count";
import {
  COUNT_PLAN_TYPE_CHIP,
  COUNT_PLAN_TYPE_OPTIONS,
  ABC_FILTER_OPTIONS,
} from "@/domain/count.constants";

type WarehouseOption = { id: string; name: string; code: string };

type FormDraft = {
  plan_name: string;
  warehouse_id: string;
  plan_type: string;
  abc_filter: string;
  schedule_cron: string;
  next_run_at: string;
  notes: string;
};

const emptyDraft = (firstWh: string): FormDraft => ({
  plan_name: "",
  warehouse_id: firstWh,
  plan_type: "cycle",
  abc_filter: "",
  schedule_cron: "",
  next_run_at: "",
  notes: "",
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  // ISO date string like '2026-05-14' 或 timestamptz
  return d.slice(0, 10).replace(/-/g, "/");
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function CountPlansBoard({
  rows,
  warehouses,
  canEdit,
  initialIsActive,
  initialQ,
  initialWarehouseId,
}: {
  rows: CountPlanListRow[];
  warehouses: WarehouseOption[];
  canEdit: boolean;
  initialIsActive: string;
  initialQ: string;
  initialWarehouseId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isActive, setIsActive] = useState(initialIsActive);
  const [q, setQ] = useState(initialQ);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<FormDraft>(
    emptyDraft(warehouses[0]?.id ?? ""),
  );
  const [formPending, formStart] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      is_active: isActive || undefined,
      q: q || undefined,
      warehouse_id: warehouseId || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/count/plans${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({})));
  }

  function resetFilter() {
    setIsActive("");
    setQ("");
    setWarehouseId("");
    startTransition(() => router.push("/parts/count/plans"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  function openCreate() {
    setFormMode("create");
    setEditingId(null);
    setFormDraft(emptyDraft(warehouses[0]?.id ?? ""));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(r: CountPlanListRow) {
    setFormMode("edit");
    setEditingId(r.id);
    setFormDraft({
      plan_name: r.plan_name ?? "",
      warehouse_id: r.warehouse_id ?? warehouses[0]?.id ?? "",
      plan_type: r.plan_type ?? "cycle",
      abc_filter: r.abc_filter ?? "",
      schedule_cron: r.schedule_cron ?? "",
      next_run_at: r.next_run_at ? r.next_run_at.slice(0, 10) : "",
      notes: r.notes ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function submitForm() {
    setFormError(null);
    formStart(async () => {
      if (formMode === "create") {
        const res = await createCountPlanAction({
          plan_name: formDraft.plan_name,
          warehouse_id: formDraft.warehouse_id,
          plan_type: (formDraft.plan_type as
            | "cycle"
            | "full"
            | "spot"
            | "abc_a"
            | "abc_b"
            | "abc_c") ?? "cycle",
          abc_filter:
            (formDraft.abc_filter as "A" | "B" | "C" | "all") || undefined,
          notes: formDraft.notes || undefined,
        });
        if (res.ok) {
          // 追加 schedule_cron / next_run_at（createCountPlanAction 不支援，建立後 update 補）
          if (formDraft.schedule_cron || formDraft.next_run_at) {
            await updateCountPlanAction(res.data.plan_id, {
              schedule_cron: formDraft.schedule_cron || null,
              next_run_at: formDraft.next_run_at || null,
            });
          }
          setModalOpen(false);
          showBanner({ ok: true, msg: "✓ 已建立" });
          router.refresh();
        } else {
          setFormError(res.error);
        }
      } else if (editingId) {
        const res = await updateCountPlanAction(editingId, {
          plan_name: formDraft.plan_name,
          warehouse_id: formDraft.warehouse_id,
          plan_type: formDraft.plan_type,
          abc_filter: formDraft.abc_filter || null,
          schedule_cron: formDraft.schedule_cron || null,
          next_run_at: formDraft.next_run_at || null,
          notes: formDraft.notes || null,
        });
        if (res.ok) {
          setModalOpen(false);
          showBanner({ ok: true, msg: "✓ 已更新" });
          router.refresh();
        } else {
          setFormError(res.error);
        }
      }
    });
  }

  function toggleActive(r: CountPlanListRow) {
    startTransition(async () => {
      const res = await setCountPlanActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: CountPlanListRow) {
    if (!confirm(`確定刪除計畫「${r.plan_name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCountPlanAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns = useMemo<DataGridColumn<CountPlanListRow>[]>(() => {
    return [
      {
        id: "plan_name",
        header: "計畫名稱",
        width: 220,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/count/plans/${r.id}`}
            className="font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          >
            {r.plan_name ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.plan_name ?? "",
        sortValue: (r) => r.plan_name ?? "",
        editable: canEdit
          ? {
              type: "text",
              getValue: (r) => r.plan_name ?? "",
              onSave: async (r, value) => {
                const v = value.trim();
                if (!v) return { ok: false, error: "名稱不可為空" };
                const res = await updateCountPlanAction(r.id, { plan_name: v });
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已更新" });
                  router.refresh();
                  return { ok: true };
                }
                return { ok: false, error: res.error };
              },
            }
          : undefined,
      },
      {
        id: "warehouse_name",
        header: "倉庫",
        width: 140,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "plan_type",
        header: "類型",
        width: 110,
        cell: (r) => {
          const def =
            COUNT_PLAN_TYPE_CHIP[r.plan_type ?? ""] ?? {
              label: r.plan_type ?? "—",
              chip: "bg-[#F2F2F2] text-[#6B6A68]",
            };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          COUNT_PLAN_TYPE_CHIP[r.plan_type ?? ""]?.label ?? r.plan_type ?? "",
        sortValue: (r) => r.plan_type ?? "",
      },
      {
        id: "abc_filter",
        header: "ABC",
        width: 80,
        cell: (r) => r.abc_filter ?? "—",
        exportValue: (r) => r.abc_filter ?? "",
        sortValue: (r) => r.abc_filter ?? "",
      },
      {
        id: "schedule_cron",
        header: "排程 (cron)",
        width: 160,
        cell: (r) => (
          <span className="font-mono text-[11px] text-[#5A5955]">
            {r.schedule_cron ?? "—"}
          </span>
        ),
        exportValue: (r) => r.schedule_cron ?? "",
        sortValue: (r) => r.schedule_cron ?? "",
      },
      {
        id: "next_run_at",
        header: "下次執行",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.next_run_at)}</span>
        ),
        exportValue: (r) => r.next_run_at ?? "",
        sortValue: (r) => r.next_run_at ?? "",
      },
      {
        id: "last_run_at",
        header: "上次執行",
        width: 110,
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtDate(r.last_run_at)}</span>
        ),
        exportValue: (r) => r.last_run_at ?? "",
        sortValue: (r) => r.last_run_at ?? "",
      },
      {
        id: "is_active",
        header: "啟用",
        width: 70,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
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
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">盤點計畫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          8.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定週期性盤點計畫、自動排程下次執行
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>名稱關鍵字</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋計畫名稱..."
              className={`${inputClass} w-[200px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>啟用狀態</label>
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={!canEdit || isPending}
              title={canEdit ? "" : "沒有編輯權限"}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增計畫
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆盤點計畫
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/count/plans"
        exportFileName="count-plans"
        emptyMessage="尚無盤點計畫"
        disabled={isPending}
        rowActionsWidth={210}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => toggleActive(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              onClick={() => removeRow(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        )}
      />

      {modalOpen && (
        <Modal
          title={formMode === "create" ? "新增盤點計畫" : "編輯盤點計畫"}
          onClose={() => (formPending ? null : setModalOpen(false))}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="計畫名稱 *" full>
              <input
                value={formDraft.plan_name}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, plan_name: e.target.value })
                }
                disabled={formPending}
                placeholder="例：信義主倉月底盤點"
                className={inputClass}
              />
            </Field>
            <Field label="倉庫 *">
              <select
                value={formDraft.warehouse_id}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, warehouse_id: e.target.value })
                }
                disabled={formPending}
                className={inputClass}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} ・ {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="類型">
              <select
                value={formDraft.plan_type}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, plan_type: e.target.value })
                }
                disabled={formPending}
                className={inputClass}
              >
                {COUNT_PLAN_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ABC 範圍">
              <select
                value={formDraft.abc_filter}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, abc_filter: e.target.value })
                }
                disabled={formPending}
                className={inputClass}
              >
                {ABC_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="排程 cron (選填)">
              <input
                value={formDraft.schedule_cron}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, schedule_cron: e.target.value })
                }
                disabled={formPending}
                placeholder="例：0 9 1 * *（每月 1 號 9:00）"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="下次執行日">
              <input
                type="date"
                value={formDraft.next_run_at}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, next_run_at: e.target.value })
                }
                disabled={formPending}
                className={inputClass}
              />
            </Field>
            <Field label="備註" full>
              <textarea
                value={formDraft.notes}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, notes: e.target.value })
                }
                disabled={formPending}
                rows={3}
                className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            </Field>
          </div>

          {formError && (
            <div className="mt-3 rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
              {formError}
            </div>
          )}

          <div className="mt-4 flex gap-2 justify-end pt-3 border-t border-[#EEECE6]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={formPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={
                formPending ||
                !formDraft.plan_name.trim() ||
                !formDraft.warehouse_id
              }
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {formPending
                ? formMode === "create"
                  ? "建立中⋯"
                  : "儲存中⋯"
                : formMode === "create"
                  ? "建立計畫"
                  : "儲存變更"}
            </button>
          </div>
        </Modal>
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
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
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
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
