"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createPurchaseOrder } from "@/domain/orders";

type Pick = { id: string; name: string; code: string };
type ItemPick = Pick & { base_uom?: string };

type Line = {
  item_id: string;
  qty_ordered: number;
  unit_price: number;
};

export function NewPOForm({
  suppliers,
  warehouses,
  items,
}: {
  suppliers: Pick[];
  warehouses: Pick[];
  items: ItemPick[];
}) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [purchaseType, setPurchaseType] = useState("planned");
  const [etaDate, setEtaDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { item_id: items[0]?.id ?? "", qty_ordered: 1, unit_price: 0 },
  ]);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setBanner(null);
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
        setBanner({ ok: false, msg: result.error });
        return;
      }
      setBanner({ ok: true, msg: `✓ 已建立 ${result.data.po_no}` });
      setTimeout(() => router.push("/parts/purchase/orders"), 600);
    });
  }

  const subtotal = lines.reduce(
    (s, l) => s + Number(l.qty_ordered) * Number(l.unit_price),
    0,
  );
  const tax = Math.round(subtotal * 0.05 * 100) / 100;

  const inputClass =
    "h-[30px] w-full px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";
  const labelClass = "block text-[11px] text-[#9A9890] font-medium mb-1";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + 模式 badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/purchase/orders" className="hover:text-[#185FA5]">
            商品採購
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增採購單</span>
          <span className="ml-1 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/purchase/orders"
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center shadow-sm"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
          >
            {isPending ? "建立中⋯" : "建立採購單"}
          </button>
        </div>
      </div>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</h2>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <label className={labelClass}>供應商 *</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className={inputClass}
            >
              {suppliers.length === 0 ? <option value="">尚無供應商</option> : null}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.code}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>收貨倉庫 *</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={inputClass}
            >
              {warehouses.length === 0 ? <option value="">尚無倉庫</option> : null}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}（{w.code}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>採購類型</label>
            <select
              value={purchaseType}
              onChange={(e) => setPurchaseType(e.target.value)}
              className={inputClass}
            >
              <option value="planned">計畫採購</option>
              <option value="ad_hoc">臨時採購</option>
              <option value="urgent">緊急採購</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>預計到貨日</label>
            <input
              type="date"
              value={etaDate}
              onChange={(e) => setEtaDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* 採購明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購明細</h2>
          <button
            type="button"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                { item_id: items[0]?.id ?? "", qty_ordered: 1, unit_price: 0 },
              ])
            }
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            ＋ 加一行
          </button>
        </header>
        <div className="px-4 py-3">
          <div className="grid grid-cols-12 gap-2 items-center text-[11px] text-[#9A9890] font-medium mb-1.5">
            <div className="col-span-6">商品</div>
            <div className="col-span-2 text-right">數量</div>
            <div className="col-span-3 text-right">單價</div>
            <div className="col-span-1"></div>
          </div>
          <div className="space-y-1.5">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.item_id}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, item_id: e.target.value } : l,
                      ),
                    )
                  }
                  className={inputClass + " col-span-6"}
                >
                  {items.length === 0 ? <option value="">尚無商品</option> : null}
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
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
                  className={inputClass + " col-span-2 text-right font-mono"}
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
                  className={inputClass + " col-span-3 text-right font-mono"}
                />
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 h-[30px] text-[#CC0000] hover:text-[#7d0000] disabled:text-[#D5D3CB] text-[16px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-[#EEECE6] grid grid-cols-3 gap-2 text-[12px]">
            <div className="text-[#9A9890]">
              未稅 NT$ <span className="font-mono text-[#2C2C2A]">{subtotal.toLocaleString("en-US")}</span>
            </div>
            <div className="text-[#9A9890]">
              稅 (5%) NT$ <span className="font-mono text-[#2C2C2A]">{tax.toLocaleString("en-US")}</span>
            </div>
            <div className="text-right text-[#0F6E56] font-semibold">
              含稅 NT$ {(subtotal + tax).toLocaleString("en-US")}
            </div>
          </div>
        </div>
      </section>

      {/* 備註 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 備註</h2>
        </header>
        <div className="px-4 py-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="（選填）"
            className="w-full px-2 py-1.5 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
          />
        </div>
      </section>

      {/* Banner */}
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
