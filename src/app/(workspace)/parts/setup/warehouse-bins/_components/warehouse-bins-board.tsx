"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  createBin,
  createBinsBatch,
  createZone,
  deleteBin,
  deleteZone,
  updateBin,
  updateZone,
} from "@/domain/warehouse";
import type { BinRow, WarehouseSummary, ZoneWithBins } from "@/domain/warehouse";

type BinStatus = "used" | "empty" | "reserved";

const BIN_PALETTE: Record<BinStatus, { bg: string; border: string; text: string; subText: string; label: string }> = {
  used: {
    bg: "bg-[#E8F5F0]",
    border: "border-[#0F6E56]",
    text: "text-[#0F6E56]",
    subText: "text-[#0F6E56]",
    label: "已用",
  },
  empty: {
    bg: "bg-[#F8F7F4]",
    border: "border-[#D5D3CB]",
    text: "text-[#9A9890]",
    subText: "text-[#9A9890]",
    label: "空",
  },
  reserved: {
    bg: "bg-[#FDF3E3]",
    border: "border-[#FAC775]",
    text: "text-[#854F0B]",
    subText: "text-[#854F0B]",
    label: "保留",
  },
};

const CONTROL_LEVELS = [
  { value: "normal", label: "一般" },
  { value: "high_value", label: "高價值" },
  { value: "hazardous", label: "危險品" },
] as const;

const STATUS_OPTIONS: { value: BinStatus; label: string }[] = [
  { value: "empty", label: "空" },
  { value: "used", label: "已用" },
  { value: "reserved", label: "保留" },
];

function binStatus(bin: BinRow): BinStatus {
  const meta = (bin.metadata ?? {}) as Record<string, unknown>;
  const s = typeof meta.status === "string" ? meta.status : "empty";
  if (s === "used" || s === "reserved" || s === "empty") return s;
  return "empty";
}

type Banner = { ok: boolean; msg: string } | null;

type ModalState =
  | { kind: "none" }
  | { kind: "zone-create" }
  | { kind: "zone-edit"; zone: ZoneWithBins }
  | { kind: "zone-delete"; zone: ZoneWithBins }
  | { kind: "bin-create"; zoneId?: string }
  | { kind: "bin-batch"; zoneId?: string }
  | { kind: "bin-edit"; bin: BinRow };

export function WarehouseBinsBoard({
  warehouses,
  activeWarehouse,
  zones,
  canEdit,
}: {
  warehouses: WarehouseSummary[];
  activeWarehouse: WarehouseSummary | null;
  zones: ZoneWithBins[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [banner, setBanner] = useState<Banner>(null);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      window.setTimeout(() => setBanner(null), 2200);
    }
  }

  function refresh() {
    router.refresh();
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          倉庫/庫區/庫位/擺放設定
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 2.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定四層倉儲結構的實際位置與編碼規則
        </span>
        <Link
          href="/parts/setup/warehouse-arch"
          className="ml-auto text-[12px] text-[#185FA5] hover:underline"
        >
          ← 倉儲四層架構
        </Link>
      </header>

      <div className="flex gap-3 items-start">
        {/* 左：倉庫選擇 */}
        <aside className="w-[200px] flex-shrink-0 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-[#5A5955]">倉庫選擇</span>
            <span className="ml-auto text-[10.5px] text-[#9A9890] font-mono">{warehouses.length}</span>
          </div>
          {warehouses.length === 0 ? (
            <div className="px-3 py-6 text-[12px] text-[#9A9890] text-center">
              尚無倉庫
            </div>
          ) : (
            warehouses.map((w) => {
              const isActive = activeWarehouse?.id === w.id;
              return (
                <Link
                  key={w.id}
                  href={`/parts/setup/warehouse-bins?w=${w.id}`}
                  className={`block px-3 py-2.5 border-b border-[#EEECE6] last:border-b-0 hover:bg-[#F8F7F4] ${
                    isActive ? "bg-[#EAF4FB] border-l-[3px] border-l-[#185FA5]" : ""
                  }`}
                >
                  <div
                    className={`text-[12.5px] font-medium ${isActive ? "text-[#185FA5]" : "text-[#2C2C2A]"}`}
                  >
                    {w.name}
                  </div>
                  <div className="text-[11px] text-[#9A9890]">
                    {w.zone_count} 庫區・{w.bin_count} 庫位
                  </div>
                </Link>
              );
            })
          )}
        </aside>

        {/* 右：庫區與庫位 */}
        <section className={`flex-1 min-w-0 space-y-2 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
          <div className="flex justify-between items-center">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              {activeWarehouse?.name ?? "—"} — 庫區與庫位設定
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={!canEdit || !activeWarehouse || isPending}
                onClick={() => setModal({ kind: "zone-create" })}
                className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 disabled:cursor-not-allowed"
                title={!canEdit ? "沒有編輯權限" : !activeWarehouse ? "請先選一個倉庫" : undefined}
              >
                ＋ 庫區
              </button>
              <button
                type="button"
                disabled={!canEdit || zones.length === 0 || isPending}
                onClick={() => setModal({ kind: "bin-create" })}
                className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !canEdit
                    ? "沒有編輯權限"
                    : zones.length === 0
                      ? "庫位必須屬於庫區。請先建一個庫區再回來。"
                      : undefined
                }
              >
                ＋ 庫位
              </button>
              <button
                type="button"
                disabled={!canEdit || zones.length === 0 || isPending}
                onClick={() => setModal({ kind: "bin-batch" })}
                className="h-[26px] px-3 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  !canEdit
                    ? "沒有編輯權限"
                    : zones.length === 0
                      ? "庫位必須屬於庫區。請先建一個庫區再回來。"
                      : undefined
                }
              >
                ＋ 批次建庫位
              </button>
            </div>
          </div>

          {zones.length === 0 ? (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center space-y-2">
              <div className="text-[13px] font-medium text-[#2C2C2A]">此倉庫尚無庫區資料</div>
              {canEdit ? (
                <div className="text-[11.5px] text-[#9A9890]">
                  💡 倉庫採「<b className="text-[#5A5955]">庫區 → 庫位</b>」兩層結構，庫位必須先有所屬庫區。
                  <br />
                  請先點右上 <span className="px-1.5 py-0.5 rounded bg-[#F8F7F4] border border-[#EEECE6] text-[#5A5955]">＋ 庫區</span>　建立一個庫區（例：A 區 / B 區），再回來建立庫位。
                </div>
              ) : (
                <div className="text-[11.5px] text-[#9A9890]">沒有編輯權限</div>
              )}
            </div>
          ) : (
            zones.map((zone, idx) => (
              <details
                key={zone.id}
                open={idx === 0}
                className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden group"
              >
                <summary className="px-3.5 py-2 bg-[#F8F7F4] border-b border-[#EEECE6] flex items-center gap-2 cursor-pointer list-none">
                  <span className="text-[12px] font-semibold text-[#2C2C2A]">
                    {zone.code} 區 — {zone.name}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                    {zone.bins.length} 庫位
                  </span>
                  {zone.control_level !== "normal" ? (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] whitespace-nowrap ${
                      zone.control_level === "high_value"
                        ? "bg-[#EAF4FB] text-[#185FA5]"
                        : "bg-[#FDECEA] text-[#CC0000]"
                    }`}>
                      {CONTROL_LEVELS.find((c) => c.value === zone.control_level)?.label ?? zone.control_level}
                    </span>
                  ) : null}
                  {canEdit ? (
                    <span className="ml-auto flex gap-1 items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setModal({ kind: "zone-edit", zone });
                        }}
                        className="h-[22px] px-2 rounded text-[10.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        改
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setModal({ kind: "bin-create", zoneId: zone.id });
                        }}
                        className="h-[22px] px-2 rounded text-[10.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        ＋ 庫位
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setModal({ kind: "zone-delete", zone });
                        }}
                        className="h-[22px] px-2 rounded text-[10.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                      >
                        刪除
                      </button>
                    </span>
                  ) : (
                    <span className="ml-auto text-[11px] text-[#9A9890] group-open:rotate-90 transition-transform inline-block">
                      ▶
                    </span>
                  )}
                </summary>
                {zone.bins.length === 0 ? (
                  <div className="px-3.5 py-4 text-[11.5px] text-[#9A9890] text-center">
                    此庫區尚無庫位{canEdit ? "，點上方「＋ 庫位」或「＋ 批次建庫位」。" : ""}
                  </div>
                ) : (
                  <div className="px-3.5 py-2.5 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
                    {zone.bins.map((bin) => {
                      const status = binStatus(bin);
                      const palette = BIN_PALETTE[status];
                      return (
                        <button
                          key={bin.id}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setModal({ kind: "bin-edit", bin })}
                          className={`p-1.5 rounded border text-center ${palette.bg} ${palette.border} ${
                            canEdit ? "hover:ring-2 hover:ring-[#185FA5] cursor-pointer" : "cursor-default"
                          }`}
                          title={bin.name ?? bin.code}
                        >
                          <div
                            className={`font-mono text-[10.5px] font-semibold ${palette.text}`}
                          >
                            {bin.code}
                          </div>
                          <div className={`text-[10px] ${palette.subText}`}>
                            {palette.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </details>
            ))
          )}

          <div className="text-[11px] text-[#9A9890] px-1">
            💡 庫位狀態（已用 / 空 / 保留）由人工標記；點 cell 開 modal 切換。
          </div>
        </section>
      </div>

      {/* Modals */}
      {modal.kind === "zone-create" && activeWarehouse ? (
        <ZoneFormModal
          mode="create"
          warehouseId={activeWarehouse.id}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {modal.kind === "zone-edit" ? (
        <ZoneFormModal
          mode="edit"
          warehouseId={modal.zone.warehouse_id}
          initial={modal.zone}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {modal.kind === "zone-delete" ? (
        <ZoneDeleteModal
          zone={modal.zone}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {modal.kind === "bin-create" && activeWarehouse ? (
        <BinFormModal
          mode="create"
          warehouseId={activeWarehouse.id}
          zones={zones}
          defaultZoneId={modal.zoneId}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {modal.kind === "bin-batch" && activeWarehouse ? (
        <BinBatchModal
          warehouseId={activeWarehouse.id}
          zones={zones}
          defaultZoneId={modal.zoneId}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {modal.kind === "bin-edit" ? (
        <BinFormModal
          mode="edit"
          warehouseId={modal.bin.warehouse_id}
          zones={zones}
          initial={modal.bin}
          onClose={() => setModal({ kind: "none" })}
          onDone={(b) => {
            showBanner(b);
            if (b.ok) {
              setModal({ kind: "none" });
              refresh();
            }
          }}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
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

// ───── Modal primitives ──────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-[10vh] px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[480px] overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-[24px] w-[24px] rounded text-[14px] text-[#9A9890] hover:bg-[#EEECE6]"
            aria-label="關閉"
          >
            ✕
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "block text-[11px] text-[#9A9890] font-medium mb-1";

// ───── Zone Form Modal ───────────────────────────────────────────────────

function ZoneFormModal({
  mode,
  warehouseId,
  initial,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  mode: "create" | "edit";
  warehouseId: string;
  initial?: ZoneWithBins;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [controlLevel, setControlLevel] = useState<string>(initial?.control_level ?? "normal");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit() {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createZone({
              warehouseId,
              code,
              name,
              controlLevel: controlLevel as "normal" | "high_value" | "hazardous",
              notes: notes || undefined,
            })
          : await updateZone(initial!.id, {
              code,
              name,
              controlLevel,
              notes,
            });
      onDone({
        ok: res.ok,
        msg: res.ok ? (mode === "create" ? "✓ 已建立庫區" : "✓ 已更新庫區") : res.error,
      });
    });
  }

  return (
    <Modal title={mode === "create" ? "新增庫區" : `修改庫區：${initial?.code}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>庫區代碼 *</label>
          <input
            ref={firstRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="例：A、Z-A"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>庫區名稱 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="例：零件主區"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>管控等級</label>
          <select
            value={controlLevel}
            onChange={(e) => setControlLevel(e.target.value)}
            className={inputClass}
            disabled={isPending}
          >
            {CONTROL_LEVELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>備註</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? (mode === "create" ? "建立中⋯" : "儲存中⋯") : mode === "create" ? "建立" : "儲存變更"}
        </button>
      </div>
    </Modal>
  );
}

function ZoneDeleteModal({
  zone,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  zone: ZoneWithBins;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  function submit() {
    startTransition(async () => {
      const res = await deleteZone(zone.id);
      onDone({ ok: res.ok, msg: res.ok ? "✓ 已刪除庫區" : res.error });
    });
  }
  return (
    <Modal title={`刪除庫區：${zone.code}`} onClose={onClose}>
      <p className="text-[12.5px] text-[#2C2C2A] leading-relaxed">
        確定要刪除庫區 <span className="font-mono font-semibold">{zone.code}</span>（{zone.name}）？
      </p>
      <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#FAC775] rounded px-3 py-2 mt-2">
        ⚠️ 底下 <b>{zone.bins.length}</b> 個庫位會一併停用（軟刪除，DB 仍保留資料、之後可手動恢復）。
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-60"
        >
          {isPending ? "刪除中⋯" : "確認刪除"}
        </button>
      </div>
    </Modal>
  );
}

// ───── Bin Form Modal ────────────────────────────────────────────────────

function BinFormModal({
  mode,
  warehouseId,
  zones,
  initial,
  defaultZoneId,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  mode: "create" | "edit";
  warehouseId: string;
  zones: ZoneWithBins[];
  initial?: BinRow;
  defaultZoneId?: string;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [zoneId, setZoneId] = useState(initial?.zone_id ?? defaultZoneId ?? zones[0]?.id ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [capacity, setCapacity] = useState<string>(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [status, setStatus] = useState<BinStatus>(initial ? binStatus(initial) : "empty");
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit() {
    const cap = capacity === "" ? null : Number(capacity);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
      onDone({ ok: false, msg: "容量必須是 ≥ 0 的數字" });
      return;
    }
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createBin({
              warehouseId,
              zoneId,
              code,
              name: name || undefined,
              capacity: cap ?? undefined,
              status,
            })
          : await updateBin(initial!.id, {
              code,
              name,
              capacity: cap,
              status,
            });
      onDone({
        ok: res.ok,
        msg: res.ok ? (mode === "create" ? "✓ 已建立庫位" : "✓ 已更新庫位") : res.error,
      });
    });
  }

  function submitDelete() {
    if (!initial) return;
    startTransition(async () => {
      const res = await deleteBin(initial.id);
      onDone({ ok: res.ok, msg: res.ok ? "✓ 已刪除庫位" : res.error });
    });
  }

  return (
    <Modal title={mode === "create" ? "新增庫位" : `修改庫位：${initial?.code}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>所屬庫區 *</label>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className={inputClass}
            disabled={isPending || mode === "edit"}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} — {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>庫位代碼 *</label>
          <input
            ref={firstRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="例：A-01"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>庫位名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>容量</label>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={inputClass}
              placeholder="（選填）"
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BinStatus)}
              className={inputClass}
              disabled={isPending}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {mode === "edit" ? (
          <button
            type="button"
            onClick={submitDelete}
            disabled={isPending}
            className="mr-auto h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            刪除此庫位
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? (mode === "create" ? "建立中⋯" : "儲存中⋯") : mode === "create" ? "建立" : "儲存變更"}
        </button>
      </div>
    </Modal>
  );
}

// ───── Bin Batch Modal ───────────────────────────────────────────────────

function BinBatchModal({
  warehouseId,
  zones,
  defaultZoneId,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  warehouseId: string;
  zones: ZoneWithBins[];
  defaultZoneId?: string;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [zoneId, setZoneId] = useState(defaultZoneId ?? zones[0]?.id ?? "");
  const [prefix, setPrefix] = useState("A-");
  const [fromN, setFromN] = useState("1");
  const [toN, setToN] = useState("8");
  const [padding, setPadding] = useState("2");
  const [status, setStatus] = useState<BinStatus>("empty");
  const [capacity, setCapacity] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const from = Number(fromN);
  const to = Number(toN);
  const pad = Number(padding);
  const previewCount = Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from + 1 : 0;
  const preview =
    previewCount > 0
      ? `${prefix}${String(from).padStart(pad, "0")} ~ ${prefix}${String(to).padStart(pad, "0")}（${previewCount} 個）`
      : "—";

  function submit() {
    const cap = capacity === "" ? undefined : Number(capacity);
    if (cap !== undefined && (!Number.isFinite(cap) || cap < 0)) {
      onDone({ ok: false, msg: "容量必須是 ≥ 0 的數字" });
      return;
    }
    startTransition(async () => {
      const res = await createBinsBatch({
        warehouseId,
        zoneId,
        prefix,
        fromN: from,
        toN: to,
        padding: pad,
        capacity: cap,
        status,
      });
      onDone({
        ok: res.ok,
        msg: res.ok ? `✓ 已建立 ${res.data.created} 個庫位` : res.error,
      });
    });
  }

  return (
    <Modal title="批次建立庫位" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>所屬庫區 *</label>
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className={inputClass}
            disabled={isPending}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} — {z.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-2">
            <label className={labelClass}>代碼前綴</label>
            <input
              ref={firstRef}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="A-"
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>起號</label>
            <input
              type="number"
              min={0}
              value={fromN}
              onChange={(e) => setFromN(e.target.value)}
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>訖號</label>
            <input
              type="number"
              min={0}
              value={toN}
              onChange={(e) => setToN(e.target.value)}
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelClass}>數字位數</label>
            <input
              type="number"
              min={1}
              max={5}
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
              className={`${inputClass} font-mono`}
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>容量</label>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={inputClass}
              placeholder="（選填）"
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>預設狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BinStatus)}
              className={inputClass}
              disabled={isPending}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[11.5px] text-[#5A5955] bg-[#F8F7F4] border border-[#EEECE6] rounded px-3 py-2">
          將建立：<span className="font-mono text-[#1A3A5C] font-semibold">{preview}</span>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || previewCount === 0}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending ? "建立中⋯" : `建立 ${previewCount} 個`}
        </button>
      </div>
    </Modal>
  );
}
