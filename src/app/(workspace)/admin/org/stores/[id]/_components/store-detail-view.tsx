"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createStoreAction,
  updateStoreAction,
  deleteStoreAction,
} from "@/lib/rbac/org-actions";
import type { StoreDetail } from "@/domain/org-admin";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";
type Brand = { id: string; name: string };
type Group = { id: string; name: string };
type Region = { id: string; code: string; name: string; brand_id: string };

export type StoreDetailViewProps = {
  store: StoreDetail | null;
  brands: Brand[];
  groups: Group[];
  regions: Region[];
  initialMode: Mode;
};

export function StoreDetailView({
  store,
  brands,
  groups,
  regions,
  initialMode,
}: StoreDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // 共用 form state（edit / create 共用一組，進對應 mode 時 reset）
  const [fCode, setFCode] = useState(store?.code ?? "");
  const [fName, setFName] = useState(store?.name ?? "");
  const [fShort, setFShort] = useState(store?.short_name ?? "");
  const [fBrand, setFBrand] = useState(store?.brand_id ?? brands[0]?.id ?? "");
  const [fGroup, setFGroup] = useState(store?.group_id ?? groups[0]?.id ?? "default");
  const [fParent, setFParent] = useState<string>(store?.parent_id ?? "");
  const [fType, setFType] = useState<"region" | "store">(
    store?.type === "region" ? "region" : "store",
  );
  const [fActive, setFActive] = useState(store?.is_active ?? true);
  const [fAddress, setFAddress] = useState(store?.address ?? "");
  const [fPhone, setFPhone] = useState(store?.phone ?? "");
  const [fResp, setFResp] = useState(store?.responsible_person ?? "");
  const [fBrandIds, setFBrandIds] = useState<Set<string>>(
    new Set(store?.brand_ids ?? [store?.brand_id].filter(Boolean) as string[]),
  );

  const parentOptions = useMemo(
    () => regions.filter((r) => r.brand_id === fBrand && r.id !== store?.id),
    [regions, fBrand, store?.id],
  );

  const resetToCreate = () => {
    setFCode("");
    setFName("");
    setFShort("");
    setFBrand(brands[0]?.id ?? "");
    setFGroup(groups[0]?.id ?? "default");
    setFParent("");
    setFType("store");
    setFActive(true);
    setFAddress("");
    setFPhone("");
    setFResp("");
    setFBrandIds(new Set([brands[0]?.id ?? ""].filter(Boolean)));
  };

  const enterEditMode = () => {
    if (store) {
      setFCode(store.code);
      setFName(store.name);
      setFShort(store.short_name ?? "");
      setFBrand(store.brand_id);
      setFGroup(store.group_id ?? "default");
      setFParent(store.parent_id ?? "");
      setFType(store.type === "region" ? "region" : "store");
      setFActive(store.is_active);
      setFAddress(store.address ?? "");
      setFPhone(store.phone ?? "");
      setFResp(store.responsible_person ?? "");
      setFBrandIds(new Set(store.brand_ids));
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!store) return;
    if (!fCode.trim()) return showBanner({ ok: false, msg: "店碼必填" });
    if (!fName.trim()) return showBanner({ ok: false, msg: "店名必填" });
    startTransition(async () => {
      const res = await updateStoreAction(store.id, {
        code: fCode,
        name: fName,
        short_name: fShort,
        brand_id: fBrand,
        group_id: fGroup,
        parent_id: fParent || null,
        is_active: fActive,
        address: fAddress,
        phone: fPhone,
        responsible_person: fResp,
        brand_ids: [...fBrandIds],
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!fCode.trim()) return showBanner({ ok: false, msg: "店碼必填" });
    if (!fName.trim()) return showBanner({ ok: false, msg: "店名必填" });
    if (!fBrand) return showBanner({ ok: false, msg: "請選擇主品牌" });
    startTransition(async () => {
      const res = await createStoreAction({
        code: fCode,
        name: fName,
        short_name: fShort,
        brand_id: fBrand,
        group_id: fGroup,
        parent_id: fParent || null,
        type: fType,
        level: fType === "region" ? 1 : 2,
        address: fAddress,
        phone: fPhone,
        responsible_person: fResp,
        brand_ids: [...fBrandIds],
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${fCode}` });
        router.push(`/admin/org/stores/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!store) return;
    if (!confirm(`刪除「${store.code} ${store.name}」？下層子節點與授權需先清除。`)) return;
    startTransition(async () => {
      const res = await deleteStoreAction(store.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/org/stores");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = () => {
    if (!store) return;
    startTransition(async () => {
      const res = await updateStoreAction(store.id, { is_active: !store.is_active });
      if (res.ok) {
        showBanner({ ok: true, msg: store.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleBrandId = (b: string) => {
    const next = new Set(fBrandIds);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    setFBrandIds(next);
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const editing = mode === "edit" || mode === "create";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode = mode === "create" ? "新增門店" : store?.code ?? "—";

  const renderPills = () => {
    if (mode === "edit" && store) {
      return (
        <>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存變更"}
          </button>
        </>
      );
    }
    if (mode === "create") {
      return (
        <>
          <button
            type="button"
            onClick={() => router.push("/admin/org/stores")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </>
      );
    }
    return (
      <>
        <Link
          href="/admin/org/stores"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <button
          type="button"
          onClick={() => {
            resetToCreate();
            setMode("create");
          }}
          disabled={isPending}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
        >
          新增
        </button>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !store}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={isPending || !store}
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending || !store}
          className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
        >
          {store?.is_active ? "停用" : "啟用"}
        </button>
      </>
    );
  };

  const brandPicker = (
    <div className="border border-[#D5D3CB] rounded p-2 max-h-[160px] overflow-y-auto space-y-1">
      {brands.map((b) => (
        <label
          key={b.id}
          className={`flex items-center gap-2 px-1.5 py-0.5 rounded ${
            b.id === fBrand
              ? "bg-[#EAF4FB] cursor-not-allowed opacity-70"
              : "cursor-pointer hover:bg-[#F8F7F4]"
          }`}
        >
          <input
            type="checkbox"
            checked={fBrandIds.has(b.id)}
            disabled={b.id === fBrand}
            onChange={() => toggleBrandId(b.id)}
            className="w-4 h-4 accent-[#0F6E56]"
          />
          <span className="text-[12px]">{b.name}</span>
          <span className="text-[10.5px] text-[#9A9890] font-mono ml-auto">{b.id}</span>
          {b.id === fBrand && (
            <span className="text-[10px] px-1 rounded bg-[#1A3A5C] text-white">主</span>
          )}
        </label>
      ))}
    </div>
  );

  // 共用的可編輯表單欄位（edit / create 共用）
  const editForm = (
    <>
      <SectionCard title="▼ 基本資料">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>店碼 *</label>
            <input
              className={`${inputClass} font-mono`}
              placeholder="例：DUC_TPE_NEIHU"
              value={fCode}
              onChange={(e) => setFCode(e.target.value.toUpperCase())}
            />
          </div>
          {mode === "create" && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>類型 *</label>
              <select
                className={inputClass}
                value={fType}
                onChange={(e) => setFType(e.target.value as "region" | "store")}
              >
                <option value="region">區域 / HQ（level 1）</option>
                <option value="store">門店（level 2）</option>
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>店名 *</label>
            <input
              className={inputClass}
              placeholder="例：Ducati Taipei (內湖)"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>簡稱</label>
            <input
              className={inputClass}
              placeholder="例：內湖"
              value={fShort}
              onChange={(e) => setFShort(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="▼ 歸屬">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>主品牌 *</label>
            <select
              className={inputClass}
              value={fBrand}
              onChange={(e) => {
                setFBrand(e.target.value);
                const next = new Set(fBrandIds);
                next.add(e.target.value);
                setFBrandIds(next);
              }}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>所屬集團 *</label>
            <select
              className={inputClass}
              value={fGroup}
              onChange={(e) => setFGroup(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))}
            </select>
          </div>
          {fType === "store" && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>上層區域 / HQ（選）</label>
              <select
                className={inputClass}
                value={fParent}
                onChange={(e) => setFParent(e.target.value)}
              >
                <option value="">— 直接掛在 brand 下 —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className={labelClass}>附加掛載品牌（複合店勾選；主品牌已自動掛）</label>
            {brandPicker}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="▼ 聯絡資訊">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>負責人</label>
            <input
              className={inputClass}
              value={fResp}
              onChange={(e) => setFResp(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>電話</label>
            <input
              className={inputClass}
              value={fPhone}
              onChange={(e) => setFPhone(e.target.value)}
            />
          </div>
          {mode === "edit" && (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>狀態</label>
              <label className="inline-flex items-center gap-2 h-[30px] text-[12.5px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={fActive}
                  onChange={(e) => setFActive(e.target.checked)}
                  className="w-4 h-4 accent-[#0F6E56]"
                />
                啟用
              </label>
            </div>
          )}
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className={labelClass}>地址</label>
            <input
              className={inputClass}
              value={fAddress}
              onChange={(e) => setFAddress(e.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] text-[#9A9890] mt-2">
          負責人 / 電話 / 地址會落到 organizations typed column；可留空。
        </p>
      </SectionCard>
    </>
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/org/stores" className="hover:text-[#185FA5]">
            門店主檔
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">{renderPills()}</div>
      </div>

      {/* 2. Banner */}
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

      {/* 3. Title Card */}
      {mode === "create" ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">門店 / 區域</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名門店）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">新增門店 / 區域（store = organizations 表）</span>
          </div>
        </header>
      ) : store ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">門店 / 區域</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {store.name}
              {store.short_name && (
                <span className="text-[12px] text-[#9A9890] ml-2">({store.short_name})</span>
              )}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{store.code}</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  store.type === "region"
                    ? "bg-[#FDF3E3] text-[#854F0B]"
                    : "bg-[#EAF4FB] text-[#185FA5]"
                }`}
              >
                {store.type === "region" ? "區域 / HQ" : "門店"}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5] font-mono">
                {store.brand_id}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  store.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {store.is_active ? "啟用" : "停用"}
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此門店（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {editing ? (
        <>
          {editForm}
          {mode === "create" && (
            <div className="text-[12px] text-[#9A9890] px-1 py-2">
              建立後將跳轉到該門店的詳情頁，可進一步維護⋯
            </div>
          )}
        </>
      ) : store ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="店碼" value={<span className="font-mono">{store.code}</span>} />
              <Kv label="店名" value={store.name} />
              <Kv label="簡稱" value={store.short_name ?? "—"} />
              <Kv
                label="類型"
                value={store.type === "region" ? "區域 / HQ（level 1）" : "門店（level 2）"}
                small
              />
              <Kv label="狀態" value={store.is_active ? "啟用" : "停用"} small />
            </div>
          </SectionCard>

          <SectionCard title="▼ 歸屬">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="主品牌" value={<span className="font-mono">{store.brand_id}</span>} />
              <Kv
                label="所屬集團"
                value={<span className="font-mono">{store.group_id ?? "—"}</span>}
              />
              <Kv label="上層區域 / HQ" value={store.parent_label ?? "—"} small />
              <Kv
                label="掛載品牌"
                full
                value={
                  store.brand_ids.length === 0 ? (
                    "—"
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {store.brand_ids.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-mono"
                        >
                          {b}
                          {b === store.brand_id && (
                            <span className="ml-1 px-1 rounded bg-[#1A3A5C] text-white text-[10px]">
                              主
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 聯絡資訊">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="負責人" value={store.responsible_person ?? "—"} />
              <Kv label="電話" value={store.phone ?? "—"} />
              <Kv label="店別" value={store.store_type ?? "—"} small />
              <Kv label="地址" full value={store.address ?? "—"} />
            </div>
          </SectionCard>

          <SectionCard title="▼ 系統">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="organizations.id" value={store.id} mono small />
              <Kv label="建立時間" value={fmtTs(store.created_at)} small />
              <Kv label="更新時間" value={fmtTs(store.updated_at)} small />
            </div>
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(
    tw.getUTCHours(),
  )}:${p(tw.getUTCMinutes())}`;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div
        className={`${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
