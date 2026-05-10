"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

import {
  addWarehouse,
  updateWarehouse,
  setWarehouseActive,
  deleteWarehouse,
  type WarehouseRow,
  type AddWarehouseInput,
  type StoreOption,
  type WarehouseType,
} from "@/domain/org";

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const TYPE_LABELS: Record<string, string> = {
  main: "主倉",
  temporary: "臨時倉",
  consignment: "寄存倉",
  warranty: "保固倉",
  transit: "在途倉",
  quarantine: "隔離倉",
  virtual: "虛擬倉",
};

export function WarehousesBoard({
  rows,
  stores,
  canEdit,
  filterQ,
  filterStatus,
  filterOrg,
  loadError,
  autoOpenCreate,
}: {
  rows: WarehouseRow[];
  stores: StoreOption[];
  canEdit: boolean;
  filterQ: string;
  filterStatus: string;
  filterOrg: string;
  loadError: string | null;
  autoOpenCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>(autoOpenCreate ? { kind: "create" } : { kind: "closed" });
  const [q, setQ] = useState(filterQ);
  const [status, setStatus] = useState(filterStatus);
  const [orgId, setOrgId] = useState(filterOrg);

  const editingRow = useMemo(
    () => (formMode.kind === "edit" ? rows.find((r) => r.id === formMode.id) ?? null : null),
    [formMode, rows],
  );
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (orgId !== "all") params.set("org_id", orgId);
    startTransition(() => router.push(`/parts/setup/warehouses${params.toString() ? `?${params.toString()}` : ""}`));
  }
  function resetFilters() {
    setQ(""); setStatus("all"); setOrgId("all");
    startTransition(() => router.push("/parts/setup/warehouses"));
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">倉庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">1.1</span>
        <span className="text-[12px] text-[#9A9890]">組織三層的第三層 — 倉庫管理</span>
      </header>

      {loadError && (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      )}

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input className={inputClass} style={{ width: 200 }} placeholder="代碼 / 名稱" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>所屬門店</label>
            <select className={inputClass} style={{ width: 180 }} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="all">全部</option>
              {stores.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={applyFilters} disabled={pending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60">{pending ? "查詢中⋯" : "查詢"}</button>
            <button type="button" onClick={resetFilters} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">重置</button>
            {canEdit && (
              <button type="button" onClick={() => setFormMode({ kind: "create" })} disabled={pending} className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50">＋ 新增倉庫</button>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆</span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">代碼</th>
              <th className="text-left font-medium py-2 px-3">名稱</th>
              <th className="text-left font-medium py-2 px-3">所屬門店</th>
              <th className="text-left font-medium py-2 px-3">類型</th>
              <th className="text-left font-medium py-2 px-3">狀態</th>
              <th className="text-right font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-[#9A9890]">尚無倉庫，請新增。</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                <td className="py-2 px-3 font-mono">
                  <Link href={`/parts/setup/warehouses/${r.id}`} className="text-[#185FA5] hover:underline">{r.code}</Link>
                </td>
                <td className="py-2 px-3 text-[12.5px]">{r.name}</td>
                <td className="py-2 px-3 text-[12px] text-[#5A5955]">
                  {r.org_id ? storeMap.get(r.org_id)?.name ?? "—" : "—"}
                </td>
                <td className="py-2 px-3">
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{TYPE_LABELS[r.type] ?? r.type}</span>
                </td>
                <td className="py-2 px-3">
                  {r.is_active ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right">
                  {canEdit && (
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => setFormMode({ kind: "edit", id: r.id })} disabled={pending} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">編輯</button>
                      <button onClick={() => {
                        startTransition(async () => {
                          const res = await setWarehouseActive(r.id, !r.is_active);
                          if (res.ok) { showBanner(true, r.is_active ? "✓ 已停用" : "✓ 已啟用"); router.refresh(); }
                          else showBanner(false, res.error);
                        });
                      }} disabled={pending} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">{r.is_active ? "停用" : "啟用"}</button>
                      <button onClick={() => {
                        if (!confirm(`確定刪除倉庫「${r.name}」？`)) return;
                        startTransition(async () => {
                          const res = await deleteWarehouse(r.id);
                          if (res.ok) { showBanner(true, "✓ 已刪除"); router.refresh(); }
                          else showBanner(false, res.error);
                        });
                      }} disabled={pending} className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50">刪除</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {formMode.kind !== "closed" && (
        <WarehouseFormModal
          mode={formMode}
          initial={editingRow}
          stores={stores}
          onClose={() => setFormMode({ kind: "closed" })}
          onSuccess={(msg) => { showBanner(true, msg); setFormMode({ kind: "closed" }); router.refresh(); }}
          onError={(msg) => showBanner(false, msg)}
        />
      )}

      {banner && (
        <div className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
          banner.ok
            ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
            : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
        }`}>
          {banner.msg}
        </div>
      )}
    </main>
  );
}

function WarehouseFormModal({
  mode,
  initial,
  stores,
  onClose,
  onSuccess,
  onError,
}: {
  mode: FormMode;
  initial: WarehouseRow | null;
  stores: StoreOption[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = mode.kind === "edit";
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [orgId, setOrgId] = useState(initial?.org_id ?? stores[0]?.id ?? "");
  const [type, setType] = useState<WarehouseType>((initial?.type as WarehouseType) ?? "main");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const input: AddWarehouseInput = {
        code: code.trim(),
        name: name.trim(),
        org_id: orgId,
        type,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      };
      const res = isEdit
        ? await updateWarehouse((mode as { kind: "edit"; id: string }).id, input)
        : await addWarehouse(input);
      if (res.ok) onSuccess(isEdit ? "✓ 已更新" : "✓ 已建立");
      else onError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg w-[560px] max-w-[90vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{isEdit ? "編輯倉庫" : "新增倉庫"}</h2>
          <button onClick={onClose} className="text-[#9A9890] hover:text-[#5A5955] text-[20px] leading-none">×</button>
        </header>
        <div className={`px-5 py-4 grid grid-cols-2 gap-3 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫代碼 *</label>
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WH-MAIN" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫名稱 *</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="主零件倉" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>所屬門店 *</label>
            <select className={inputClass} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {stores.length === 0 && <option value="">請先建立門店</option>}
              {stores.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫類型</label>
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as WarehouseType)}>
              {(Object.keys(TYPE_LABELS) as WarehouseType[]).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>地址</label>
            <input className={inputClass} value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>備註</label>
            <input className={inputClass} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">取消</button>
          <button onClick={submit} disabled={pending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60">
            {pending ? (isEdit ? "更新中⋯" : "建立中⋯") : isEdit ? "儲存" : "建立"}
          </button>
        </footer>
      </div>
    </div>
  );
}
