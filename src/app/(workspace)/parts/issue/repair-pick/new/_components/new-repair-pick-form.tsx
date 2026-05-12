"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type {
  RepairPickFormData,
  RepairPickPreview,
} from "@/domain/issues";
import {
  previewRepairPick,
  pickForWorkOrder,
  pickAdHoc,
} from "@/domain/issues";

type Mode = "ro" | "adhoc";

type Banner = { ok: boolean; msg: string } | null;

type AdHocLine = {
  id: string;
  item_id: string;
  qty: string;
  notes: string;
};

function fmtMoney(n: number): string {
  return `NT$ ${n.toLocaleString("en-US")}`;
}

let lineSeq = 0;
function newLine(): AdHocLine {
  lineSeq += 1;
  return { id: `l${lineSeq}`, item_id: "", qty: "1", notes: "" };
}

export function NewRepairPickForm({ data }: { data: RepairPickFormData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [mode, setMode] = useState<Mode>("ro");
  const [warehouseId, setWarehouseId] = useState<string>(data.warehouses[0]?.id ?? "");

  // RO mode state
  const [selectedWoId, setSelectedWoId] = useState<string>("");

  // ad-hoc state
  const [adhocCustomerId] = useState<string>("");
  const [adhocNotes, setAdhocNotes] = useState<string>("");
  const [adhocLines, setAdhocLines] = useState<AdHocLine[]>([newLine()]);

  // preview state
  const [preview, setPreview] = useState<RepairPickPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  const canPreviewRo = mode === "ro" && !!selectedWoId && !!warehouseId;
  const canPreviewAdhoc =
    mode === "adhoc"
      && !!warehouseId
      && adhocNotes.trim().length > 0
      && adhocLines.length > 0
      && adhocLines.every((l) => l.item_id && Number(l.qty) > 0);
  const canPreview = mode === "ro" ? canPreviewRo : canPreviewAdhoc;

  function runPreview() {
    if (!canPreview) return;
    setPreviewError(null);
    setPreview(null);
    startTransition(async () => {
      const res =
        mode === "ro"
          ? await previewRepairPick({
              mode: "ro",
              work_order_id: selectedWoId,
              warehouse_id: warehouseId,
            })
          : await previewRepairPick({
              mode: "adhoc",
              warehouse_id: warehouseId,
              lines: adhocLines.map((l) => ({
                item_id: l.item_id,
                qty_needed: Number(l.qty),
              })),
            });
      if (res.ok) {
        setPreview(res.data);
      } else {
        setPreviewError(res.error);
      }
    });
  }

  function backToStepA() {
    setPreview(null);
    setPreviewError(null);
  }

  function submitPost() {
    if (!preview || !preview.can_post) return;
    startTransition(async () => {
      const res =
        mode === "ro"
          ? await pickForWorkOrder({
              work_order_id: selectedWoId,
              warehouse_id: warehouseId,
            })
          : await pickAdHoc({
              warehouse_id: warehouseId,
              customer_id: adhocCustomerId || null,
              notes: adhocNotes.trim(),
              lines: adhocLines.map((l) => ({
                item_id: l.item_id,
                qty_needed: Number(l.qty),
                line_notes: l.notes.trim() || null,
              })),
            });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已過帳 ${res.data.gi_no}` });
        router.push(`/parts/issue/repair-pick/${res.data.id}`);
        router.refresh();
      } else {
        flash({ ok: false, msg: `過帳失敗：${res.error}` });
      }
    });
  }

  // ad-hoc helpers
  function addAdhocLine() {
    setAdhocLines((p) => [...p, newLine()]);
    backToStepA();
  }
  function removeAdhocLine(id: string) {
    setAdhocLines((p) => (p.length > 1 ? p.filter((l) => l.id !== id) : p));
    backToStepA();
  }
  function updateAdhocLine(id: string, patch: Partial<AdHocLine>) {
    setAdhocLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    backToStepA();
  }

  const inStepA = preview === null;

  // index items by id for quick lookup in step B
  const itemIndex = useMemo(
    () => new Map(data.items.map((it) => [it.id, it])),
    [data.items],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/issue/repair-pick" className="hover:text-[#185FA5]">
            維修領料
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增領料</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/issue/repair-pick"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="bg-white border border-[#EEECE6] rounded-lg p-1 inline-flex gap-1">
        <button
          type="button"
          onClick={() => {
            setMode("ro");
            backToStepA();
          }}
          className={`h-[30px] px-4 rounded-md text-[12.5px] font-medium ${
            mode === "ro"
              ? "bg-[#1A3A5C] text-white"
              : "text-[#5A5955] hover:bg-[#F8F7F4]"
          }`}
        >
          綁定 RO 工單
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("adhoc");
            backToStepA();
          }}
          className={`h-[30px] px-4 rounded-md text-[12.5px] font-medium ${
            mode === "adhoc"
              ? "bg-[#1A3A5C] text-white"
              : "text-[#5A5955] hover:bg-[#F8F7F4]"
          }`}
        >
          ad-hoc 手動領料
        </button>
      </div>

      {/* Step A — chooser */}
      {inStepA && mode === "ro" ? (
        <RoChooser
          data={data}
          warehouseId={warehouseId}
          onWarehouse={(id) => {
            setWarehouseId(id);
            backToStepA();
          }}
          selectedWoId={selectedWoId}
          onSelectWo={(id) => {
            setSelectedWoId(id);
            backToStepA();
          }}
          onPreview={runPreview}
          isPending={isPending}
          canPreview={canPreview}
        />
      ) : null}

      {inStepA && mode === "adhoc" ? (
        <AdHocChooser
          data={data}
          warehouseId={warehouseId}
          onWarehouse={(id) => {
            setWarehouseId(id);
            backToStepA();
          }}
          notes={adhocNotes}
          onNotes={(v) => {
            setAdhocNotes(v);
            backToStepA();
          }}
          lines={adhocLines}
          addLine={addAdhocLine}
          removeLine={removeAdhocLine}
          updateLine={updateAdhocLine}
          items={data.items}
          onPreview={runPreview}
          isPending={isPending}
          canPreview={canPreview}
        />
      ) : null}

      {/* Step B — preview */}
      {preview ? (
        <PreviewPanel
          preview={preview}
          itemIndex={itemIndex}
          warehouseLabel={
            data.warehouses.find((w) => w.id === warehouseId)?.name ?? "—"
          }
          isPending={isPending}
          onBack={backToStepA}
          onSubmit={submitPost}
        />
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

function RoChooser({
  data,
  warehouseId,
  onWarehouse,
  selectedWoId,
  onSelectWo,
  onPreview,
  isPending,
  canPreview,
}: {
  data: RepairPickFormData;
  warehouseId: string;
  onWarehouse: (id: string) => void;
  selectedWoId: string;
  onSelectWo: (id: string) => void;
  onPreview: () => void;
  isPending: boolean;
  canPreview: boolean;
}) {
  const wos = data.workOrders.filter((w) => !w.already_picked);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
      {/* Left: WO list */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 待領料的工單（{wos.length} 筆）
          </h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">
            只列出 status ∈ draft/dispatched/in_progress/qc 且綁定料件且尚未領料的工單
          </p>
        </header>
        {wos.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12.5px] text-[#9A9890]">
            沒有待領料的工單。可改用「ad-hoc 手動領料」、或先到{" "}
            <Link href="/service/workorders" className="text-[#185FA5] underline">
              維修工單
            </Link>{" "}
            建立。
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="px-4 py-2 text-left font-medium w-[40px]"></th>
                <th className="px-4 py-2 text-left font-medium">RO 工單</th>
                <th className="px-4 py-2 text-left font-medium">車主</th>
                <th className="px-4 py-2 text-left font-medium">狀態</th>
                <th className="px-4 py-2 text-right font-medium">料件項數</th>
                <th className="px-4 py-2 text-right font-medium">料件總數</th>
              </tr>
            </thead>
            <tbody>
              {wos.map((w) => {
                const checked = selectedWoId === w.id;
                return (
                  <tr
                    key={w.id}
                    onClick={() => onSelectWo(w.id)}
                    className={`border-t border-[#F8F7F4] cursor-pointer ${
                      checked ? "bg-[#EAF4FB]" : "hover:bg-[#F8F7F4]"
                    }`}
                  >
                    <td className="px-4 py-2">
                      <input
                        type="radio"
                        name="wo"
                        checked={checked}
                        onChange={() => onSelectWo(w.id)}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold text-[#1A3A5C]">
                      {w.ro_no}
                    </td>
                    <td className="px-4 py-2">{w.customer_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{w.parts_line_count}</td>
                    <td className="px-4 py-2 text-right font-mono">{w.parts_qty_total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Right: warehouse + preview button */}
      <aside className="bg-white border border-[#EEECE6] rounded-lg p-4 space-y-3 self-start">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">出庫倉</h2>
        <select
          value={warehouseId}
          onChange={(e) => onWarehouse(e.target.value)}
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
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview || isPending}
          className="w-full h-[30px] rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
        >
          {isPending ? "預覽中⋯" : "預覽配置 →"}
        </button>
        {!canPreview ? (
          <p className="text-[11px] text-[#9A9890] leading-relaxed">
            請先選 RO 工單與出庫倉
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function AdHocChooser({
  data,
  warehouseId,
  onWarehouse,
  notes,
  onNotes,
  lines,
  addLine,
  removeLine,
  updateLine,
  items,
  onPreview,
  isPending,
  canPreview,
}: {
  data: RepairPickFormData;
  warehouseId: string;
  onWarehouse: (id: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  lines: AdHocLine[];
  addLine: () => void;
  removeLine: (id: string) => void;
  updateLine: (id: string, patch: Partial<AdHocLine>) => void;
  items: RepairPickFormData["items"];
  onPreview: () => void;
  isPending: boolean;
  canPreview: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
      {/* Left: lines + notes */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 領料明細（ad-hoc）</h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">
            手動指定料件與數量；不綁工單、不寫 ro_id
          </p>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              領料原因 <span className="text-[#CC0000]">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              rows={2}
              placeholder="例如：店內展示車保養、內部測試件⋯"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>

          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="px-2 py-2 text-left font-medium w-[40px]">行</th>
                <th className="px-2 py-2 text-left font-medium">料件</th>
                <th className="px-2 py-2 text-right font-medium w-[100px]">數量</th>
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
                      {items.map((it) => (
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

          <button
            type="button"
            onClick={addLine}
            className="h-[28px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            ＋ 新增一行
          </button>
        </div>
      </section>

      {/* Right: warehouse + preview button */}
      <aside className="bg-white border border-[#EEECE6] rounded-lg p-4 space-y-3 self-start">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">出庫倉</h2>
        <select
          value={warehouseId}
          onChange={(e) => onWarehouse(e.target.value)}
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
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview || isPending}
          className="w-full h-[30px] rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
        >
          {isPending ? "預覽中⋯" : "預覽配置 →"}
        </button>
        {!canPreview ? (
          <p className="text-[11px] text-[#9A9890] leading-relaxed">
            請先填原因、選出庫倉、確認每行料件與數量
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function PreviewPanel({
  preview,
  itemIndex,
  warehouseLabel,
  isPending,
  onBack,
  onSubmit,
}: {
  preview: RepairPickPreview;
  itemIndex: Map<string, RepairPickFormData["items"][number]>;
  warehouseLabel: string;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          ▼ FIFO 配置預覽 — {warehouseLabel}
        </span>
        {preview.can_post ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
            可過帳
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
          onClick={onBack}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 返回修改
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!preview.can_post || isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? "過帳中⋯" : "一鍵領料並過帳"}
        </button>
      </footer>
    </section>
  );
}
