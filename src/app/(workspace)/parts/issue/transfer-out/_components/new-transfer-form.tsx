"use client";

import { useMemo, useState, useTransition } from "react";

import { createAndShipTransfer } from "@/lib/parts/actions";
import type { Item, Warehouse } from "@/lib/parts/types";

type Line = {
  item_id: string;
  qty_requested: number;
};

export function NewTransferForm({
  warehouses,
  items,
}: {
  warehouses: Warehouse[];
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<string>(warehouses[0]?.id ?? "");
  const [targetId, setTargetId] = useState<string>(warehouses[1]?.id ?? "");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", qty_requested: 1 }]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; tr_no: string }
    | { ok: false; error: string }
    | null
  >(null);

  const canSubmit = useMemo(() => {
    if (!sourceId || !targetId || sourceId === targetId) return false;
    return lines.length > 0 && lines.every((l) => l.item_id && l.qty_requested > 0);
  }, [sourceId, targetId, lines]);

  function addLine() {
    setLines((p) => [...p, { item_id: "", qty_requested: 1 }]);
  }
  function removeLine(idx: number) {
    setLines((p) => p.filter((_, i) => i !== idx));
  }
  function updateLine(idx: number, key: keyof Line, val: string | number) {
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, [key]: val } : l)));
  }

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await createAndShipTransfer({
        source_warehouse_id: sourceId,
        target_warehouse_id: targetId,
        reason: reason || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_requested: Number(l.qty_requested),
        })),
      });
      if (res.ok) {
        setResult({ ok: true, tr_no: res.data.tr_no });
        setOpen(false);
        setLines([{ item_id: "", qty_requested: 1 }]);
        setReason("");
        setNotes("");
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-[#172B4D]">建立調撥單</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            新增調撥單
          </button>
        )}
      </header>

      {result?.ok && (
        <div className="rounded-md border border-[#79F2C0] bg-[#E3FCEF] px-4 py-2 text-[13px] text-[#006644]">
          ✓ 調撥單建立並出庫 ・ 單號 <span className="font-mono">{result.tr_no}</span>
        </div>
      )}
      {result?.ok === false && (
        <div className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-2 text-[13px] text-[#BF2600]">
          {result.error}
        </div>
      )}

      {open && (
        <section className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                來源倉庫 <span className="text-[#BF2600]">*</span>
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                <option value="">— 選擇 —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} ・ {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                目的倉庫 <span className="text-[#BF2600]">*</span>
              </label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                <option value="">— 選擇 —</option>
                {warehouses
                  .filter((w) => w.id !== sourceId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} ・ {w.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">調撥原因</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                placeholder="例：補貨 / 季節調節 / 客戶要貨"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">備註</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <header className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
                調撥明細（{lines.length}）
              </h3>
              <button
                type="button"
                onClick={addLine}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded border border-[#0052CC] text-[#0052CC] hover:bg-[#DEEBFF] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                新增料號
              </button>
            </header>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-9">
                  <select
                    value={l.item_id}
                    onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                    disabled={pending}
                    className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                  >
                    <option value="">— 選料號 —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.qty_requested}
                    onChange={(e) => updateLine(idx, "qty_requested", Number(e.target.value) || 0)}
                    disabled={pending}
                    className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] text-right focus:outline-none focus:border-[#0052CC]"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={pending || lines.length === 1}
                    className="p-1 text-[#6B778C] hover:text-[#BF2600] hover:bg-[#FFEBE6] rounded disabled:opacity-30"
                    aria-label="移除"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-[#6B778C]">
            建單即出庫：來源倉的庫存依 FIFO 扣帳並產生 in_transit 行掛在目的倉。任一料件不足整批 abort。
          </p>

          <div className="flex items-center gap-2 pt-2 border-t border-[#DFE1E6]">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !canSubmit}
              className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
            >
              {pending ? "出庫中…" : "建單並出庫"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E] hover:text-[#172B4D]"
            >
              取消
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
