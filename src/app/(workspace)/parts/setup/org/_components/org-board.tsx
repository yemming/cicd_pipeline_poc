"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  addRegion,
  addStore,
  addWarehouse,
  deleteRegion,
  deleteStore,
  deleteWarehouse,
  setRegionActive,
  setStoreActive,
  setWarehouseActive,
  updateRegion,
  updateStore,
  updateWarehouse,
} from "@/domain/org";
import type {
  OrgRow,
  SubsidiaryOption,
  WarehouseRow,
} from "@/domain/org";

const STORE_TYPE_OPTIONS = [
  { value: "direct", label: "直營" },
  { value: "dealer", label: "經銷" },
] as const;
const STORE_TYPE_LABEL = Object.fromEntries(STORE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const WAREHOUSE_TYPE_OPTIONS = [
  { value: "main", label: "主倉" },
  { value: "temporary", label: "臨時倉" },
  { value: "consignment", label: "寄存倉" },
  { value: "warranty", label: "保固倉" },
  { value: "transit", label: "在途倉" },
  { value: "quarantine", label: "隔離倉" },
  { value: "virtual", label: "虛擬倉" },
] as const;
const WAREHOUSE_TYPE_LABEL = Object.fromEntries(WAREHOUSE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

type Banner = { ok: boolean; msg: string } | null;

type Modal =
  | { kind: "none" }
  | { kind: "region-create" }
  | { kind: "region-edit"; row: OrgRow }
  | { kind: "region-delete"; row: OrgRow }
  | { kind: "store-create" }
  | { kind: "store-edit"; row: OrgRow }
  | { kind: "store-delete"; row: OrgRow }
  | { kind: "warehouse-create" }
  | { kind: "warehouse-edit"; row: WarehouseRow }
  | { kind: "warehouse-delete"; row: WarehouseRow };

export function OrgBoard({
  regions,
  stores,
  warehouses,
  subsidiaries,
  binCountsByWarehouseId,
  canEdit,
}: {
  regions: OrgRow[];
  stores: OrgRow[];
  warehouses: WarehouseRow[];
  subsidiaries: SubsidiaryOption[];
  binCountsByWarehouseId: Record<string, number>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modal, setModal] = useState<Modal>({ kind: "none" });
  const [banner, setBanner] = useState<Banner>(null);

  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) window.setTimeout(() => setBanner(null), 2200);
  }
  function refresh() {
    router.refresh();
  }
  function onDone(b: { ok: boolean; msg: string }) {
    showBanner(b);
    if (b.ok) {
      setModal({ kind: "none" });
      refresh();
    }
  }

  function countStoresOfRegion(id: string) {
    return stores.filter((s) => s.parent_id === id).length;
  }
  function countWarehousesOfRegion(id: string) {
    const storeIds = stores.filter((s) => s.parent_id === id).map((s) => s.id);
    return warehouses.filter((w) => w.org_id && storeIds.includes(w.org_id)).length;
  }
  function countWarehousesOfStore(id: string) {
    return warehouses.filter((w) => w.org_id === id).length;
  }

  function toggleActive(kind: "region" | "store" | "warehouse", id: string, current: boolean) {
    startTransition(async () => {
      const fn =
        kind === "region" ? setRegionActive : kind === "store" ? setStoreActive : setWarehouseActive;
      const res = await fn(id, !current);
      onDone({
        ok: res.ok,
        msg: res.ok ? (current ? "✓ 已停用" : "✓ 已啟用") : res.error,
      });
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織三層架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          銷售區域 → 門店 → 倉庫　三層組織結構（單頁管理）
        </span>
      </header>

      <div className="px-4 py-2.5 rounded-lg bg-[#EAF4FB] border border-[#B5D4F4] text-[12px] text-[#185FA5]">
        📋 組織架構為整個庫存管理系統的基礎，所有採購、入庫、出庫、調撥作業均依此三層結構進行權限控管與數據隔離。
      </div>

      <div className={`grid grid-cols-3 gap-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        {/* ─── Row 1, Col 1/3: Regions (簡單列表，非 table) ─────────────────── */}
        <section className="col-span-1 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <SectionHeader
            title="🗺 銷售區域（第一層）"
            subtitle={`${regions.length} 區`}
            actionLabel="＋ 新增區域"
            onAction={canEdit ? () => setModal({ kind: "region-create" }) : undefined}
          />
          {regions.length === 0 ? (
            <EmptyHint text={canEdit ? "尚無區域，點右上「＋ 新增區域」建立。" : "尚無區域。"} />
          ) : (
            <div>
              {regions.map((r) => (
                <div
                  key={r.id}
                  className="px-4 py-2.5 border-b border-[#EEECE6] last:border-b-0 flex items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-[#2C2C2A]">{r.name}</div>
                    {r.notes ? (
                      <div className="text-[11px] text-[#9A9890] mt-0.5 truncate">
                        涵蓋：{r.notes}
                      </div>
                    ) : (
                      <div className="font-mono text-[11px] text-[#9A9890] mt-0.5">{r.code}</div>
                    )}
                  </div>
                  <span className="text-[11px] text-[#9A9890] shrink-0">
                    {countStoresOfRegion(r.id)} 店 / {countWarehousesOfRegion(r.id)} 倉
                  </span>
                  <ActiveChip active={r.is_active} />
                  {canEdit ? (
                    <RowActions
                      onEdit={() => setModal({ kind: "region-edit", row: r })}
                      onToggleActive={() => toggleActive("region", r.id, r.is_active)}
                      isActive={r.is_active}
                      onDelete={() => setModal({ kind: "region-delete", row: r })}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── Row 1, Col 2/3: Stores table ────────────────────────────── */}
        <section className="col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <SectionHeader
            title="🏪 門店（第二層）"
            subtitle={`${stores.length} 店`}
            actionLabel="＋ 新增門店"
            onAction={canEdit && regions.length > 0 ? () => setModal({ kind: "store-create" }) : undefined}
            actionDisabledHint={regions.length === 0 ? "請先建立區域" : undefined}
          />
          {stores.length === 0 ? (
            <EmptyHint
              text={
                canEdit && regions.length > 0
                  ? "尚無門店，點右上「＋ 新增門店」建立。"
                  : "尚無門店。"
              }
            />
          ) : (
            <Table>
              <THead cols={["門店名稱", "所屬區域", "門店類型", "狀態", "操作"]} actionWidth={210} />
              <tbody>
                {stores.map((s) => {
                  const region = s.parent_id ? regionById.get(s.parent_id) : null;
                  const meta = (s.metadata ?? {}) as Record<string, unknown>;
                  const storeType = typeof meta.store_type === "string" ? meta.store_type : "direct";
                  return (
                    <tr key={s.id} className="border-t border-[#EEECE6]">
                      <td className="px-4 py-2 text-[12.5px]">
                        <div className="font-medium text-[#2C2C2A]">{s.name}</div>
                        <div className="font-mono text-[11px] text-[#9A9890]">{s.code}</div>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-[#5A5955]">
                        {region?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C] whitespace-nowrap">
                          {STORE_TYPE_LABEL[storeType] ?? storeType}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <ActiveChip active={s.is_active} />
                      </td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <RowActions
                            onEdit={() => setModal({ kind: "store-edit", row: s })}
                            onToggleActive={() => toggleActive("store", s.id, s.is_active)}
                            isActive={s.is_active}
                            onDelete={() => setModal({ kind: "store-delete", row: s })}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>

        {/* ─── Row 2: Warehouses table (full width col-span-3) ────────── */}
        <section className="col-span-3 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <SectionHeader
            title="🏗 倉庫（第三層）"
            subtitle={`${warehouses.length} 倉`}
            rightCaption="每間門店可設定多個倉庫，各自獨立管理庫存"
            actionLabel="＋ 新增倉庫"
            onAction={canEdit && stores.length > 0 ? () => setModal({ kind: "warehouse-create" }) : undefined}
            actionDisabledHint={stores.length === 0 ? "請先建立門店" : undefined}
          />
          {warehouses.length === 0 ? (
            <EmptyHint
              text={
                canEdit && stores.length > 0
                  ? "尚無倉庫，點右上「＋ 新增倉庫」建立。"
                  : "尚無倉庫。"
              }
            />
          ) : (
            <Table>
              <THead
                cols={["倉庫名稱", "所屬門店", "倉庫類型", "庫位數", "狀態", "操作"]}
                actionWidth={290}
              />
              <tbody>
                {warehouses.map((w) => {
                  const store = w.org_id ? storeById.get(w.org_id) : null;
                  const binCount = binCountsByWarehouseId[w.id] ?? 0;
                  return (
                    <tr key={w.id} className="border-t border-[#EEECE6]">
                      <td className="px-4 py-2 text-[12.5px]">
                        <div className="font-medium text-[#2C2C2A]">{w.name}</div>
                        <div className="font-mono text-[11px] text-[#9A9890]">{w.code}</div>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-[#5A5955]">
                        {store?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C] whitespace-nowrap">
                          {WAREHOUSE_TYPE_LABEL[w.type ?? "main"] ?? w.type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[12.5px] font-mono text-[#2C2C2A]">
                        {binCount}
                      </td>
                      <td className="px-4 py-2">
                        <ActiveChip active={w.is_active} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1.5">
                          <Link
                            href={`/parts/setup/warehouse-bins?w=${w.id}`}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] inline-flex items-center"
                          >
                            設定庫位
                          </Link>
                          {canEdit ? (
                            <RowActions
                              onEdit={() => setModal({ kind: "warehouse-edit", row: w })}
                              onToggleActive={() => toggleActive("warehouse", w.id, w.is_active)}
                              isActive={w.is_active}
                              onDelete={() => setModal({ kind: "warehouse-delete", row: w })}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
      </div>

      {/* ───── Modals ──────────────────────────────────────────────────── */}

      {modal.kind === "region-create" ? (
        <RegionFormModal
          mode="create"
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "region-edit" ? (
        <RegionFormModal
          mode="edit"
          initial={modal.row}
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "region-delete" ? (
        <DeleteConfirmModal
          title={`刪除區域：${modal.row.code ?? modal.row.id}`}
          target={modal.row.name ?? ""}
          warning={`⚠️ 底下 ${countStoresOfRegion(modal.row.id)} 個門店 + ${countWarehousesOfRegion(modal.row.id)} 個倉庫會一併停用（軟刪除）。`}
          onClose={() => setModal({ kind: "none" })}
          onConfirm={() =>
            startTransition(async () => {
              const res = await deleteRegion(modal.row.id);
              onDone({ ok: res.ok, msg: res.ok ? "✓ 已刪除區域（含底下門店 / 倉庫）" : res.error });
            })
          }
          isPending={isPending}
        />
      ) : null}

      {modal.kind === "store-create" ? (
        <StoreFormModal
          mode="create"
          regions={regions}
          subsidiaries={subsidiaries}
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "store-edit" ? (
        <StoreFormModal
          mode="edit"
          initial={modal.row}
          regions={regions}
          subsidiaries={subsidiaries}
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "store-delete" ? (
        <DeleteConfirmModal
          title={`刪除門店：${modal.row.code ?? modal.row.id}`}
          target={modal.row.name ?? ""}
          warning={`⚠️ 底下 ${countWarehousesOfStore(modal.row.id)} 個倉庫會一併停用（軟刪除）。`}
          onClose={() => setModal({ kind: "none" })}
          onConfirm={() =>
            startTransition(async () => {
              const res = await deleteStore(modal.row.id);
              onDone({ ok: res.ok, msg: res.ok ? "✓ 已刪除門店（含底下倉庫）" : res.error });
            })
          }
          isPending={isPending}
        />
      ) : null}

      {modal.kind === "warehouse-create" ? (
        <WarehouseFormModal
          mode="create"
          stores={stores}
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "warehouse-edit" ? (
        <WarehouseFormModal
          mode="edit"
          initial={modal.row}
          stores={stores}
          onClose={() => setModal({ kind: "none" })}
          onDone={onDone}
          isPending={isPending}
          startTransition={startTransition}
        />
      ) : null}
      {modal.kind === "warehouse-delete" ? (
        <DeleteConfirmModal
          title={`刪除倉庫：${modal.row.code ?? modal.row.id}`}
          target={modal.row.name ?? ""}
          warning="⚠️ 倉庫將設為停用（軟刪除，DB 仍保留資料）。"
          onClose={() => setModal({ kind: "none" })}
          onConfirm={() =>
            startTransition(async () => {
              const res = await deleteWarehouse(modal.row.id);
              onDone({ ok: res.ok, msg: res.ok ? "✓ 已刪除倉庫" : res.error });
            })
          }
          isPending={isPending}
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

// ───── Section primitives ───────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
  rightCaption,
  actionLabel,
  actionDisabledHint,
  onAction,
}: {
  title: string;
  subtitle?: string;
  rightCaption?: string;
  actionLabel: string;
  actionDisabledHint?: string;
  onAction?: () => void;
}) {
  return (
    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
        {subtitle ? (
          <div className="text-[11px] text-[#9A9890] mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {rightCaption ? (
        <span className="text-[11px] text-[#9A9890] ml-3 hidden md:inline">{rightCaption}</span>
      ) : null}
      <div className="ml-auto">
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            {actionLabel}
          </button>
        ) : actionDisabledHint ? (
          <button
            type="button"
            disabled
            title={actionDisabledHint}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-50 cursor-not-allowed"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">{children}</table>
    </div>
  );
}

function THead({ cols, actionWidth }: { cols: string[]; actionWidth?: number }) {
  return (
    <thead>
      <tr className="text-left text-[11px] text-[#9A9890] bg-[#F8F7F4]">
        {cols.map((c, i) => (
          <th
            key={c}
            className="font-medium px-4 py-2 whitespace-nowrap"
            style={i === cols.length - 1 && actionWidth ? { width: actionWidth } : undefined}
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="px-4 py-10 text-[11.5px] text-[#9A9890] text-center">{text}</div>
  );
}

function ActiveChip({ active }: { active: boolean }) {
  return active ? (
    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
      啟用
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
      停用
    </span>
  );
}

function RowActions({
  onEdit,
  onToggleActive,
  isActive,
  onDelete,
}: {
  onEdit: () => void;
  onToggleActive: () => void;
  isActive: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-1.5 shrink-0">
      <button
        type="button"
        onClick={onEdit}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      >
        編輯
      </button>
      <button
        type="button"
        onClick={onToggleActive}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      >
        {isActive ? "停用" : "啟用"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
      >
        刪除
      </button>
    </div>
  );
}

// ───── Modal primitives ──────────────────────────────────────────────────

const inputClass =
  "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "block text-[11px] text-[#9A9890] font-medium mb-1";

function Modal({
  title,
  onClose,
  size = "md",
  children,
}: {
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const maxW = size === "lg" ? "max-w-[640px]" : size === "sm" ? "max-w-[420px]" : "max-w-[520px]";
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-[8vh] px-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${maxW} overflow-hidden`}>
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

function DeleteConfirmModal({
  title,
  target,
  warning,
  onClose,
  onConfirm,
  isPending,
}: {
  title: string;
  target: string;
  warning: string;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <p className="text-[12.5px] text-[#2C2C2A] leading-relaxed">
        確定要刪除 <span className="font-semibold">{target}</span>？
      </p>
      <p className="text-[12px] text-[#854F0B] bg-[#FDF3E3] border border-[#FAC775] rounded px-3 py-2 mt-2">
        {warning}
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
          onClick={onConfirm}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-60"
        >
          {isPending ? "刪除中⋯" : "確認刪除"}
        </button>
      </div>
    </Modal>
  );
}

// ───── Region Form Modal ─────────────────────────────────────────────────

function RegionFormModal({
  mode,
  initial,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  mode: "create" | "edit";
  initial?: OrgRow;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit() {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await addRegion({ code, name, notes: notes || null })
          : await updateRegion(initial!.id, { code, name, notes, is_active: isActive });
      onDone({
        ok: res.ok,
        msg: res.ok ? (mode === "create" ? "✓ 已建立區域" : "✓ 已更新區域") : res.error,
      });
    });
  }

  return (
    <Modal title={mode === "create" ? "新增銷售區域" : `修改區域：${initial?.code}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div>
          <label className={labelClass}>區域代碼 *</label>
          <input
            ref={firstRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="例：R-N、TPE"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>區域名稱 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="例：北區"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>涵蓋範圍 / 備註</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
            placeholder="例：基北宜花"
            disabled={isPending}
          />
        </div>
        {mode === "edit" ? (
          <label className="flex items-center gap-2 text-[12.5px] text-[#5A5955] cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isPending}
            />
            啟用
          </label>
        ) : null}
      </div>
      <FormActions onClose={onClose} onSubmit={submit} mode={mode} isPending={isPending} />
    </Modal>
  );
}

// ───── Store Form Modal ──────────────────────────────────────────────────

function StoreFormModal({
  mode,
  initial,
  regions,
  subsidiaries,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  mode: "create" | "edit";
  initial?: OrgRow;
  regions: OrgRow[];
  subsidiaries: SubsidiaryOption[];
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const initialMeta = (initial?.metadata ?? {}) as Record<string, unknown>;
  const initSubsidiary = typeof initialMeta.subsidiary_id === "string" ? initialMeta.subsidiary_id : "";
  const initStoreType = typeof initialMeta.store_type === "string" ? initialMeta.store_type : "direct";

  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [selectedRegion, setSelectedRegion] = useState(initial?.parent_id ?? regions[0]?.id ?? "");
  const [subsidiaryId, setSubsidiaryId] = useState(initSubsidiary);
  const [storeType, setStoreType] = useState(initStoreType);
  const [shortName, setShortName] = useState(
    typeof initialMeta.short_name === "string" ? (initialMeta.short_name as string) : "",
  );
  const [address, setAddress] = useState(
    typeof initialMeta.address === "string" ? (initialMeta.address as string) : "",
  );
  const [phone, setPhone] = useState(
    typeof initialMeta.phone === "string" ? (initialMeta.phone as string) : "",
  );
  const [responsiblePerson, setResponsiblePerson] = useState(
    typeof initialMeta.responsible_person === "string"
      ? (initialMeta.responsible_person as string)
      : "",
  );
  const [bankAccount, setBankAccount] = useState(
    typeof initialMeta.bank_account === "string" ? (initialMeta.bank_account as string) : "",
  );
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit() {
    if (!subsidiaryId) {
      onDone({ ok: false, msg: "請選擇所屬法人" });
      return;
    }
    startTransition(async () => {
      const res =
        mode === "create"
          ? await addStore({
              code,
              name,
              region_id: selectedRegion,
              subsidiary_id: subsidiaryId,
              store_type: storeType as "direct" | "dealer",
              short_name: shortName || null,
              address: address || null,
              phone: phone || null,
              responsible_person: responsiblePerson || null,
              bank_account: bankAccount || null,
            })
          : await updateStore(initial!.id, {
              code,
              name,
              region_id: selectedRegion,
              subsidiary_id: subsidiaryId,
              store_type: storeType as "direct" | "dealer",
              short_name: shortName || null,
              address: address || null,
              phone: phone || null,
              responsible_person: responsiblePerson || null,
              bank_account: bankAccount || null,
              is_active: isActive,
            });
      onDone({
        ok: res.ok,
        msg: res.ok ? (mode === "create" ? "✓ 已建立門店" : "✓ 已更新門店") : res.error,
      });
    });
  }

  return (
    <Modal title={mode === "create" ? "新增門店" : `修改門店：${initial?.code}`} onClose={onClose} size="lg">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>所屬區域 *</label>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className={inputClass}
            disabled={isPending}
          >
            <option value="">— 選擇 —</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>所屬法人 *</label>
          <select
            value={subsidiaryId}
            onChange={(e) => setSubsidiaryId(e.target.value)}
            className={inputClass}
            disabled={isPending}
          >
            <option value="">— 選擇 —</option>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_name ?? s.legal_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>門店代碼 *</label>
          <input
            ref={firstRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="例：TPE-001"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>門店名稱 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="例：台北旗艦店"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>類型</label>
          <select
            value={storeType}
            onChange={(e) => setStoreType(e.target.value)}
            className={inputClass}
            disabled={isPending}
          >
            {STORE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>簡稱</label>
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>地址</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>電話</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>負責人</label>
          <input
            value={responsiblePerson}
            onChange={(e) => setResponsiblePerson(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>銀行帳戶</label>
          <input
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
        </div>
        {mode === "edit" ? (
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] text-[#5A5955] cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isPending}
            />
            啟用
          </label>
        ) : null}
      </div>
      <FormActions onClose={onClose} onSubmit={submit} mode={mode} isPending={isPending} />
    </Modal>
  );
}

// ───── Warehouse Form Modal ──────────────────────────────────────────────

function WarehouseFormModal({
  mode,
  initial,
  stores,
  onClose,
  onDone,
  isPending,
  startTransition,
}: {
  mode: "create" | "edit";
  initial?: WarehouseRow;
  stores: OrgRow[];
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [orgId, setOrgId] = useState(initial?.org_id ?? stores[0]?.id ?? "");
  const [type, setType] = useState(initial?.type ?? "main");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  function submit() {
    startTransition(async () => {
      const res =
        mode === "create"
          ? await addWarehouse({
              code,
              name,
              org_id: orgId,
              type: type as "main",
              address: address || null,
              notes: notes || null,
            })
          : await updateWarehouse(initial!.id, {
              code,
              name,
              org_id: orgId,
              type: type as "main",
              address: address || null,
              notes: notes || null,
              is_active: isActive,
            });
      onDone({
        ok: res.ok,
        msg: res.ok ? (mode === "create" ? "✓ 已建立倉庫" : "✓ 已更新倉庫") : res.error,
      });
    });
  }

  return (
    <Modal title={mode === "create" ? "新增倉庫" : `修改倉庫：${initial?.code}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={labelClass}>所屬門店 *</label>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className={inputClass}
            disabled={isPending || mode === "edit"}
          >
            <option value="">— 選擇 —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>倉庫代碼 *</label>
            <input
              ref={firstRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="例：WH-001"
              disabled={isPending}
            />
          </div>
          <div>
            <label className={labelClass}>類型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
              disabled={isPending}
            >
              {WAREHOUSE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>倉庫名稱 *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="例：主零件倉"
            disabled={isPending}
          />
        </div>
        <div>
          <label className={labelClass}>地址</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            placeholder="（選填）"
            disabled={isPending}
          />
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
        {mode === "edit" ? (
          <label className="flex items-center gap-2 text-[12.5px] text-[#5A5955] cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isPending}
            />
            啟用
          </label>
        ) : null}
      </div>
      <FormActions onClose={onClose} onSubmit={submit} mode={mode} isPending={isPending} />
    </Modal>
  );
}

function FormActions({
  onClose,
  onSubmit,
  mode,
  isPending,
}: {
  onClose: () => void;
  onSubmit: () => void;
  mode: "create" | "edit";
  isPending: boolean;
}) {
  return (
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
        onClick={onSubmit}
        disabled={isPending}
        className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
      >
        {isPending ? (mode === "create" ? "建立中⋯" : "儲存中⋯") : mode === "create" ? "建立" : "儲存變更"}
      </button>
    </div>
  );
}
