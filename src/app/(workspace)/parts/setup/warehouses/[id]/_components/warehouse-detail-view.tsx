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
  type StoreOption,
  type WarehouseType,
} from "@/domain/org";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-full";
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

export function WarehouseDetailView({
  warehouse,
  stores,
  canEdit,
  initialMode,
}: {
  warehouse: WarehouseRow | null;
  stores: StoreOption[];
  canEdit: boolean;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState(warehouse?.code ?? "");
  const [name, setName] = useState(warehouse?.name ?? "");
  const [orgId, setOrgId] = useState(warehouse?.org_id ?? stores[0]?.id ?? "");
  const [type, setType] = useState<WarehouseType>((warehouse?.type as WarehouseType) ?? "main");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [notes, setNotes] = useState(warehouse?.notes ?? "");

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function resetForm(w: WarehouseRow | null) {
    setCode(w?.code ?? "");
    setName(w?.name ?? "");
    setOrgId(w?.org_id ?? stores[0]?.id ?? "");
    setType((w?.type as WarehouseType) ?? "main");
    setAddress(w?.address ?? "");
    setNotes(w?.notes ?? "");
  }

  function save() {
    startTransition(async () => {
      const input = {
        code: code.trim(),
        name: name.trim(),
        org_id: orgId,
        type,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
      };
      if (mode === "create") {
        const res = await addWarehouse(input);
        if (res.ok) { showBanner(true, "✓ 已建立"); router.push(`/parts/setup/warehouses/${res.data.id}`); }
        else showBanner(false, res.error);
      } else if (mode === "edit" && warehouse) {
        const res = await updateWarehouse(warehouse.id, input);
        if (res.ok) { showBanner(true, "✓ 已更新"); setMode("view"); router.refresh(); }
        else showBanner(false, res.error);
      }
    });
  }

  function toggleActive() {
    if (!warehouse) return;
    startTransition(async () => {
      const res = await setWarehouseActive(warehouse.id, !warehouse.is_active);
      if (res.ok) { showBanner(true, warehouse.is_active ? "✓ 已停用" : "✓ 已啟用"); router.refresh(); }
      else showBanner(false, res.error);
    });
  }

  function doDelete() {
    if (!warehouse) return;
    if (!confirm(`確定刪除倉庫「${warehouse.name}」？`)) return;
    startTransition(async () => {
      const res = await deleteWarehouse(warehouse.id);
      if (res.ok) { showBanner(true, "✓ 已刪除"); router.push("/parts/setup/warehouses"); }
      else showBanner(false, res.error);
    });
  }

  const storeLabel = warehouse?.org_id ? storeMap.get(warehouse.org_id)?.name ?? "—" : "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/warehouses" className="hover:text-[#185FA5]">倉庫</Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{mode === "create" ? "新增倉庫" : warehouse?.code}</span>
          {mode === "edit" && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">編輯模式</span>}
          {mode === "create" && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">建立模式</span>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && warehouse && (
            <>
              <Link href="/parts/setup/warehouses" className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center">返回列表</Link>
              {canEdit && (
                <>
                  <Link href="/parts/setup/warehouses/new" className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm flex items-center">新增</Link>
                  <button onClick={() => { resetForm(warehouse); setMode("edit"); }} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50">修改</button>
                  <button onClick={doDelete} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50">刪除</button>
                  <button onClick={toggleActive} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50">{warehouse.is_active ? "停用" : "啟用"}</button>
                </>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button onClick={() => { resetForm(warehouse); setMode("view"); }} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm">取消</button>
              <button onClick={save} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">{pending ? "儲存中⋯" : "儲存變更"}</button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link href="/parts/setup/warehouses" className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center">取消</Link>
              <button onClick={save} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">{pending ? "建立中⋯" : "建立並開啟"}</button>
            </>
          )}
        </div>
      </div>

      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">倉庫</div>
        {mode === "view" && warehouse ? (
          <>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{warehouse.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{warehouse.code}</span>
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{TYPE_LABELS[warehouse.type] ?? warehouse.type}</span>
              {warehouse.is_active ? (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
              )}
            </div>
          </>
        ) : (
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
            {mode === "create" ? "（未命名倉庫）" : "編輯中：" + (warehouse?.name ?? "")}
          </h1>
        )}
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {mode === "view" && warehouse ? (
            <>
              <Kv label="倉庫代碼" value={warehouse.code} mono />
              <Kv label="倉庫名稱" value={warehouse.name} />
              <Kv label="倉庫類型" value={TYPE_LABELS[warehouse.type] ?? warehouse.type} />
              <Kv label="所屬門店" value={storeLabel} />
              <Kv label="狀態" value={warehouse.is_active ? "啟用" : "停用"} />
              <div />
              <div className="md:col-span-3"><Kv label="地址" value={warehouse.address ?? "—"} /></div>
              <div className="md:col-span-3"><Kv label="備註" value={warehouse.notes ?? "—"} /></div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>倉庫代碼 *</label>
                <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WH-MAIN" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>倉庫名稱 *</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="主零件倉" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>倉庫類型</label>
                <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as WarehouseType)}>
                  {(Object.keys(TYPE_LABELS) as WarehouseType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3 flex flex-col gap-1">
                <label className={labelClass}>所屬門店 *</label>
                <select className={inputClass} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                  {stores.length === 0 && <option value="">請先建立門店</option>}
                  {stores.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              <div className="md:col-span-3 flex flex-col gap-1">
                <label className={labelClass}>地址</label>
                <input className={inputClass} value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="md:col-span-3 flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <input className={inputClass} value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </section>

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

function Kv({ label, value, mono }: { label: string; value: string | number | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}
