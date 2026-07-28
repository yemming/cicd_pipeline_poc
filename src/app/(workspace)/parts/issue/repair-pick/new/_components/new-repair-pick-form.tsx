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
  createReplenishmentRequest,
} from "@/domain/issues";
import {
  getCrossWarehouseStock,
  type CrossStoreStockRow,
} from "@/domain/repair-order-lines";

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

export function NewRepairPickForm({
  data,
  warrantyItemIds = new Set<string>(),
}: {
  data: RepairPickFormData;
  warrantyItemIds?: Set<string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [mode, setMode] = useState<Mode>("ro");
  const [warehouseId, setWarehouseId] = useState<string>(data.warehouses[0]?.id ?? "");

  // RO mode state
  const [selectedWoId, setSelectedWoId] = useState<string>("");

  // 當前 RO 的 warranty item ids（由 props 帶入，單一 RO 內固定）
  const [activeWarrantyIds] = useState<Set<string>>(warrantyItemIds);

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
    // 部分出庫：只要有可出庫存（qty_total > 0）就能過帳；完全無庫存才擋。
    if (!preview || preview.qty_total <= 0) return;
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
        const msg = res.data.partial
          ? `✓ 已部分出庫 ${res.data.gi_no}；缺貨 ${res.data.shortage_count ?? ""} 項已轉補貨需求${res.data.req_no ? ` ${res.data.req_no}` : ""}`
          : `✓ 已過帳 ${res.data.gi_no}`;
        flash({ ok: true, msg });
        router.push(`/parts/issue/repair-pick/${res.data.id}`);
        router.refresh();
      } else {
        flash({ ok: false, msg: `過帳失敗：${res.error}` });
      }
    });
  }

  function handleCreateReplenishment() {
    if (!preview) return;
    const shortageLines = preview.lines
      .filter((l) => l.shortage > 0)
      .map((l) => ({
        item_id: l.item_id,
        item_code: l.item_code,
        item_name: l.item_name,
        qty_shortage: l.shortage,
      }));
    if (shortageLines.length === 0) return;

    const selectedWo = data.workOrders.find((w) => w.id === selectedWoId);
    startTransition(async () => {
      const res = await createReplenishmentRequest({
        work_order_id: selectedWoId || null,
        ro_no: selectedWo?.ro_no ?? null,
        warehouse_id: warehouseId,
        shortage_lines: shortageLines,
      });
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已建立補貨需求單 ${res.data.req_no}` });
      } else {
        flash({ ok: false, msg: `建立補貨需求失敗：${res.error}` });
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
          onCreateReplenishment={handleCreateReplenishment}
          warrantyItemIds={activeWarrantyIds}
          selectedWoId={selectedWoId}
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
                      {w.partially_picked ? (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-sans font-medium bg-[#FDF3E3] text-[#854F0B] align-middle">
                          部分已領·待補貨
                        </span>
                      ) : null}
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
  onCreateReplenishment,
  warrantyItemIds,
  selectedWoId,
}: {
  preview: RepairPickPreview;
  itemIndex: Map<string, RepairPickFormData["items"][number]>;
  warehouseLabel: string;
  isPending: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onCreateReplenishment: () => void;
  warrantyItemIds: Set<string>;
  selectedWoId: string;
}) {
  // 缺料明細
  const shortageLines = preview.lines.filter((l) => l.shortage > 0);
  const hasShortage = shortageLines.length > 0;
  // 部分出庫狀態：完全無庫存可出 / 可部分出庫 / 全可過帳
  const nothingToIssue = preview.qty_total <= 0;
  const partial = hasShortage && !nothingToIssue;
  // B1：缺料是否含「被其他工單預留卡住」的部分 → 決定「等待釋放」選項是否適用
  const hasReservedByOthers = shortageLines.some((l) => l.reserved_by_ros.length > 0);

  // 保固件明細（料件在保固 id 清單中）
  const warrantyLines = preview.lines.filter((l) => warrantyItemIds.has(l.item_id));
  const hasWarranty = warrantyLines.length > 0;

  // B1：跨店（跨倉）庫存查詢 modal — 缺料時三選項之一「跨店調撥」，就地查詢不必跳去 RO 明細頁
  const [crossStore, setCrossStore] = useState<{
    line: RepairPickPreview["lines"][number];
    rows: CrossStoreStockRow[] | null;
  } | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);
  async function openCrossStore(line: RepairPickPreview["lines"][number]) {
    setCrossStore({ line, rows: null });
    setCrossLoading(true);
    const rows = await getCrossWarehouseStock(line.item_id);
    setCrossStore((c) => (c && c.line.item_id === line.item_id ? { ...c, rows } : c));
    setCrossLoading(false);
  }

  return (
    <>
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          ▼ FIFO 配置預覽 — {warehouseLabel}
        </span>
        {preview.can_post ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
            可過帳
          </span>
        ) : nothingToIssue ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
            無庫存可出
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            可部分出庫
          </span>
        )}
      </header>

      {/* 缺料警示區塊 — B1：緊急採購／等待釋放／跨店調撥三種處理選項統一彙整於此，不分散到別頁 */}
      {hasShortage && (
        <div className="px-4 py-3 border-b border-[#F5AEAD] bg-[#FDECEA]/30">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-[#CC0000] text-[16px]">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-[#CC0000]">
                缺料警示 — {shortageLines.length} 項料件庫存不足
              </p>
              <ul className="mt-1 space-y-1">
                {shortageLines.map((l) => (
                  <li key={l.item_id} className="text-[11.5px] text-[#CC0000]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono">
                        {l.item_code ?? "—"} {l.item_name}：缺 {l.shortage} 件
                      </span>
                      {l.reserved_by_ros.length > 0 && (
                        <span className="text-[#854F0B]">
                          🔒 已被{" "}
                          {l.reserved_by_ros.map((r, i) => (
                            <span key={r.ro_id}>
                              {i > 0 ? "、" : ""}
                              <a
                                href={`/parts/aftersales/repair-orders/${r.ro_id}/lines`}
                                target="_blank"
                                rel="noreferrer"
                                className="underline hover:text-[#0F2A45]"
                              >
                                {r.ro_code ?? r.ro_id.slice(0, 8)}
                              </a>
                            </span>
                          ))}{" "}
                          預留 {l.reserved_by_others} 件
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openCrossStore(l)}
                        className="h-[20px] px-2 rounded text-[10.5px] font-sans font-medium bg-white border border-[#F5AEAD] text-[#185FA5] hover:bg-[#EAF4FB]"
                      >
                        查跨店庫存
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 三種處理選項 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
            <div className="rounded border border-[#F5AEAD] bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold text-[#854F0B] mb-1.5">① 緊急採購</p>
              <button
                type="button"
                onClick={onCreateReplenishment}
                disabled={isPending}
                className="h-[26px] w-full px-3 rounded text-[11.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50 inline-flex items-center justify-center gap-1"
              >
                {isPending ? "建立中⋯" : "📦 建立補貨需求單"}
              </button>
              <p className="text-[10.5px] text-[#9A9890] mt-1 leading-relaxed">
                向採購登記缺料需求，走一般補貨流程。
              </p>
            </div>
            <div className="rounded border border-[#F5AEAD] bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold text-[#854F0B] mb-1.5">② 等待釋放</p>
              <p className="text-[11px] text-[#5A5955] leading-relaxed">
                {hasReservedByOthers
                  ? "上方已標示被哪些工單預留；待對方領料完成或取消預留後，本單缺額會自動釋放，稍後回來重新查詢即可，不需額外動作。"
                  : "本次缺料非其他工單預留造成（倉內確實無庫存），此選項不適用，請改用左／右側選項。"}
              </p>
            </div>
            <div className="rounded border border-[#F5AEAD] bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold text-[#854F0B] mb-1.5">③ 跨店調撥</p>
              <p className="text-[11px] text-[#5A5955] leading-relaxed">
                點上方缺料列的「查跨店庫存」看各倉可用量；確認他倉有貨後，至「庫存調撥」開立調撥單。
              </p>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-[#854F0B]">
            {nothingToIssue
              ? "目前完全無可用庫存，無法出庫；請選擇上方任一處理方式。"
              : "可先就足額品項過帳出庫，缺貨品項按「部分出庫並過帳」時會自動轉補貨需求並回寫工單；若只想登記補貨、暫不出庫，可單獨使用上方①的按鈕。"}
          </p>

          {/* 通知售後 SA 啟動增項閉環（既有功能，與三選項無關，維持在此） */}
          {selectedWoId && (
            <div className="mt-2">
              <a
                href={`/service/workorders/${selectedWoId}`}
                target="_blank"
                rel="noreferrer"
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#FDF3E3] border border-[#F0D9A8] text-[#854F0B] hover:bg-[#fde9b8] inline-flex items-center gap-1"
              >
                🔔 通知售後 SA 啟動增項閉環 →
              </a>
            </div>
          )}
        </div>
      )}

      {/* 保固件寄存提示 */}
      {hasWarranty && (
        <div className="px-4 py-2.5 border-b border-[#85B7EB] bg-[#EAF4FB]/40">
          <div className="flex items-start gap-2">
            <span className="text-[#185FA5] text-[15px]">🔒</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#185FA5]">
                保固件提示 — {warrantyLines.length} 項保固料件
              </p>
              <p className="text-[11.5px] text-[#0C3E70] mt-0.5">
                出庫後請將舊件送入保固暫存倉並登記索賠單號。
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {warrantyLines.map((l) => (
                  <span key={l.item_id} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] border border-[#85B7EB] font-mono">
                    {l.item_code ?? l.item_name}
                  </span>
                ))}
                <a
                  href={selectedWoId ? `/service/warranty/claims/new?ro=${selectedWoId}` : "/service/warranty/claims/new"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-white border border-[#85B7EB] text-[#185FA5] hover:bg-[#EAF4FB]"
                >
                  前往保固索賠 →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

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
              const isWarranty = warrantyItemIds.has(l.item_id);
              return (
                <tr
                  key={l.line_no}
                  className={`border-b border-[#EEECE6] ${isShort ? "bg-[#FDECEA]/40" : ""}`}
                >
                  <td className="px-2 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
                  <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">{code}</td>
                  <td className="px-2 py-2">
                    <span>{l.item_name}</span>
                    {isWarranty && (
                      <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[10px] bg-[#EAF4FB] text-[#185FA5] border border-[#85B7EB]">
                        保固件
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{l.qty_needed}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {l.qty_available}
                    {l.reserved_by_others > 0 && (
                      <div
                        className="mt-0.5 text-[10px] text-[#854F0B] whitespace-nowrap"
                        title="此料件有數量已被其他工單預留，不可重複領出"
                      >
                        🔒 已被其他工單預留 {l.reserved_by_others}
                      </div>
                    )}
                  </td>
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
          disabled={nothingToIssue || isPending}
          title={nothingToIssue ? "目前完全無可用庫存，請改建補貨需求單" : undefined}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending
            ? partial
              ? "部分出庫中⋯"
              : "過帳中⋯"
            : partial
              ? "部分出庫並過帳（缺貨轉補貨）"
              : "一鍵領料並過帳"}
        </button>
      </footer>
    </section>

    {/* B1：跨店（跨倉）庫存 modal — 就地查詢，不必跳去 RO 明細頁 */}
    {crossStore && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        onClick={() => setCrossStore(null)}
      >
        <div
          className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[460px] max-w-[92vw] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              跨店庫存 — {crossStore.line.item_name}
            </div>
            <div className="text-[11px] text-[#9A9890] font-mono mt-0.5">
              {crossStore.line.item_code ?? "—"} · 本單缺 {crossStore.line.shortage}
            </div>
          </header>
          <div className="px-4 py-3 max-h-[50vh] overflow-y-auto">
            {crossLoading ? (
              <div className="text-[12.5px] text-[#9A9890] py-6 text-center">查詢中⋯</div>
            ) : !crossStore.rows || crossStore.rows.length === 0 ? (
              <div className="text-[12.5px] text-[#CC0000] py-6 text-center">
                全品牌各倉皆無此料庫存，建議改採購 / 等待釋放。
              </div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                    <th className="text-left py-1.5">倉庫</th>
                    <th className="text-right py-1.5">可用庫存</th>
                  </tr>
                </thead>
                <tbody>
                  {crossStore.rows.map((w) => (
                    <tr key={w.warehouse_id} className="border-b border-[#F2F2F2] last:border-0">
                      <td className="py-1.5">
                        <span className="font-mono text-[11px] text-[#5A5955]">
                          {w.warehouse_code ?? "—"}
                        </span>{" "}
                        {w.warehouse_name}
                      </td>
                      <td className="py-1.5 text-right font-mono font-semibold text-[#1A3A5C]">
                        {w.qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 text-[11px] text-[#9A9890]">
              如需從他倉調貨，請至「庫存調撥」開立調撥單（POC：此處先供查詢）。
            </div>
          </div>
          <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end">
            <button
              type="button"
              onClick={() => setCrossStore(null)}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              關閉
            </button>
          </footer>
        </div>
      </div>
    )}
    </>
  );
}
