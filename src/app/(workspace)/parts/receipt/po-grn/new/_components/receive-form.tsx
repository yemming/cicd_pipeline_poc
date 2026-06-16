"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { receiveStock } from "@/domain/receipts";
import { recordWrongItemRejection } from "@/domain/receiving-discrepancies";

type Line = {
  id: string;
  line_no: number;
  item_id: string;
  item_name: string;
  item_code: string;
  qty_ordered: number;
  qty_received: number;
  unit_price: number;
};

type ReceiveLine = {
  po_line_id: string;
  qty_to_receive: number;
  bin_id: string;
  serial_no: string;
  batch_no: string;
  // 「料號送錯」選填欄位：實際到貨料號（與 PO 訂購料號不同時填）
  actual_item_code: string;
};

export function ReceiveForm({
  po,
  lines,
  bins,
}: {
  po: {
    id: string;
    po_no: string;
    warehouse_id: string;
    warehouse_name: string | null;
    vendor_name: string | null;
  };
  lines: Line[];
  bins: Array<{ id: string; code: string; name: string | null }>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>(
    lines.map((l) => ({
      po_line_id: l.id,
      qty_to_receive: l.qty_ordered - l.qty_received,
      bin_id: bins[0]?.id ?? "",
      serial_no: "",
      batch_no: "",
      actual_item_code: "",
    })),
  );
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateLine = (idx: number, patch: Partial<ReceiveLine>) =>
    setReceiveLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  function handleSubmit() {
    setBanner(null);
    const toSubmit = receiveLines
      .map((rl, idx) => ({ ...rl, line: lines[idx] }))
      .filter((rl) => rl.qty_to_receive > 0);
    if (toSubmit.length === 0) {
      setBanner({ ok: false, msg: "至少選一筆要收貨的明細（數量 > 0）" });
      return;
    }
    startTransition(async () => {
      const result = await receiveStock({
        po_id: po.id,
        notes: notes || undefined,
        lines: toSubmit.map((rl) => ({
          po_line_id: rl.po_line_id,
          item_id: rl.line.item_id,
          qty_received: Number(rl.qty_to_receive),
          bin_id: rl.bin_id || undefined,
          serial_no: rl.serial_no || undefined,
          batch_no: rl.batch_no || undefined,
          unit_cost: rl.line.unit_price,
        })),
      });
      if (!result.ok) {
        setBanner({ ok: false, msg: result.error });
        return;
      }

      // 「料號送錯」備註記錄（不阻斷主流程，吞錯）
      const grId = result.data.receipt_id;
      for (const rl of toSubmit) {
        const actualCode = rl.actual_item_code.trim();
        if (actualCode && actualCode !== rl.line.item_code) {
          try {
            await recordWrongItemRejection({
              item_id: rl.line.item_id,
              qty_diff: rl.qty_to_receive,
              actual_item_code: actualCode,
              po_id: po.id,
              po_line_id: rl.po_line_id,
              gr_id: grId,
            });
          } catch {
            // 靜默：備註失敗不影響收貨結果
          }
        }
      }

      setBanner({ ok: true, msg: `✓ 已建立 ${result.data.gr_no}` });
      setTimeout(() => router.push("/parts/receipt/po-grn"), 700);
    });
  }

  const inputClass =
    "h-[30px] w-full px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";
  const labelClass = "block text-[11px] text-[#9A9890] font-medium mb-1";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + Mode badge */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/receipt/po-grn" className="hover:text-[#185FA5]">
            採購入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">執行收貨</span>
          <span className="ml-1 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            收貨模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/receipt/po-grn"
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
            {isPending ? "收貨中⋯" : "確認收貨並產生 GR"}
          </button>
        </div>
      </div>

      {/* PO header */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購單資訊</h2>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-[12.5px]">
          <div>
            <div className={labelClass}>PO 編號</div>
            <div className="font-mono font-semibold text-[#1A3A5C]">{po.po_no}</div>
          </div>
          <div>
            <div className={labelClass}>供應商</div>
            <div className="text-[#2C2C2A]">{po.vendor_name ?? "—"}</div>
          </div>
          <div>
            <div className={labelClass}>收貨倉庫</div>
            <div className="text-[#2C2C2A]">{po.warehouse_name ?? "—"}</div>
          </div>
        </div>
      </section>

      {/* Lines */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 收貨明細</h2>
        </header>
        <div className="px-4 py-3 space-y-2">
          {lines.map((line, idx) => {
            const remaining = line.qty_ordered - line.qty_received;
            const rl = receiveLines[idx];
            return (
              <div key={line.id} className="border border-[#EEECE6] rounded px-3 py-2.5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-[10px] text-[#9A9890]">#{line.line_no}</span>
                  <span className="font-medium text-[12.5px] text-[#2C2C2A]">{line.item_name}</span>
                  <span className="text-[11px] text-[#9A9890] font-mono">{line.item_code}</span>
                  <span className="ml-auto text-[11px] text-[#854F0B]">
                    未收 <b className="font-mono">{remaining}</b> 件
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-2">
                    <label className={labelClass}>收貨數</label>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      value={rl.qty_to_receive}
                      onChange={(e) =>
                        updateLine(idx, { qty_to_receive: Number(e.target.value) || 0 })
                      }
                      className={inputClass + " text-right font-mono"}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className={labelClass}>庫位</label>
                    <select
                      value={rl.bin_id}
                      onChange={(e) => updateLine(idx, { bin_id: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">（不指定）</option>
                      {bins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                          {b.name ? ` · ${b.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>序列號（選填）</label>
                    <input
                      type="text"
                      value={rl.serial_no}
                      onChange={(e) => updateLine(idx, { serial_no: e.target.value })}
                      className={inputClass + " font-mono"}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>批號（選填）</label>
                    <input
                      type="text"
                      value={rl.batch_no}
                      onChange={(e) => updateLine(idx, { batch_no: e.target.value })}
                      className={inputClass + " font-mono"}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className={labelClass}>
                      實到料號（選填，料號送錯時填）
                    </label>
                    <input
                      type="text"
                      placeholder={line.item_code}
                      value={rl.actual_item_code}
                      onChange={(e) => updateLine(idx, { actual_item_code: e.target.value })}
                      className={
                        inputClass +
                        " font-mono" +
                        (rl.actual_item_code.trim() && rl.actual_item_code.trim() !== line.item_code
                          ? " border-[#854F0B] bg-[#FDF3E3]"
                          : "")
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {lines.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] text-center py-6">
              此 PO 沒有可收貨的明細
            </div>
          ) : null}
        </div>
      </section>

      {/* Notes */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 收貨備註</h2>
        </header>
        <div className="px-4 py-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="（選填）司機 / 送貨車牌 / 驗收人..."
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
