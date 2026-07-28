"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  NewTransferFormData,
  TransferPreview,
} from "@/domain/transfers";
import { previewTransfer, createTransfer } from "@/domain/transfers";

type Banner = { ok: boolean; msg: string } | null;

type Line = {
  id: string;
  item_id: string;
  qty: string;
  notes: string;
};

const TRANSFER_TYPES: Array<{ value: string; label: string }> = [
  { value: "inter_store", label: "店間調撥" },
  { value: "intra_store", label: "店內調撥" },
  { value: "warranty_to_temp", label: "保固轉暫存" },
  { value: "consignment_to_main", label: "寄銷轉自有" },
];

function fmtMoney(n: number): string {
  return `NT$ ${n.toLocaleString("en-US")}`;
}

let lineSeq = 0;
function newLine(): Line {
  lineSeq += 1;
  return { id: `l${lineSeq}`, item_id: "", qty: "1", notes: "" };
}

export function NewTransferOutForm({ data }: { data: NewTransferFormData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [transferType, setTransferType] = useState<string>("inter_store");
  const [reason, setReason] = useState<string>("");
  const [eta, setEta] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [trackingNo, setTrackingNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  const canPreview =
    !!sourceId
    && !!targetId
    && sourceId !== targetId
    && lines.length > 0
    && lines.every((l) => l.item_id && Number(l.qty) > 0);

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

  function runPreview() {
    if (!canPreview) return;
    setPreviewError(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewTransfer({
        source_warehouse_id: sourceId,
        target_warehouse_id: targetId,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_requested: Number(l.qty),
        })),
      });
      if (res.ok) setPreview(res.data);
      else setPreviewError(res.error);
    });
  }

  function submitPost() {
    if (!preview || !preview.can_post) return;
    startTransition(async () => {
      const res = await createTransfer({
        source_warehouse_id: sourceId,
        target_warehouse_id: targetId,
        transfer_type: transferType,
        reason: reason || undefined,
        expected_arrival_date: eta || undefined,
        logistics_provider: provider || undefined,
        logistics_tracking_no: trackingNo || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_requested: Number(l.qty),
          line_notes: l.notes.trim() || null,
        })),
      });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已送出調撥申請 ${res.data.tr_no}，待目標倉核准` });
        router.push(`/parts/issue/transfer-out/${res.data.id}`);
        router.refresh();
      } else {
        flash({ ok: false, msg: `送出申請失敗：${res.error}` });
      }
    });
  }

  const inStepA = preview === null;
  const targetCandidates = data.warehouses.filter((w) => w.id !== sourceId);
  const itemIndex = useMemo(() => new Map(data.items.map((it) => [it.id, it])), [data.items]);

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/transfer-out" className="hover:text-[#185FA5]">
            調撥出庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增調撥</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/issue/transfer-out"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Step A — chooser */}
      {inStepA ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
          {/* Left: form */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 調撥單內容</h2>
              <p className="text-[11px] text-[#9A9890] mt-0.5">
                送出後為待核准申請：目標倉主管核准 → 來源倉才依 FIFO 扣帳、建在途 → 等對面 transfer-in 收貨
              </p>
            </header>
            <div className="px-4 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    來源倉 <span className="text-[#CC0000]">*</span>
                  </label>
                  <select
                    value={sourceId}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      if (e.target.value === targetId) setTargetId("");
                      backToStepA();
                    }}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 選擇來源倉 —</option>
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
                    目標倉 <span className="text-[#CC0000]">*</span>
                  </label>
                  <select
                    value={targetId}
                    onChange={(e) => {
                      setTargetId(e.target.value);
                      backToStepA();
                    }}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    <option value="">— 選擇目標倉 —</option>
                    {targetCandidates.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code ? `${w.code} ` : ""}
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">類型</label>
                  <select
                    value={transferType}
                    onChange={(e) => {
                      setTransferType(e.target.value);
                      backToStepA();
                    }}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  >
                    {TRANSFER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    調撥原因
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例：補貨 / 季節調節 / 客戶要貨"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    預計到貨日
                  </label>
                  <input
                    type="date"
                    value={eta}
                    onChange={(e) => setEta(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </div>
                <div />
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">物流商</label>
                  <input
                    type="text"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="例：黑貓宅急便"
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                    物流單號
                  </label>
                  <input
                    type="text"
                    value={trackingNo}
                    onChange={(e) => setTrackingNo(e.target.value)}
                    className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">備註</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>

              <div className="space-y-2">
                <header className="flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-[#2C2C2A]">
                    調撥明細（{lines.length}）
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
                      <th className="px-2 py-2 text-right font-medium w-[100px]">申請數</th>
                      <th className="px-2 py-2 text-left font-medium">備註</th>
                      <th className="px-2 py-2 w-[60px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Right: preview button */}
          <aside className="bg-white border border-[#EEECE6] rounded-lg p-4 space-y-3 self-start">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">FIFO 配置</h2>
            <p className="text-[11px] text-[#9A9890] leading-relaxed">
              先預覽配置，確認來源倉每個料件的庫存夠分配再過帳。任一料件不足 → 整批 abort。
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
                請完成：來源/目標倉（不可相同）、至少一行料件 + 數量 &gt; 0
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* Step B — preview */}
      {preview ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ FIFO 配置預覽</span>
            {preview.can_post ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                可送出申請
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                庫存不足
              </span>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[40px]">行</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">料號</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">名稱</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">申請</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">可用</th>
                  <th className="text-right px-2 py-2 text-[11px] text-[#9A9890] font-medium w-[80px]">缺貨</th>
                  <th className="text-left px-2 py-2 text-[11px] text-[#9A9890] font-medium">FIFO 配置（源倉）</th>
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
                      <td className="px-2 py-2 text-right font-mono">{l.qty_requested}</td>
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
                                {p.bin_label ?? "—"}：{p.qty} × {p.unit_cost.toLocaleString("en-US")}
                                {p.serial_no ? ` [SN ${p.serial_no}]` : ""}
                                {p.batch_no ? ` [Batch ${p.batch_no}]` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
                  <td colSpan={3} className="px-2 py-2 text-[11px] text-[#9A9890]">合計</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">{preview.qty_total}</td>
                  <td colSpan={2}></td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">
                    {fmtMoney(preview.amount_total)}
                  </td>
                </tr>
              </tfoot>
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
              {isPending ? "送出中⋯" : "送出調撥申請"}
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
