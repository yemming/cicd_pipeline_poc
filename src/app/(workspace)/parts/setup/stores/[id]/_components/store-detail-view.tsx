"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

import {
  addStore,
  updateStore,
  setStoreActive,
  deleteStore,
  type OrgRow,
  type WarehouseRow,
  type RegionOption,
  type SubsidiaryOption,
  type StoreType,
} from "@/domain/org";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;
type Tab = "basic" | "warehouses";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function StoreDetailView({
  store,
  warehouses,
  regions,
  subsidiaries,
  canEdit,
  initialMode,
}: {
  store: OrgRow | null;
  warehouses: WarehouseRow[];
  regions: RegionOption[];
  subsidiaries: SubsidiaryOption[];
  canEdit: boolean;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("basic");

  const [code, setCode] = useState(store?.code ?? "");
  const [name, setName] = useState(store?.name ?? "");
  const [regionId, setRegionId] = useState(store?.parent_id ?? regions[0]?.id ?? "");
  const [subsidiaryId, setSubsidiaryId] = useState(store?.subsidiary_id ?? subsidiaries[0]?.id ?? "");
  const [storeType, setStoreType] = useState<StoreType>((store?.store_type as StoreType) ?? "direct");
  const [shortName, setShortName] = useState(store?.short_name ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");

  const regionMap = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const subMap = useMemo(() => new Map(subsidiaries.map((s) => [s.id, s])), [subsidiaries]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function resetForm(s: OrgRow | null) {
    setCode(s?.code ?? "");
    setName(s?.name ?? "");
    setRegionId(s?.parent_id ?? regions[0]?.id ?? "");
    setSubsidiaryId(s?.subsidiary_id ?? subsidiaries[0]?.id ?? "");
    setStoreType((s?.store_type as StoreType) ?? "direct");
    setShortName(s?.short_name ?? "");
    setAddress(s?.address ?? "");
    setPhone(s?.phone ?? "");
  }

  function save() {
    startTransition(async () => {
      const input = {
        code: code.trim(),
        name: name.trim(),
        region_id: regionId,
        subsidiary_id: subsidiaryId,
        store_type: storeType,
        short_name: shortName?.trim() || null,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
      };
      if (mode === "create") {
        const res = await addStore(input);
        if (res.ok) {
          showBanner(true, "✓ 已建立");
          router.push(`/parts/setup/stores/${res.data.id}`);
        } else showBanner(false, res.error);
      } else if (mode === "edit" && store) {
        const res = await updateStore(store.id, input);
        if (res.ok) {
          showBanner(true, "✓ 已更新");
          setMode("view");
          router.refresh();
        } else showBanner(false, res.error);
      }
    });
  }

  function toggleActive() {
    if (!store) return;
    startTransition(async () => {
      const res = await setStoreActive(store.id, !store.is_active);
      if (res.ok) { showBanner(true, store.is_active ? "✓ 已停用" : "✓ 已啟用"); router.refresh(); }
      else showBanner(false, res.error);
    });
  }

  function doDelete() {
    if (!store) return;
    if (!confirm(`確定刪除門店「${store.name}」？`)) return;
    startTransition(async () => {
      const res = await deleteStore(store.id);
      if (res.ok) { showBanner(true, "✓ 已刪除"); router.push("/parts/setup/stores"); }
      else showBanner(false, res.error);
    });
  }

  const regionLabel = store?.parent_id ? regionMap.get(store.parent_id)?.name ?? "—" : "—";
  const subLabel = store?.subsidiary_id
    ? `${subMap.get(store.subsidiary_id)?.short_name ?? subMap.get(store.subsidiary_id)?.legal_name ?? "—"}（${subMap.get(store.subsidiary_id)?.tax_id ?? "—"}）`
    : "—";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/stores" className="hover:text-[#185FA5]">門店</Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{mode === "create" ? "新增門店" : store?.code}</span>
          {mode === "edit" && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">編輯模式</span>}
          {mode === "create" && <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">建立模式</span>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && store && (
            <>
              <Link href="/parts/setup/stores" className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center">返回列表</Link>
              {canEdit && (
                <>
                  <Link href="/parts/setup/stores/new" className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm flex items-center">新增</Link>
                  <button onClick={() => { resetForm(store); setMode("edit"); }} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50">修改</button>
                  <button onClick={doDelete} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50">刪除</button>
                  <button onClick={toggleActive} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50">{store.is_active ? "停用" : "啟用"}</button>
                </>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button onClick={() => { resetForm(store); setMode("view"); }} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm">取消</button>
              <button onClick={save} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">{pending ? "儲存中⋯" : "儲存變更"}</button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link href="/parts/setup/stores" className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center">取消</Link>
              <button onClick={save} disabled={pending} className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60">{pending ? "建立中⋯" : "建立並開啟"}</button>
            </>
          )}
        </div>
      </div>

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">門店</div>
        {mode === "view" && store ? (
          <>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{store.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{store.code}</span>
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{store.store_type === "dealer" ? "經銷" : "直營"}</span>
              {store.is_active ? (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
              )}
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">{warehouses.length} 個倉庫</span>
            </div>
          </>
        ) : (
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
            {mode === "create" ? "（未命名門店）" : "編輯中：" + (store?.name ?? "")}
          </h1>
        )}
      </header>

      {/* Tabs（view / edit 顯示；create mode 隱藏 tabs） */}
      {mode !== "create" && (
        <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
          <div className="flex border-b border-[#EEECE6]">
            <button
              onClick={() => setTab("basic")}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] ${
                tab === "basic"
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              基本資料
            </button>
            <button
              onClick={() => setTab("warehouses")}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap ${
                tab === "warehouses"
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              倉庫（{warehouses.length}）
            </button>
          </div>
        </div>
      )}

      {(mode === "create" || tab === "basic") && (
        <section className={`bg-white border border-[#EEECE6] ${mode === "create" ? "rounded-lg" : "rounded-b-lg border-t-0"} overflow-hidden`}>
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            {mode === "view" && store ? (
              <>
                <Kv label="門店代碼" value={store.code} mono />
                <Kv label="門店名稱" value={store.name} />
                <Kv label="簡稱" value={store.short_name ?? "—"} />
                <Kv label="所屬區域" value={regionLabel} />
                <Kv label="所屬法人" value={subLabel} />
                <Kv label="門店類型" value={store.store_type === "dealer" ? "經銷" : "直營"} />
                <div className="md:col-span-3"><Kv label="地址" value={store.address ?? "—"} /></div>
                <Kv label="電話" value={store.phone ?? "—"} />
                <Kv label="狀態" value={store.is_active ? "啟用" : "停用"} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>門店代碼 *</label>
                  <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="STORE-NEIHU" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>門店名稱 *</label>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="台北直營店" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>簡稱</label>
                  <input className={inputClass} value={shortName ?? ""} onChange={(e) => setShortName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>所屬區域 *</label>
                  <select className={inputClass} value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                    {regions.length === 0 && <option value="">請先建立區域</option>}
                    {regions.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>所屬法人 *</label>
                  <select className={inputClass} value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)}>
                    {subsidiaries.length === 0 && <option value="">請先建立法人</option>}
                    {subsidiaries.map((s) => (<option key={s.id} value={s.id}>{s.short_name ?? s.legal_name}（{s.tax_id}）</option>))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>門店類型</label>
                  <select className={inputClass} value={storeType} onChange={(e) => setStoreType(e.target.value as StoreType)}>
                    <option value="direct">直營</option>
                    <option value="dealer">經銷</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className={labelClass}>地址</label>
                  <input className={inputClass} value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>電話</label>
                  <input className={inputClass} value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {mode === "view" && tab === "warehouses" && store && (
        <section className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-[#9A9890]">此門店底下的倉庫</span>
            <Link
              href={`/parts/setup/warehouses/new?org_id=${store.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center"
            >
              ＋ 新增倉庫
            </Link>
          </div>
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
              <tr>
                <th className="text-left font-medium py-2 px-3">代碼</th>
                <th className="text-left font-medium py-2 px-3">名稱</th>
                <th className="text-left font-medium py-2 px-3">類型</th>
                <th className="text-left font-medium py-2 px-3">狀態</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-[#9A9890]">尚無倉庫</td></tr>
              )}
              {warehouses.map((w) => (
                <tr key={w.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-mono">
                    <Link href={`/parts/setup/warehouses/${w.id}`} className="text-[#185FA5] hover:underline">{w.code}</Link>
                  </td>
                  <td className="py-2 px-3">{w.name}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{w.type}</span>
                  </td>
                  <td className="py-2 px-3">
                    {w.is_active ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mode === "create" && (
        <p className="text-[12px] text-[#9A9890]">建立後將跳轉到該門店的詳情頁，可進一步維護倉庫等⋯</p>
      )}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
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
