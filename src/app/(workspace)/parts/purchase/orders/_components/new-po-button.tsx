"use client";

import { useState, useTransition } from "react";
import { createPurchaseOrder } from "@/lib/parts/actions";

type Pick = { id: string; name: string; code: string };
type ItemPick = Pick & { base_uom: string };

type Line = {
  item_id: string;
  qty_ordered: number;
  unit_price: number;
};

export function NewPOButton({
  suppliers,
  warehouses,
  items,
}: {
  suppliers: Pick[];
  warehouses: Pick[];
  items: ItemPick[];
}) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [purchaseType, setPurchaseType] = useState("planned");
  const [etaDate, setEtaDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { item_id: items[0]?.id ?? "", qty_ordered: 1, unit_price: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setVendorId(suppliers[0]?.id ?? "");
    setWarehouseId(warehouses[0]?.id ?? "");
    setPurchaseType("planned");
    setEtaDate("");
    setNotes("");
    setLines([{ item_id: items[0]?.id ?? "", qty_ordered: 1, unit_price: 0 }]);
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createPurchaseOrder({
        vendor_id: vendorId,
        warehouse_id: warehouseId,
        purchase_type: purchaseType,
        eta_date: etaDate || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_ordered: Number(l.qty_ordered),
          unit_price: Number(l.unit_price),
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
    });
  };

  const subtotal = lines.reduce(
    (s, l) => s + Number(l.qty_ordered) * Number(l.unit_price),
    0,
  );
  const tax = Math.round(subtotal * 0.05 * 100) / 100;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#185FA5] hover:bg-[#1A3A5C] text-white text-[12px] font-medium rounded-md transition-colors"
      >
        <span className="text-[14px] leading-none">＋</span>
        <span>新增採購單</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setOpen(false);
          }}
        >
          <div
            className={`bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col ${
              isPending ? "pointer-events-none opacity-90" : ""
            }`}
          >
            <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#1A1917]">新增採購單</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="text-[#6B6A68] hover:text-[#1A1917] text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1">
              <fieldset disabled={isPending} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="供應商">
                    <select
                      value={vendorId}
                      onChange={(e) => setVendorId(e.target.value)}
                      className="w-full h-8 px-2 border border-[#D8D6CF] rounded text-[12px]"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}({s.code})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="收貨倉庫">
                    <select
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      className="w-full h-8 px-2 border border-[#D8D6CF] rounded text-[12px]"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}({w.code})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="採購類型">
                    <select
                      value={purchaseType}
                      onChange={(e) => setPurchaseType(e.target.value)}
                      className="w-full h-8 px-2 border border-[#D8D6CF] rounded text-[12px]"
                    >
                      <option value="planned">計畫採購</option>
                      <option value="ad_hoc">臨時採購</option>
                    </select>
                  </Field>
                  <Field label="預計到貨日">
                    <input
                      type="date"
                      value={etaDate}
                      onChange={(e) => setEtaDate(e.target.value)}
                      className="w-full h-8 px-2 border border-[#D8D6CF] rounded text-[12px]"
                    />
                  </Field>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-[#4A4945]">採購明細</label>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          { item_id: items[0]?.id ?? "", qty_ordered: 1, unit_price: 0 },
                        ])
                      }
                      className="text-[11px] text-[#185FA5] hover:underline"
                    >
                      + 加一行
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {lines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <select
                          value={line.item_id}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) => (i === idx ? { ...l, item_id: e.target.value } : l)),
                            )
                          }
                          className="col-span-6 h-7 px-2 border border-[#D8D6CF] rounded text-[12px]"
                        >
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code} - {item.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={line.qty_ordered}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, qty_ordered: Number(e.target.value) || 0 } : l,
                              ),
                            )
                          }
                          placeholder="數量"
                          className="col-span-2 h-7 px-2 border border-[#D8D6CF] rounded text-[12px] text-right"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unit_price}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l, i) =>
                                i === idx ? { ...l, unit_price: Number(e.target.value) || 0 } : l,
                              ),
                            )
                          }
                          placeholder="單價"
                          className="col-span-3 h-7 px-2 border border-[#D8D6CF] rounded text-[12px] text-right"
                        />
                        <button
                          type="button"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="col-span-1 text-[#CC0000] hover:text-[#7d0000] disabled:text-[#D8D6CF] text-[14px]"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#F5F5F4] grid grid-cols-3 gap-2 text-[12px]">
                    <div className="text-[#6B6A68]">
                      未稅:NT$ {subtotal.toLocaleString()}
                    </div>
                    <div className="text-[#6B6A68]">稅(5%):NT$ {tax.toLocaleString()}</div>
                    <div className="text-right font-semibold text-[#0F6E56]">
                      含稅:NT$ {(subtotal + tax).toLocaleString()}
                    </div>
                  </div>
                </div>

                <Field label="備註(選填)">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 border border-[#D8D6CF] rounded text-[12px]"
                  />
                </Field>

                {error && (
                  <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#FDB8B5] rounded px-2.5 py-1.5">
                    {error}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="px-5 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2 bg-[#FAFAF9]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="h-8 px-3 text-[12px] text-[#6B6A68] hover:text-[#1A1917] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="h-8 px-4 bg-[#185FA5] hover:bg-[#1A3A5C] text-white text-[12px] font-medium rounded disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {isPending && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {isPending ? "建立中⋯" : "建立採購單"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#4A4945] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
