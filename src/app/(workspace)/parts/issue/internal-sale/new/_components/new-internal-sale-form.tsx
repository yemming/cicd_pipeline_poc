"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  InternalSaleFormData,
  RepairPickPreview,
} from "@/domain/issues";
import { previewRepairPick, createInternalSale } from "@/domain/issues";

type Banner = { ok: boolean; msg: string } | null;

type Line = {
  id: string;
  item_id: string;
  qty: string;
  unit_price: string;
  notes: string;
};

function fmtMoney(n: number): string {
  return `NT$ ${n.toLocaleString("en-US")}`;
}

let lineSeq = 0;
function newLine(): Line {
  lineSeq += 1;
  return { id: `l${lineSeq}`, item_id: "", qty: "1", unit_price: "0", notes: "" };
}

export function NewInternalSaleForm({ data }: { data: InternalSaleFormData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [warehouseId, setWarehouseId] = useState<string>(data.warehouses[0]?.id ?? "");
  const [customerId, setCustomerId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const [preview, setPreview] = useState<RepairPickPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }
  function backToStepA() {
    setPreview(null);
    setPreviewError(null);
  }
  function addLine() {
    setLines((p) => [...p, newLine()]);
    backToStepA();
  }
  function removeLine(id: string) {
    setLines((p) => (p.length > 1 ? p.filter((l) => l.id !== id) : p));
    backToStepA();
  }
  function updateLine(id: string, patch: Partial<Line>) {
    setLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    backToStepA();
  }

  const canPreview =
    !!warehouseId
    && notes.trim().length > 0
    && lines.length > 0
    && lines.every((l) => l.item_id && Number(l.qty) > 0 && Number(l.unit_price) >= 0);

  function runPreview() {
    if (!canPreview) return;
    setPreviewError(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewRepairPick({
        mode: "adhoc",
        warehouse_id: warehouseId,
        lines: lines.map((l) => ({ item_id: l.item_id, qty_needed: Number(l.qty) })),
      });
      if (res.ok) setPreview(res.data);
      else setPreviewError(res.error);
    });
  }

  function submitPost() {
    if (!preview || !preview.can_post) return;
    startTransition(async () => {
      const res = await createInternalSale({
        warehouse_id: warehouseId,
        customer_id: customerId || null,
        notes: notes.trim(),
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_needed: Number(l.qty),
          unit_price: Number(l.unit_price),
          line_notes: l.notes.trim() || null,
        })),
      });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已過帳 ${res.data.gi_no}` });
        router.push(`/parts/issue/internal-sale/${res.data.id}`);
        router.refresh();
      } else {
        flash({ ok: false, msg: `過帳失敗：${res.error}` });
      }
    });
  }

  const inStepA = preview === null;
  const itemIndex = useMemo(() => new Map(data.items.map((it) => [it.id, it])), [data.items]);

  // user-input 結算單價（per qty）合計
  const estimatedAmount = lines.reduce(
    (s, l) => s + Number(l.qty || 0) * Number(l.unit_price || 0),
    0,
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/internal-sale" className="hover:text-[#185FA5]">
            內售出貨
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增內售出貨</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/issue/internal-sale"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Step A */}
      {inStepA ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 出貨內容</h2>
              <p className="text-[11px] text-[#9A9890] mt-0.5">
                結算單價可自訂（內部售價）；FIFO 從源倉扣帳
              </p>
            </header>
            <div className="px-4 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    出庫倉 <span className="text-[#CC0000]">*</span>
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      backToStepA();
                    }}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 選擇出庫倉 —</option>
                    {data.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code ? `${w.code} ` : ""}
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    買方（選填）
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 不指定 —</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  用途說明 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="例如：員工 A 自用、展示車保養、跨法人銷售⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>

              <div className="space-y-2">
                <header className="flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-[#2C2C2A]">
                    出貨明細（{lines.length}）
                  </h3>
                  <button
                    type="button"
                    onClick={addLine}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  >
                    ＋ 新增料件
                  </button>
                </header>
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                      <th className="px-2 py-2 text-left font-medium w-[40px]">行</th>
                      <th className="px-2 py-2 text-left font-medium">料件</th>
                      <th className="px-2 py-2 text-right font-medium w-[90px]">出貨數</th>
                      <th className="px-2 py-2 text-right font-medium w-[120px]">結算單價</th>
                      <th className="px-2 py-2 text-right font-medium w-[120px]">金額（小計）</th>
                      <th className="px-2 py-2 text-left font-medium">備註</th>
                      <th className="px-2 py-2 w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const sub = Number(l.qty || 0) * Number(l.unit_price || 0);
                      return (
                        <tr key={l.id} className="border-t border-[#F8F7F4]">
                          <td className="px-2 py-2 font-mono text-[#9A9890]">{idx + 1}</td>
                          <td className="px-2 py-2">
                            <select
                              value={l.item_id}
                              onChange={(e) => updateLine(l.id, { item_id: e.target.value })}
                              className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                            >
                              <option value="">— 選擇料件 —</option>
                              {data.items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.code} — {it.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              min={1}
                              step="any"
                              value={l.qty}
                              onChange={(e) => updateLine(l.id, { qty: e.target.value })}
                              className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono focus:border-[#185FA5] outline-none"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={l.unit_price}
                              onChange={(e) => updateLine(l.id, { unit_price: e.target.value })}
                              className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right font-mono focus:border-[#185FA5] outline-none"
                            />
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-[#5A5955]">
                            {sub > 0 ? fmtMoney(sub) : "—"}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              value={l.notes}
                              onChange={(e) => updateLine(l.id, { notes: e.target.value })}
                              placeholder="—"
                              className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            {lines.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeLine(l.id)}
                                className="text-[12px] text-[#CC0000] hover:underline"
                              >
                                刪除
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
                      <td colSpan={4} className="px-2 py-2 text-[11px] text-[#9A9890] text-right">
                        合計
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
                        {fmtMoney(estimatedAmount)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </section>

          <aside className="bg-white border border-[#EEECE6] rounded-lg p-4 space-y-3 self-start">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">FIFO 配置</h2>
            <p className="text-[11px] text-[#9A9890] leading-relaxed">
              先預覽配置、確認源倉每個料件的可用量夠分配再過帳。任一料件不足 → 整批 abort。
            </p>
            <button
              type="button"
              onClick={runPreview}
              disabled={!canPreview || isPending}
              className="w-full h-[30px] rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "預覽中⋯" : "預覽配置 →"}
            </button>
            {!canPreview ? (
              <p className="text-[11px] text-[#9A9890]">
                請完成：出庫倉、用途說明、至少一筆料件 + 數量 / 單價
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* Step B */}
      {preview ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ FIFO 配置預覽</span>
            {preview.can_post ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                可過帳
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                庫存不足
              </span>
            )}
            <span className="text-[11px] text-[#9A9890] ml-auto">
              結算金額：<b className="font-mono text-[#2C2C2A]">{fmtMoney(estimatedAmount)}</b>
            </span>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[40px]">行</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">料號</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">名稱</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">需求</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">可用</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">缺貨</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">FIFO 配置</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => {
                  const item = itemIndex.get(l.item_id);
                  const code = l.item_code ?? item?.code ?? "—";
                  const isShort = l.shortage > 0;
                  return (
                    <tr
                      key={l.line_no}
                      className={`border-b border-[#EEECE6] ${isShort ? "bg-[#FDECEA]/40" : ""}`}
                    >
                      <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
                      <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{code}</td>
                      <td className="px-2 py-2">{l.item_name}</td>
                      <td className="px-2 py-2 text-right font-mono">{l.qty_needed}</td>
                      <td className="px-2 py-2 text-right font-mono">{l.qty_available}</td>
                      <td
                        className={`px-2 py-2 text-right font-mono ${
                          isShort ? "text-[#CC0000] font-semibold" : "text-[#9A9890]"
                        }`}
                      >
                        {l.shortage > 0 ? `-${l.shortage}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-[11px] text-[#5A5955]">
                        {l.picks.length === 0 ? (
                          <span className="text-[#CC0000]">無可配置庫存</span>
                        ) : (
                          <div className="space-y-0.5">
                            {l.picks.map((p, i) => (
                              <div key={i} className="font-mono">
                                {p.bin_label ?? "—"}：{p.qty} × 成本{p.unit_cost.toLocaleString("en-US")}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
            <button
              type="button"
              onClick={backToStepA}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              ← 返回修改
            </button>
            <button
              type="button"
              onClick={submitPost}
              disabled={!preview.can_post || isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              {isPending ? "過帳中⋯" : "建單並出貨"}
            </button>
          </footer>
        </section>
      ) : null}

      {previewError ? (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12.5px] rounded-lg px-4 py-2">
          預覽失敗：{previewError}
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
    </main>
  );
}
