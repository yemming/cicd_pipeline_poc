"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createPurchaseOrder } from "@/domain/orders";

type Pick = { id: string; name: string; code: string };
type ItemPick = Pick & { base_uom: string | null };

type Line = {
  item_id: string;
  qty_ordered: number;
  unit_price: number;
};

// ⚠️ value 必須跟 DB CHECK constraint purchase_orders_purchase_type_check 完全對齊
// (standard | urgent | planned | oem_import)，否則送出會撞 23514。
// 標籤沿用 orders-board.tsx 的 TYPE_LABEL 措辭，讓列表/表單/明細頁顯示一致。
const PURCHASE_TYPE_LABEL: Record<string, string> = {
  planned:    "計畫採購",
  standard:   "標準採購",
  urgent:     "緊急採購",
  oem_import: "原廠匯入",
};

const inputClass =
  "h-[30px] w-full px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";

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
  const searchParams = useSearchParams();
  // WP-H：從 10B 告警 / 採購頁「緊急送單」帶 ?urgent=1 進來 → 預設緊急採購
  const isUrgent = searchParams.get("urgent") === "1";
  // 從告警儀表板「緊急補貨 / 建立採購單」帶 ?item=<item_id> 進來 → 第一行預填該料號
  const prefillItemId = searchParams.get("item");
  const initialItemId =
    (prefillItemId && items.some((it) => it.id === prefillItemId) ? prefillItemId : items[0]?.id) ?? "";
  const [vendorId, setVendorId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [purchaseType, setPurchaseType] = useState(isUrgent ? "urgent" : "planned");
  const [etaDate, setEtaDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { item_id: initialItemId, qty_ordered: 1, unit_price: 0 },
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
      setTimeout(() => router.push(`/parts/purchase/orders/${result.data.id}`), 600);
    });
  }

  const subtotal = lines.reduce(
    (s, l) => s + Number(l.qty_ordered) * Number(l.unit_price),
    0,
  );
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + tax;

  const vendorPick = suppliers.find((s) => s.id === vendorId);
  const warehousePick = warehouses.find((w) => w.id === warehouseId);
  const lineCount = lines.length;
  const totalQty = lines.reduce((s, l) => s + Number(l.qty_ordered), 0);

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {isUrgent && (
        <div className="rounded-lg px-4 py-2.5 text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000]">
          ⚡ <b>緊急送單</b>：已預設為「緊急採購」。請於 PDC 截單前送出（DUCATI 17:00 / 台灣代理 15:00），逾時將產生加急費用或延至隔日到貨。
        </div>
      )}
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/purchase/orders" className="hover:text-[#185FA5]">
            商品採購
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增採購單</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
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
            disabled={isPending || !vendorId || !warehouseId || lines.length === 0}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
          >
            {isPending ? "建立中⋯" : "建立採購單"}
          </button>
        </div>
      </div>

      {/* 2. Title Card（建立模式 placeholder） */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">商品採購單</div>
              <h1 className="text-[18px] font-semibold text-[#9A9890] leading-tight italic">
                （未命名 PO）
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  尚未建立
                </span>
                {vendorPick ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    {vendorPick.name}
                  </span>
                ) : null}
                {warehousePick ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    收貨 {warehousePick.name}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[280px] h-[120px] bg-[#F8F7F4] border-2 border-dashed border-[#D5D3CB] rounded-lg flex flex-col items-center justify-center gap-1 px-3">
            <div className="text-[11px] text-[#9A9890]">預估含稅金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              NT$ {total.toLocaleString("en-US")}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {lineCount} 筆 / {totalQty} 件
            </div>
          </div>
        </div>
      </header>

      {/* 3. ▼ 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              供應商 <span className="text-[#CC0000]">*</span>
            </label>
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
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              收貨倉庫 <span className="text-[#CC0000]">*</span>
            </label>
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
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">採購類型</label>
            <select
              value={purchaseType}
              onChange={(e) => setPurchaseType(e.target.value)}
              className={inputClass}
            >
              {Object.entries(PURCHASE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">預計到貨日</label>
            <input
              type="date"
              value={etaDate}
              onChange={(e) => setEtaDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* 4. ▼ 採購明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購明細</span>
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
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[50px]">行號</th>
                <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">品項</th>
                <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[70px]">單位</th>
                <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[110px]">數量</th>
                <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[130px]">單價</th>
                <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[130px]">未稅金額</th>
                <th className="text-center px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[50px]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const item = items.find((i) => i.id === line.item_id);
                const lineTotal = Number(line.qty_ordered) * Number(line.unit_price);
                return (
                  <tr key={idx} className="border-b border-[#EEECE6]">
                    <td className="px-2 py-2 font-mono text-[#9A9890]">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <select
                        value={line.item_id}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, item_id: e.target.value } : l,
                            ),
                          )
                        }
                        className={inputClass}
                      >
                        {items.length === 0 ? <option value="">尚無商品</option> : null}
                        {items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.code} · {it.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-[#5A5955]">{item?.base_uom ?? "—"}</td>
                    <td className="px-2 py-2">
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
                        className={inputClass + " text-right font-mono"}
                      />
                    </td>
                    <td className="px-2 py-2">
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
                        className={inputClass + " text-right font-mono"}
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[#2C2C2A]">
                      {lineTotal.toLocaleString("en-US")}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length === 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-[26px] w-[26px] text-[#CC0000] hover:bg-[#FDECEA] disabled:text-[#D5D3CB] disabled:hover:bg-transparent text-[16px] rounded"
                        title="移除"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. ▼ 金額 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 金額</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="未稅" value={<span className="font-mono">NT$ {subtotal.toLocaleString("en-US")}</span>} />
          <Kv label="稅 (5%)" value={<span className="font-mono">NT$ {tax.toLocaleString("en-US")}</span>} />
          <Kv
            label="含稅"
            value={<span className="font-mono font-semibold text-[#0F6E56]">NT$ {total.toLocaleString("en-US")}</span>}
          />
        </div>
      </section>

      {/* 6. ▼ 備註 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 備註</span>
        </header>
        <div className="px-4 py-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="（選填）例如：附 PI、客戶指定品⋯"
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

function Kv({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[11px] text-[#9A9890] font-medium">{label}</div>
      <div className="text-[12.5px] text-[#2C2C2A] truncate">{value}</div>
    </div>
  );
}
