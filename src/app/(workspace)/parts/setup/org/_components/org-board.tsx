"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  createRegionAction,
  updateRegionAction,
  createStoreAction,
  updateStoreAction,
  createWarehouseAction,
  updateWarehouseAction,
  type StoreType,
  type WarehouseType,
} from "@/lib/master-data/org-actions";

type RegionRow = {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  is_active: boolean;
};

type StoreRow = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  parent_id: string | null;
  store_type: string | null;
  is_active: boolean;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  org_id: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  bin_count: number;
};

const WAREHOUSE_TYPE_OPTIONS: Array<{ value: WarehouseType; label: string }> = [
  { value: "main", label: "主倉" },
  { value: "consignment", label: "寄存" },
  { value: "warranty", label: "保固" },
  { value: "transit", label: "在途" },
  { value: "temporary", label: "臨時" },
  { value: "quarantine", label: "隔離" },
  { value: "virtual", label: "虛擬" },
];

const WAREHOUSE_TYPE_BADGE: Record<string, string> = {
  main: "bg-[#EBF3FF] text-[#1A3A5C]",
  consignment: "bg-[#E8F5F0] text-[#0F6E56]",
  warranty: "bg-[#FDECEA] text-[#CC0000]",
  transit: "bg-[#FDF3E3] text-[#854F0B]",
  temporary: "bg-[#F2F2F2] text-[#5A5955]",
  quarantine: "bg-[#FDF3E3] text-[#854F0B]",
  virtual: "bg-[#F2F2F2] text-[#5A5955]",
};

function warehouseTypeLabel(t: string) {
  return WAREHOUSE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

type Banner = { ok: boolean; msg: string } | null;

export function OrgBoard({
  regions,
  stores,
  warehouses,
  canEditOrg,
  canEditWarehouse,
}: {
  regions: RegionRow[];
  stores: StoreRow[];
  warehouses: WarehouseRow[];
  canEditOrg: boolean;
  canEditWarehouse: boolean;
}) {
  const regionById = useMemo(
    () => new Map(regions.map((r) => [r.id, r])),
    [regions],
  );
  const storeById = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  );

  return (
    <main className="px-6 py-6 space-y-5 bg-[#F8F7F4] min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            組織三層架構
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            1.1
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          銷售區域 → 門店 → 倉庫　三層組織結構設定與管理
        </p>
      </header>

      <div className="rounded-md border border-[#B5D4F4] bg-[#EAF4FB] px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📋 組織架構為整個庫存管理系統的基礎，所有採購、入庫、出庫、調撥作業均依此三層結構進行權限控管與數據隔離。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RegionCard regions={regions} canEdit={canEditOrg} />
        <StoreCard
          stores={stores}
          regions={regions}
          regionById={regionById}
          canEdit={canEditOrg}
        />
      </div>

      <WarehouseCard
        warehouses={warehouses}
        stores={stores}
        storeById={storeById}
        canEdit={canEditWarehouse}
      />
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Region Card
// ──────────────────────────────────────────────────────────

function RegionCard({
  regions,
  canEdit,
}: {
  regions: RegionRow[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🗺 銷售區域（第一層）
        </span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setBanner(null);
            }}
            className="px-2.5 h-[26px] rounded bg-[#0F6E56] hover:bg-[#0a5642] text-white text-[11.5px] font-medium"
          >
            ＋ 新增區域
          </button>
        )}
      </div>

      {banner && <BannerLine banner={banner} />}

      {adding && (
        <RegionForm
          mode="create"
          onClose={() => setAdding(false)}
          onResult={setBanner}
        />
      )}

      <div>
        {regions.length === 0 && !adding && (
          <div className="px-4 py-8 text-center text-[12px] text-[#9A9890]">
            尚無區域，請新增。
          </div>
        )}
        {regions.map((r) =>
          editingId === r.id ? (
            <RegionForm
              key={r.id}
              mode="update"
              region={r}
              onClose={() => setEditingId(null)}
              onResult={setBanner}
            />
          ) : (
            <div
              key={r.id}
              className="px-4 py-2.5 border-b border-[#EEECE6] last:border-b-0 flex items-center justify-between"
            >
              <div>
                <div className="text-[13px] font-medium text-[#2C2C2A] flex items-center gap-2">
                  {r.name}
                  <span className="font-mono text-[11px] text-[#9A9890]">
                    {r.code}
                  </span>
                </div>
                {r.notes && (
                  <div className="text-[11px] text-[#6B6A68] mt-0.5">
                    涵蓋：{r.notes}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge active={r.is_active} />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(r.id);
                      setAdding(false);
                      setBanner(null);
                    }}
                    className="px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px]"
                  >
                    編輯
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function RegionForm({
  mode,
  region,
  onClose,
  onResult,
}: {
  mode: "create" | "update";
  region?: RegionRow;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(region?.name ?? "");
  const [code, setCode] = useState(region?.code ?? "");
  const [notes, setNotes] = useState(region?.notes ?? "");
  const [isActive, setIsActive] = useState(region?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const payload = { name, code, notes, is_active: isActive };
      const res =
        mode === "create"
          ? await createRegionAction(payload)
          : await updateRegionAction(region!.id, payload);
      if (res.ok) {
        onResult({ ok: true, msg: mode === "create" ? "✓ 已新增區域" : "✓ 已更新區域" });
        onClose();
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      className={`px-4 py-3 border-b border-[#EEECE6] bg-[#FAFAF9] space-y-2 ${pending ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="區域名稱 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
            placeholder="如：台灣北區"
          />
        </Field>
        <Field label="代碼 *">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px]"
            placeholder="REGION-N"
          />
        </Field>
      </div>
      <Field label="涵蓋說明">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
          placeholder="台北市、新北市、基隆、桃園"
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-[12px] text-[#5A5955]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={pending}
        />
        啟用
      </label>
      {err && <ErrorLine msg={err} />}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !name.trim() || !code.trim()}
          className="px-3 h-[30px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] disabled:opacity-50 text-white text-[12px] font-medium inline-flex items-center gap-1.5"
        >
          {pending && <Spinner />}
          {pending ? "儲存中…" : mode === "create" ? "新增" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-3 h-[30px] rounded bg-white border border-[#D5D3CB] text-[#5A5955] text-[12px]"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Store Card
// ──────────────────────────────────────────────────────────

function StoreCard({
  stores,
  regions,
  regionById,
  canEdit,
}: {
  stores: StoreRow[];
  regions: RegionRow[];
  regionById: Map<string, RegionRow>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🏪 門店（第二層）
        </span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setBanner(null);
            }}
            disabled={regions.length === 0}
            className="px-2.5 h-[26px] rounded bg-[#0F6E56] hover:bg-[#0a5642] disabled:opacity-50 text-white text-[11.5px] font-medium"
            title={regions.length === 0 ? "請先建立區域" : ""}
          >
            ＋ 新增門店
          </button>
        )}
      </div>

      {banner && <BannerLine banner={banner} />}

      {adding && (
        <StoreForm
          mode="create"
          regions={regions}
          onClose={() => setAdding(false)}
          onResult={setBanner}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#5A5955]">
              <th className="px-3 py-2 font-semibold">門店</th>
              <th className="px-3 py-2 font-semibold">區域</th>
              <th className="px-3 py-2 font-semibold">類型</th>
              <th className="px-3 py-2 font-semibold">狀態</th>
              {canEdit && <th className="px-3 py-2 font-semibold w-[60px]" />}
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className="px-3 py-8 text-center text-[12px] text-[#9A9890]"
                >
                  尚無門店
                </td>
              </tr>
            )}
            {stores.map((s) =>
              editingId === s.id ? (
                <tr key={s.id}>
                  <td colSpan={canEdit ? 5 : 4} className="p-0">
                    <StoreForm
                      mode="update"
                      regions={regions}
                      store={s}
                      onClose={() => setEditingId(null)}
                      onResult={setBanner}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={s.id}
                  className="border-t border-[#EEECE6] hover:bg-[#FAFAF9]"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#2C2C2A]">{s.name}</div>
                    <div className="font-mono text-[11px] text-[#9A9890]">
                      {s.code}
                      {s.short_name && (
                        <span className="ml-2 text-[#6B6A68]">{s.short_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#5A5955]">
                    {s.parent_id
                      ? regionById.get(s.parent_id)?.name ?? "—"
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {s.store_type === "dealer" ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#E8F5F0] text-[#0F6E56]">
                        經銷
                      </span>
                    ) : (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                        直營
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge active={s.is_active} />
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(s.id);
                          setAdding(false);
                          setBanner(null);
                        }}
                        className="px-2 h-[24px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
                      >
                        編輯
                      </button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StoreForm({
  mode,
  store,
  regions,
  onClose,
  onResult,
}: {
  mode: "create" | "update";
  store?: StoreRow;
  regions: RegionRow[];
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(store?.name ?? "");
  const [code, setCode] = useState(store?.code ?? "");
  const [shortName, setShortName] = useState(store?.short_name ?? "");
  const [parentId, setParentId] = useState(
    store?.parent_id ?? regions[0]?.id ?? "",
  );
  const [storeType, setStoreType] = useState<StoreType>(
    (store?.store_type as StoreType) ?? "direct",
  );
  const [address, setAddress] = useState(store?.address ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");
  const [isActive, setIsActive] = useState(store?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const payload = {
        name,
        code,
        short_name: shortName,
        parent_id: parentId,
        store_type: storeType,
        address,
        phone,
        is_active: isActive,
      };
      const res =
        mode === "create"
          ? await createStoreAction(payload)
          : await updateStoreAction(store!.id, payload);
      if (res.ok) {
        onResult({ ok: true, msg: mode === "create" ? "✓ 已新增門店" : "✓ 已更新門店" });
        onClose();
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      className={`px-4 py-3 bg-[#FAFAF9] space-y-2 ${pending ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="門店名稱 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
            placeholder="如：Ducati Taipei (信義)"
          />
        </Field>
        <Field label="代碼 *">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px]"
            placeholder="STORE-XXX"
          />
        </Field>
        <Field label="所屬區域 *">
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] bg-white"
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="門店類型">
          <select
            value={storeType}
            onChange={(e) => setStoreType(e.target.value as StoreType)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] bg-white"
          >
            <option value="direct">直營</option>
            <option value="dealer">經銷</option>
          </select>
        </Field>
        <Field label="簡稱">
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
            placeholder="信義店"
          />
        </Field>
        <Field label="電話">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
          />
        </Field>
      </div>
      <Field label="地址">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={pending}
          className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-[12px] text-[#5A5955]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={pending}
        />
        啟用
      </label>
      {err && <ErrorLine msg={err} />}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !name.trim() || !code.trim() || !parentId}
          className="px-3 h-[30px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] disabled:opacity-50 text-white text-[12px] font-medium inline-flex items-center gap-1.5"
        >
          {pending && <Spinner />}
          {pending ? "儲存中…" : mode === "create" ? "新增" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-3 h-[30px] rounded bg-white border border-[#D5D3CB] text-[#5A5955] text-[12px]"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Warehouse Card
// ──────────────────────────────────────────────────────────

function WarehouseCard({
  warehouses,
  stores,
  storeById,
  canEdit,
}: {
  warehouses: WarehouseRow[];
  stores: StoreRow[];
  storeById: Map<string, StoreRow>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[#1A1917]">
            🏗 倉庫（第三層）
          </span>
          <span className="text-[12px] text-[#9A9890]">
            每間門店可設定多個倉庫，各自獨立管理庫存
          </span>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setBanner(null);
            }}
            disabled={stores.length === 0}
            className="px-2.5 h-[26px] rounded bg-[#0F6E56] hover:bg-[#0a5642] disabled:opacity-50 text-white text-[11.5px] font-medium"
            title={stores.length === 0 ? "請先建立門店" : ""}
          >
            ＋ 新增倉庫
          </button>
        )}
      </div>

      {banner && <BannerLine banner={banner} />}

      {adding && (
        <WarehouseForm
          mode="create"
          stores={stores}
          onClose={() => setAdding(false)}
          onResult={setBanner}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#5A5955]">
              <th className="px-3 py-2 font-semibold">倉庫名稱</th>
              <th className="px-3 py-2 font-semibold">所屬門店</th>
              <th className="px-3 py-2 font-semibold">類型</th>
              <th className="px-3 py-2 font-semibold text-right">庫位數</th>
              <th className="px-3 py-2 font-semibold">狀態</th>
              {canEdit && <th className="px-3 py-2 font-semibold w-[140px]" />}
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-3 py-8 text-center text-[12px] text-[#9A9890]"
                >
                  尚無倉庫
                </td>
              </tr>
            )}
            {warehouses.map((w) =>
              editingId === w.id ? (
                <tr key={w.id}>
                  <td colSpan={canEdit ? 6 : 5} className="p-0">
                    <WarehouseForm
                      mode="update"
                      stores={stores}
                      warehouse={w}
                      onClose={() => setEditingId(null)}
                      onResult={setBanner}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={w.id}
                  className="border-t border-[#EEECE6] hover:bg-[#FAFAF9]"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-[#2C2C2A]">{w.name}</div>
                    <div className="font-mono text-[11px] text-[#9A9890]">
                      {w.code}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[#5A5955]">
                    {w.org_id ? storeById.get(w.org_id)?.name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[11px] ${WAREHOUSE_TYPE_BADGE[w.type] ?? ""}`}
                    >
                      {warehouseTypeLabel(w.type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{w.bin_count}</td>
                  <td className="px-3 py-2">
                    <StatusBadge active={w.is_active} />
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5 justify-end">
                        <Link
                          href="/parts/setup/warehouse-bins"
                          className="px-2 h-[24px] inline-flex items-center rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
                        >
                          設定庫位
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(w.id);
                            setAdding(false);
                            setBanner(null);
                          }}
                          className="px-2 h-[24px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
                        >
                          編輯
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WarehouseForm({
  mode,
  warehouse,
  stores,
  onClose,
  onResult,
}: {
  mode: "create" | "update";
  warehouse?: WarehouseRow;
  stores: StoreRow[];
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(warehouse?.name ?? "");
  const [code, setCode] = useState(warehouse?.code ?? "");
  const [orgId, setOrgId] = useState(warehouse?.org_id ?? stores[0]?.id ?? "");
  const [type, setType] = useState<WarehouseType>(
    (warehouse?.type as WarehouseType) ?? "main",
  );
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [notes, setNotes] = useState(warehouse?.notes ?? "");
  const [isActive, setIsActive] = useState(warehouse?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    startTransition(async () => {
      const payload = {
        name,
        code,
        org_id: orgId,
        type,
        address,
        notes,
        is_active: isActive,
      };
      const res =
        mode === "create"
          ? await createWarehouseAction(payload)
          : await updateWarehouseAction(warehouse!.id, payload);
      if (res.ok) {
        onResult({ ok: true, msg: mode === "create" ? "✓ 已新增倉庫" : "✓ 已更新倉庫" });
        onClose();
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      className={`px-4 py-3 bg-[#FAFAF9] space-y-2 border-t border-[#EEECE6] ${pending ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <Field label="倉庫名稱 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
            placeholder="如：信義主倉"
          />
        </Field>
        <Field label="代碼 *">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px]"
            placeholder="WH-XXX"
          />
        </Field>
        <Field label="所屬門店 *">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] bg-white"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="倉庫類型">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as WarehouseType)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] bg-white"
          >
            {WAREHOUSE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="地址" className="col-span-2">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
          />
        </Field>
      </div>
      <Field label="備註">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={pending}
          className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px]"
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-[12px] text-[#5A5955]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={pending}
        />
        啟用
      </label>
      {err && <ErrorLine msg={err} />}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || !name.trim() || !code.trim() || !orgId}
          className="px-3 h-[30px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] disabled:opacity-50 text-white text-[12px] font-medium inline-flex items-center gap-1.5"
        >
          {pending && <Spinner />}
          {pending ? "儲存中…" : mode === "create" ? "新增" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-3 h-[30px] rounded bg-white border border-[#D5D3CB] text-[#5A5955] text-[12px]"
        >
          取消
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 共用小元件
// ──────────────────────────────────────────────────────────

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] text-[#9A9890] font-medium">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
      啟用
    </span>
  ) : (
    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
      停用
    </span>
  );
}

function BannerLine({ banner }: { banner: NonNullable<Banner> }) {
  return (
    <div
      className={`px-4 py-2 text-[12px] border-b border-[#EEECE6] ${
        banner.ok
          ? "bg-[#EAF3DE] text-[#3B6D11]"
          : "bg-[#FDECEA] text-[#CC0000]"
      }`}
    >
      {banner.msg}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1.5">
      {msg}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
