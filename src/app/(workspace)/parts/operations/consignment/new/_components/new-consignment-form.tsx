"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { registerConsignmentAction } from "@/domain/consignment";
import type { ConsignmentLookup } from "@/domain/consignment";

type Banner = { ok: boolean; msg: string } | null;

export function NewConsignmentForm({ lookup }: { lookup: ConsignmentLookup }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [supplierId, setSupplierId] = useState(lookup.suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(
    lookup.warehouses.find((w) => w.code.includes("CONSIGN"))?.id ??
      lookup.warehouses[0]?.id ??
      "",
  );
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(() =>
    new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submit = () => {
    const qtyN = Number(qty);
    const unitN = Number(unitCost);
    if (!supplierId) return flash({ ok: false, msg: "請選供應商" });
    if (!warehouseId) return flash({ ok: false, msg: "請選寄存倉" });
    if (!itemId) return flash({ ok: false, msg: "請選備件" });
    if (!Number.isFinite(qtyN) || qtyN <= 0)
      return flash({ ok: false, msg: "數量需 > 0" });
    if (!Number.isFinite(unitN) || unitN <= 0)
      return flash({ ok: false, msg: "單價需 > 0（用於轉購時自動過帳）" });
    if (!startDate || !endDate)
      return flash({ ok: false, msg: "起迄日必填" });
    if (endDate < startDate)
      return flash({ ok: false, msg: "到期日不可早於起始日" });

    startTransition(async () => {
      const res = await registerConsignmentAction({
        supplier_id: supplierId,
        item_id: itemId,
        warehouse_id: warehouseId,
        initial_qty: qtyN,
        unit_cost: unitN,
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已登錄 ${res.data.con_no}` });
        router.push(`/parts/operations/consignment/${res.data.con_id}`);
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <main
      className={`px-6 py-5 space-y-3 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {/* Breadcrumb + pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/operations/consignment"
            className="hover:text-[#185FA5]"
          >
            寄存管理
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新登錄寄存品項</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/consignment"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 shadow-sm"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <h1 className="text-[18px] font-semibold text-[#2C2C2A]">
          登錄寄存品項
        </h1>
        <p className="text-[12px] text-[#9A9890] mt-1">
          登錄後進入寄存倉、不計入可用庫存；到期或確認後可轉為正式庫存。
        </p>
      </header>

      {/* 寄存來源 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 寄存來源
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="供應商" required>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            >
              <option value="">— 選供應商 —</option>
              {lookup.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="寄存倉庫" required>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            >
              {lookup.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="寄存開始日" required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            />
          </Field>
          <Field label="寄存到期日" required>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            />
          </Field>
        </div>
      </section>

      {/* 品項 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 品項
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="備件" required full>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            >
              <option value="">— 選備件 —</option>
              {lookup.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code ?? "(no code)"} · {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="數量" required>
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full text-right font-mono"
            />
          </Field>
          <Field label="單價" required>
            <input
              type="number"
              min="0"
              step="any"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full text-right font-mono"
            />
          </Field>
          <Field label="供應商寄存單號 / 備註" full>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="選填：供應商提供的單據號碼"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
            />
          </Field>
        </div>
      </section>

      {/* 規則說明 */}
      <section className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-lg px-4 py-3 text-[12px] text-[#5A5955] leading-relaxed">
        <div className="text-[11px] font-semibold text-[#185FA5] mb-1">
          ℹ️ 寄存規則說明
        </div>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            寄存品項<b>不計入</b>可用庫存，不觸發庫存水位告警
          </li>
          <li>到期前可在 dashboard 看到提醒</li>
          <li>
            「確認轉入」後正式計入庫存，並自動產生「採購進貨」會計分錄（D 庫存 / C AP）
          </li>
          <li>「退還」後庫存不變，記錄保留 90 天</li>
        </ul>
      </section>

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

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}
