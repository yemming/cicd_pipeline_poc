"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  updateNewCarAction,
  deleteNewCarAction,
  setNewCarStatusAction,
  createNewCarAction,
} from "@/lib/sales/new-car-actions";
import {
  NEW_CAR_STATUS_LABELS,
  NEW_CAR_STATUS_CHIP,
  LICENSE_PLATE_STATUS_LABELS,
  ALL_STATUSES,
  ALL_LICENSE_PLATE_STATUSES,
  type NewCarInventoryStatus,
  type LicensePlateStatus,
} from "@/domain/new-car-inventory.constants";
import type { NewCarInventoryRow, NewCarInventoryInput } from "@/domain/new-car-inventory.constants";
import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";

// ── 小元件 ──────────────────────────────────────────────────────────────

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

type ViewMode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;

type VehicleModelOption = { id: string; display_name: string; series: string | null; msrp: number | null };
type OrganizationOption = { id: string; name: string };

// ── 主元件 ──────────────────────────────────────────────────────────────

export default function NewCarDetailView({
  car,
  vehicleModels,
  organizations,
  brandId,
  canEdit,
  initialMode = "view",
}: {
  car: NewCarInventoryRow | null;
  vehicleModels: VehicleModelOption[];
  organizations: OrganizationOption[];
  brandId: string;
  canEdit: boolean;
  initialMode?: ViewMode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [creating, setCreating] = useState(initialMode === "create");

  // 編輯用 form state（從 car 初始化）
  const [fVin, setFVin] = useState(car?.vin ?? "");
  const [fModelId, setFModelId] = useState(car?.vehicle_model_id ?? "");
  const [fColor, setFColor] = useState(car?.color ?? "");
  const [fColorHex, setFColorHex] = useState(car?.color_hex ?? "");
  const [fYear, setFYear] = useState(car?.year?.toString() ?? new Date().getFullYear().toString());
  const [fStatus, setFStatus] = useState<NewCarInventoryStatus>(car?.status ?? "arrived");
  const [fCostPrice, setFCostPrice] = useState(car?.cost_price?.toString() ?? "");
  const [fListPrice, setFListPrice] = useState(car?.list_price?.toString() ?? "");
  const [fArrivalDate, setFArrivalDate] = useState(car?.arrival_date ?? "");
  const [fOrgId, setFOrgId] = useState(car?.organization_id ?? "");
  const [fLpStatus, setFLpStatus] = useState<LicensePlateStatus>(car?.license_plate_status ?? "not_applied");
  const [fLpNo, setFLpNo] = useState(car?.license_plate_no ?? "");
  const [fNote, setFNote] = useState(car?.note ?? "");
  const [fEngineNo, setFEngineNo] = useState(car?.engine_no ?? "");

  const isView = mode === "view" && !creating;
  const isEdit = mode === "edit";
  const isCreate = creating;

  useSetPageHeader({
    title: isCreate ? "新增車輛" : (car?.model_display_name ?? "車輛詳情"),
    breadcrumb: [
      { label: "展廳接待" },
      { label: "新車庫存", href: "/sales/showroom/new-cars" },
      { label: isCreate ? "新增" : (car?.vin ?? car?.id?.slice(0, 8) ?? "詳情") },
    ],
    hideSearch: true,
  });

  function resetCreateForm() {
    setFVin(""); setFModelId(""); setFColor(""); setFColorHex("");
    setFYear(new Date().getFullYear().toString()); setFStatus("arrived");
    setFCostPrice(""); setFListPrice(""); setFArrivalDate(""); setFOrgId("");
    setFLpStatus("not_applied"); setFLpNo(""); setFNote(""); setFEngineNo("");
  }

  function buildInput(): NewCarInventoryInput {
    return {
      brand_id: brandId,
      vin: fVin.trim() || null,
      vehicle_model_id: fModelId || null,
      color: fColor.trim() || null,
      color_hex: fColorHex.trim() || null,
      year: fYear ? parseInt(fYear, 10) : null,
      engine_no: fEngineNo.trim() || null,
      status: fStatus,
      cost_price: fCostPrice ? parseFloat(fCostPrice) : null,
      list_price: fListPrice ? parseFloat(fListPrice) : null,
      arrival_date: fArrivalDate || null,
      organization_id: fOrgId || null,
      license_plate_status: fLpStatus,
      license_plate_no: fLpNo.trim() || null,
      note: fNote.trim() || null,
    };
  }

  function handleCreate() {
    startTransition(async () => {
      const res = await createNewCarAction(buildInput());
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已建立，跳轉中⋯" });
        setTimeout(() => router.push(`/sales/showroom/new-cars/${res.data.id}`), 800);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleUpdate() {
    if (!car) return;
    startTransition(async () => {
      const res = await updateNewCarAction(car.id, buildInput());
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete() {
    if (!car) return;
    if (!confirm(`確定要刪除 ${car.model_display_name ?? car.vin ?? "此筆"} 嗎？`)) return;
    startTransition(async () => {
      const res = await deleteNewCarAction(car.id);
      if (res.ok) {
        router.push("/sales/showroom/new-cars");
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSetStatus(status: NewCarInventoryStatus) {
    if (!car) return;
    startTransition(async () => {
      const res = await setNewCarStatusAction(car.id, status);
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 狀態已更新為「${NEW_CAR_STATUS_LABELS[status]}」` });
        router.refresh();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  const inputClass =
    "w-full h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:bg-[#F8F7F4] disabled:opacity-60";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>

      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/sales/showroom/new-cars" className="hover:text-[#185FA5]">新車庫存</Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {isCreate ? "新增" : (car?.vin ?? car?.id?.slice(0, 8) ?? "—")}
          </span>
          {isEdit && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          )}
          {isCreate && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-[#FDF3E3] text-[#854F0B] font-medium">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isView && (
            <>
              <Link
                href="/sales/showroom/new-cars"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              {canEdit && (
                <>
                  <button
                    onClick={() => { setCreating(true); resetCreateForm(); }}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                    disabled={isPending}
                  >
                    新增
                  </button>
                  <button
                    onClick={() => setMode("edit")}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                    disabled={isPending}
                  >
                    修改
                  </button>
                  <button
                    onClick={handleDelete}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                    disabled={isPending}
                  >
                    刪除
                  </button>
                </>
              )}
            </>
          )}
          {isEdit && (
            <>
              <button
                onClick={() => setMode("view")}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                disabled={isPending}
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                disabled={isPending}
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {isCreate && (
            <>
              <button
                onClick={() => { setCreating(false); if (!car) router.push("/sales/showroom/new-cars"); }}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                disabled={isPending}
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                disabled={isPending}
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">新車庫存 / 展廳接待</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreate ? "（新增車輛）" : (car?.model_display_name ?? "—")}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{isCreate ? "—" : (car?.vin ?? "無 VIN")}</span>
                {!isCreate && car && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${NEW_CAR_STATUS_CHIP[car.status]}`}>
                    {NEW_CAR_STATUS_LABELS[car.status]}
                  </span>
                )}
                {!isCreate && car?.model_series && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    {car.model_series}
                  </span>
                )}
                {isCreate && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
            {/* 快速狀態切換（view mode）*/}
            {isView && car && canEdit && (
              <div className="flex gap-1.5 flex-wrap">
                {ALL_STATUSES.filter((s) => s !== car.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSetStatus(s)}
                    className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    disabled={isPending}
                  >
                    → {NEW_CAR_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0">
            {isCreate ? (
              <div className="w-[280px] h-[180px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
                建立後可上傳車輛照片
              </div>
            ) : car ? (
              <EntityImageGallery
                entity="new-car"
                entityId={car.id}
                images={car.images ?? []}
                alt={car.model_display_name ?? "車輛照片"}
                canEdit={canEdit}
                width={280}
                height={180}
                maxImages={12}
                emptyHint="尚未上傳車輛照片"
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* 3. 基本資料 KV / 編輯 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 車輛基本資料</span>
        </header>
        <div className="px-4 py-4">
          {isView && car ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="VIN" value={car.vin} mono />
              <Kv label="車款" value={car.model_display_name} />
              <Kv label="車系" value={car.model_series} />
              <Kv label="顏色" value={
                <div className="flex items-center gap-1.5">
                  {car.color_hex && (
                    <span className="inline-block w-[12px] h-[12px] rounded-full border border-black/10" style={{ background: car.color_hex }} />
                  )}
                  {car.color ?? "—"}
                </div>
              } />
              <Kv label="年款" value={car.year} mono />
              <Kv label="引擎號碼" value={car.engine_no} mono />
              <Kv label="到廠日" value={car.arrival_date} />
              <Kv label="展廳" value={car.organization_name} />
              <Kv label="備註" value={car.note} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>VIN</label>
                <input value={fVin} onChange={(e) => setFVin(e.target.value)} className={inputClass} placeholder="ZDM..." disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>車款</label>
                <select value={fModelId} onChange={(e) => setFModelId(e.target.value)} className={inputClass} disabled={isPending}>
                  <option value="">— 選擇車款 —</option>
                  {vehicleModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>顏色</label>
                <input value={fColor} onChange={(e) => setFColor(e.target.value)} className={inputClass} placeholder="如：紅" disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>色票 HEX</label>
                <input value={fColorHex} onChange={(e) => setFColorHex(e.target.value)} className={inputClass} placeholder="#C8001A" disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>年款</label>
                <input type="number" value={fYear} onChange={(e) => setFYear(e.target.value)} className={inputClass} disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>引擎號碼</label>
                <input value={fEngineNo} onChange={(e) => setFEngineNo(e.target.value)} className={inputClass} placeholder="ENG-..." disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>到廠日期</label>
                <input type="date" value={fArrivalDate} onChange={(e) => setFArrivalDate(e.target.value)} className={inputClass} disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>展廳門店</label>
                <select value={fOrgId} onChange={(e) => setFOrgId(e.target.value)} className={inputClass} disabled={isPending}>
                  <option value="">— 選擇門店 —</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-full flex flex-col gap-1">
                <label className={labelClass}>備註</label>
                <textarea value={fNote} onChange={(e) => setFNote(e.target.value)} rows={2} className="w-full px-2 py-1.5 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none resize-none" disabled={isPending} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. 價格 & 狀態（view/edit）*/}
      {!isCreate && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 價格 & 狀態</span>
          </header>
          <div className="px-4 py-4">
            {isView && car ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv label="狀態" value={
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${NEW_CAR_STATUS_CHIP[car.status]}`}>
                    {NEW_CAR_STATUS_LABELS[car.status]}
                  </span>
                } />
                <Kv label="進貨成本" value={car.cost_price != null ? `NT$ ${car.cost_price.toLocaleString()}` : "—"} mono />
                <Kv label="零售售價" value={car.list_price != null ? `NT$ ${car.list_price.toLocaleString()}` : "—"} mono />
                <Kv label="售出日" value={car.sold_date} />
                <Kv label="交車日" value={car.delivered_date} />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>狀態</label>
                  <select value={fStatus} onChange={(e) => setFStatus(e.target.value as NewCarInventoryStatus)} className={inputClass} disabled={isPending}>
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{NEW_CAR_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>進貨成本（NT$）</label>
                  <input type="number" value={fCostPrice} onChange={(e) => setFCostPrice(e.target.value)} className={inputClass} disabled={isPending} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>零售售價（NT$）</label>
                  <input type="number" value={fListPrice} onChange={(e) => setFListPrice(e.target.value)} className={inputClass} disabled={isPending} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. 領牌資訊 */}
      {!isCreate && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 領牌資訊</span>
          </header>
          <div className="px-4 py-4">
            {isView && car ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv label="領牌狀態" value={LICENSE_PLATE_STATUS_LABELS[car.license_plate_status]} />
                <Kv label="車牌號碼" value={car.license_plate_no} mono />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>領牌狀態</label>
                  <select value={fLpStatus} onChange={(e) => setFLpStatus(e.target.value as LicensePlateStatus)} className={inputClass} disabled={isPending}>
                    {ALL_LICENSE_PLATE_STATUSES.map((s) => (
                      <option key={s} value={s}>{LICENSE_PLATE_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>車牌號碼</label>
                  <input value={fLpNo} onChange={(e) => setFLpNo(e.target.value)} className={inputClass} placeholder="如：ABC-1234" disabled={isPending} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Create hint */}
      {isCreate && (
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-4 text-[12.5px] text-[#5A5955]">
          建立後將跳轉到該車輛的詳情頁，可進一步維護價格、領牌狀態等資訊。
        </div>
      )}

      {/* Banner */}
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
