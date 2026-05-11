"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addStockItemForItem,
  updateStockItem,
  deleteStockItem,
  type StockItemInput,
} from "@/domain/stock";

import type { StockLot, WarehouseRef } from "./item-detail-view";

const STATUS_OPTIONS: { code: string; label: string }[] = [
  { code: "available", label: "可用" },
  { code: "reserved", label: "已預留" },
  { code: "in_transit", label: "運送中" },
  { code: "issued", label: "已出庫" },
  { code: "damaged", label: "損壞" },
  { code: "scrapped", label: "報廢" },
];

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.code, s.label]));

type FormState = StockItemInput & { id?: string };

function emptyForm(warehouses: WarehouseRef[]): FormState {
  return {
    warehouse_id: warehouses[0]?.id ?? "",
    serial_no: null,
    batch_no: null,
    qty: 1,
    status: "available",
    unit_cost: 0,
    warranty_start: null,
    warranty_end: null,
    notes: null,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("zh-TW");
  } catch {
    return iso;
  }
}

export function StockLotsSection({
  itemId,
  itemName,
  serialRequired,
  batchRequired,
  lots,
  warehouses,
  canEdit,
}: {
  itemId: string;
  itemName: string;
  serialRequired: boolean;
  batchRequired: boolean;
  lots: StockLot[];
  warehouses: WarehouseRef[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(warehouses));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function flash(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function openCreate() {
    setForm(emptyForm(warehouses));
    setModalOpen(true);
  }

  function openEdit(lot: StockLot) {
    setForm({
      id: lot.id,
      warehouse_id: lot.warehouse_id,
      serial_no: lot.serial_no,
      batch_no: lot.batch_no,
      qty: Number(lot.qty),
      status: lot.status,
      unit_cost: Number(lot.unit_cost ?? 0),
      warranty_start: lot.warranty_start,
      warranty_end: lot.warranty_end,
      notes: lot.notes,
    });
    setModalOpen(true);
  }

  function handleSubmit() {
    const { id, ...input } = form;
    startTransition(async () => {
      const res = id
        ? await updateStockItem(id, itemId, input)
        : await addStockItemForItem(itemId, input);
      if (res.ok) {
        flash(true, id ? "✓ 已更新序批號" : "✓ 已新增序批號");
        setModalOpen(false);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteStockItem(id, itemId);
      if (res.ok) {
        flash(true, "✓ 已刪除序批號");
        setConfirmDeleteId(null);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  const whMap = new Map(warehouses.map((w) => [w.id, w]));
  const trackingOn = serialRequired || batchRequired;
  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] text-[#9A9890]">
          {trackingOn ? (
            <>
              追蹤模式：
              {serialRequired ? (
                <span className="font-medium text-[#185FA5]">序號</span>
              ) : null}
              {serialRequired && batchRequired ? " + " : ""}
              {batchRequired ? (
                <span className="font-medium text-[#185FA5]">批號</span>
              ) : null}
            </>
          ) : (
            <>未開啟序列號 / 批號追蹤</>
          )}
        </div>
        {canEdit && trackingOn ? (
          <button
            type="button"
            onClick={openCreate}
            disabled={isPending || warehouses.length === 0}
            title={warehouses.length === 0 ? "請先建立倉庫" : "新增序批號"}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增序批號
          </button>
        ) : null}
      </div>

      {!trackingOn ? null : lots.length === 0 ? (
        <div className="text-[12px] text-[#9A9890] py-2">尚無序批號紀錄</div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] text-[#9A9890]">
              <th className="text-left font-medium py-1">序列號 / 批號</th>
              <th className="text-left font-medium py-1">倉庫</th>
              <th className="text-right font-medium py-1">數量</th>
              <th className="text-left font-medium py-1">狀態</th>
              <th className="text-left font-medium py-1">保固迄</th>
              {canEdit ? <th className="text-right font-medium py-1 w-[120px]">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {lots.map((s) => {
              const wh = whMap.get(s.warehouse_id);
              return (
                <tr key={s.id} className="border-t border-[#F8F7F4]">
                  <td className="py-1.5">
                    {s.serial_no ? (
                      <span className="font-mono text-[11px]">{s.serial_no}</span>
                    ) : s.batch_no ? (
                      <span className="font-mono text-[11px]">
                        <span className="text-[#9A9890]">批</span> {s.batch_no}
                      </span>
                    ) : (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-[11.5px]">
                    {wh ? `${wh.code} · ${wh.name}` : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {Number(s.qty).toLocaleString("en-US")}
                  </td>
                  <td className="py-1.5 text-[11.5px]">
                    {STATUS_LABEL[s.status] ?? s.status}
                  </td>
                  <td className="py-1.5 text-[11px]">{fmtDate(s.warranty_end)}</td>
                  {canEdit ? (
                    <td className="py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="h-[24px] px-2 rounded text-[11px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[520px] max-h-[90vh] overflow-auto">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                {form.id ? "編輯" : "新增"}序批號 · {itemName}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[#9A9890] hover:text-[#5A5955] text-[18px] leading-none"
              >
                ×
              </button>
            </header>
            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>倉庫 *</label>
                <select
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                  className={inputClass}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>序列號 {serialRequired ? "*" : ""}</label>
                <input
                  type="text"
                  value={form.serial_no ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, serial_no: e.target.value.trim() || null })
                  }
                  placeholder={serialRequired ? "必填" : "選填"}
                  className={inputClass + " font-mono"}
                />
              </div>
              <div>
                <label className={labelClass}>批號 {batchRequired ? "*" : ""}</label>
                <input
                  type="text"
                  value={form.batch_no ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, batch_no: e.target.value.trim() || null })
                  }
                  placeholder={batchRequired ? "必填" : "選填"}
                  className={inputClass + " font-mono"}
                />
              </div>
              <div>
                <label className={labelClass}>數量 *</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  className={inputClass + " font-mono"}
                />
              </div>
              <div>
                <label className={labelClass}>狀態</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>單位成本</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.unit_cost ?? 0}
                  onChange={(e) =>
                    setForm({ ...form, unit_cost: Number(e.target.value) })
                  }
                  className={inputClass + " font-mono"}
                />
              </div>
              <div>
                <label className={labelClass}>保固起</label>
                <input
                  type="date"
                  value={form.warranty_start ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, warranty_start: e.target.value || null })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>保固迄</label>
                <input
                  type="date"
                  value={form.warranty_end ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, warranty_end: e.target.value || null })
                  }
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>備註</label>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                  rows={2}
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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
                {isPending ? (form.id ? "更新中⋯" : "建立中⋯") : form.id ? "儲存變更" : "建立"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#CC0000]">確認刪除序批號</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              此操作無法復原。確定要刪除嗎？
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
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                {isPending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
