"use client";

import Link from "next/link";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";
import {
  createUsedCarAction,
  updateUsedCarAction,
  deleteUsedCarAction,
  setUsedCarStatusAction,
  saveConditionReportAction,
} from "@/lib/sales/used-car-actions";
import type { UsedCarInventoryRow } from "@/domain/used-car-inventory.constants";
import { calcDaysInStock, statusLabel } from "@/domain/used-car-inventory.constants";
import {
  USED_CAR_GRADE_OPTIONS,
  USED_CAR_STATUS_OPTIONS,
  USED_CAR_ACQUISITION_SOURCE_LABELS,
  USED_CAR_DB_STATUS_LABELS,
  EMPTY_CONDITION_REPORT,
  type UsedCarDbStatus,
  type UsedCarConditionGrade,
  type UsedCarAcquisitionSource,
  type ConditionReport,
} from "@/domain/used-car-inventory.constants";

// ── Design tokens ─────────────────────────────────────────────────────
const STATUS_CHIP: Record<string, string> = {
  available: "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  reserved: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  sold: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
  pending_inspection: "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  withdrawn: "bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]",
};

const GRADE_CHIP: Record<string, string> = {
  S: "bg-[#7A1010] text-white",
  A: "bg-[#185FA5] text-white",
  B: "bg-[#0F6E56] text-white",
  C: "bg-[#854F0B] text-white",
  D: "bg-[#9A9890] text-white",
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

// ── KV helper ─────────────────────────────────────────────────────────
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
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

// ── Modal helper ──────────────────────────────────────────────────────
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button onClick={onClose} className="text-[#9A9890] hover:text-[#5A5955] text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────
type Props = {
  car: UsedCarInventoryRow | null;
  brandId: string;
  initialMode?: "view" | "edit" | "create";
  canEdit?: boolean;
  /** 從 legal_text_templates 讀取的車況揭露免責說明（condition_report_disclaimer）。
   *  null 代表該 brand 尚無設定，顯示通用 fallback。 */
  disclaimerText?: string | null;
};

type FormMode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;
type ActiveTab = "business" | "condition_report";

// ─────────────────────────────────────────────────────────────────────
export default function UsedCarDetailView({ car, brandId, initialMode = "view", canEdit = true, disclaimerText }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<FormMode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // 輪9 車況說明書 tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>("business");
  const existingReport = (car?.metadata?.condition_report as Partial<ConditionReport>) ?? {};
  const [condReport, setCondReport] = useState<ConditionReport>({
    ...EMPTY_CONDITION_REPORT,
    ...existingReport,
  });
  const [condSigDataUrl, setCondSigDataUrl] = useState<string | null>(null);
  const [condSaving, setCondSaving] = useState(false);

  // 表單 state
  const [form, setForm] = useState({
    model_display_name: car?.model_display_name ?? "",
    year: String(car?.year ?? new Date().getFullYear()),
    color: car?.color ?? "",
    color_hex: car?.color_hex ?? "",
    mileage_km: String(car?.mileage_km ?? "0"),
    acquisition_price: String(car?.acquisition_price ?? ""),
    listing_price: String(car?.listing_price ?? ""),
    cost: String(car?.cost ?? ""),
    margin: String(car?.margin ?? ""),
    acquisition_source: (car?.acquisition_source ?? "") as UsedCarAcquisitionSource | "",
    acquisition_date: car?.acquisition_date ?? "",
    listed_date: car?.listed_date ?? "",
    condition_grade: (car?.condition_grade ?? "") as UsedCarConditionGrade | "",
    lien_cleared: car?.lien_cleared === true ? "true" : car?.lien_cleared === false ? "false" : "",
    inspection_due_date: car?.inspection_due_date ?? "",
    note: car?.note ?? "",
    vin: car?.vin ?? "",
    license_plate: car?.license_plate ?? "",
  });

  useSetPageHeader({
    title: "中古車庫存",
    breadcrumb: [
      { label: "展廳接待", href: "/sales/showroom" },
      { label: "中古車庫存", href: "/sales/showroom/used-cars" },
      { label: mode === "create" ? "新增" : (car?.model_display_name ?? "—") },
    ],
  });

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
  }

  function resetForm(src: UsedCarInventoryRow | null) {
    setForm({
      model_display_name: src?.model_display_name ?? "",
      year: String(src?.year ?? new Date().getFullYear()),
      color: src?.color ?? "",
      color_hex: src?.color_hex ?? "",
      mileage_km: String(src?.mileage_km ?? "0"),
      acquisition_price: String(src?.acquisition_price ?? ""),
      listing_price: String(src?.listing_price ?? ""),
      cost: String(src?.cost ?? ""),
      margin: String(src?.margin ?? ""),
      acquisition_source: (src?.acquisition_source ?? "") as UsedCarAcquisitionSource | "",
      acquisition_date: src?.acquisition_date ?? "",
      listed_date: src?.listed_date ?? "",
      condition_grade: (src?.condition_grade ?? "") as UsedCarConditionGrade | "",
      lien_cleared:
        src?.lien_cleared === true ? "true" : src?.lien_cleared === false ? "false" : "",
      inspection_due_date: src?.inspection_due_date ?? "",
      note: src?.note ?? "",
      vin: src?.vin ?? "",
      license_plate: src?.license_plate ?? "",
    });
  }

  // ── 儲存（edit mode）──
  function handleSave() {
    if (!form.model_display_name.trim()) {
      showBanner(false, "車款名稱不可為空");
      return;
    }
    startTransition(async () => {
      const patch = {
        model_display_name: form.model_display_name.trim(),
        year: parseInt(form.year) || new Date().getFullYear(),
        color: form.color || null,
        color_hex: form.color_hex || null,
        mileage_km: parseInt(form.mileage_km) || 0,
        acquisition_price: form.acquisition_price ? parseFloat(form.acquisition_price) : null,
        listing_price: form.listing_price ? parseFloat(form.listing_price) : null,
        cost: form.cost ? parseFloat(form.cost) : null,
        margin: form.margin ? parseFloat(form.margin) : null,
        acquisition_source: (form.acquisition_source || null) as UsedCarAcquisitionSource | null,
        acquisition_date: form.acquisition_date || null,
        listed_date: form.listed_date || null,
        condition_grade: (form.condition_grade || null) as UsedCarConditionGrade | null,
        lien_cleared:
          form.lien_cleared === "true" ? true : form.lien_cleared === "false" ? false : null,
        inspection_due_date: form.inspection_due_date || null,
        note: form.note || null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
      };
      const res = await updateUsedCarAction(car!.id, patch);
      if (res.ok) {
        showBanner(true, "✓ 已儲存");
        setMode("view");
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 建立（create mode）──
  function handleCreate() {
    if (!form.model_display_name.trim()) {
      showBanner(false, "車款名稱不可為空");
      return;
    }
    startTransition(async () => {
      const input = {
        brand_id: brandId,
        model_display_name: form.model_display_name.trim(),
        year: parseInt(form.year) || new Date().getFullYear(),
        color: form.color || null,
        color_hex: form.color_hex || null,
        mileage_km: parseInt(form.mileage_km) || 0,
        acquisition_price: form.acquisition_price ? parseFloat(form.acquisition_price) : null,
        listing_price: form.listing_price ? parseFloat(form.listing_price) : null,
        cost: form.cost ? parseFloat(form.cost) : null,
        margin: form.margin ? parseFloat(form.margin) : null,
        acquisition_source: (form.acquisition_source || null) as UsedCarAcquisitionSource | null,
        acquisition_date: form.acquisition_date || null,
        listed_date: form.listed_date || null,
        condition_grade: (form.condition_grade || null) as UsedCarConditionGrade | null,
        lien_cleared:
          form.lien_cleared === "true" ? true : form.lien_cleared === "false" ? false : null,
        inspection_due_date: form.inspection_due_date || null,
        note: form.note || null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
        status: "available" as UsedCarDbStatus,
      };
      const res = await createUsedCarAction(input);
      if (res.ok) {
        showBanner(true, "✓ 建立成功");
        router.push(`/sales/showroom/used-cars/${res.data.id}`);
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 刪除 ──
  function handleDelete() {
    if (!car) return;
    if (!confirm(`確定要刪除「${car.model_display_name}」嗎？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteUsedCarAction(car.id);
      if (res.ok) {
        router.push("/sales/showroom/used-cars");
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 狀態切換 ──
  function handleSetStatus(newStatus: UsedCarDbStatus) {
    if (!car) return;
    startTransition(async () => {
      const res = await setUsedCarStatusAction(car.id, newStatus);
      if (res.ok) {
        showBanner(true, `✓ 狀態已更新為「${USED_CAR_DB_STATUS_LABELS[newStatus]}」`);
        setShowStatusModal(false);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 輪9 車況說明書儲存 ──
  async function handleSaveConditionReport() {
    if (!car) return;
    setCondSaving(true);
    try {
      const res = await saveConditionReportAction({
        used_car_id: car.id,
        modification: condReport.modification,
        odometer_reliable: condReport.odometer_reliable,
        inspection_summary: condReport.inspection_summary,
        additional_notes: condReport.additional_notes,
        source_pdi_id: condReport.source_pdi_id,
        customer_signature: condSigDataUrl ?? condReport.customer_signature_url,
        brand_id: brandId,
      });
      if (res.ok) {
        showBanner(true, "✓ 車況說明書已儲存");
        setCondSigDataUrl(null);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    } finally {
      setCondSaving(false);
    }
  }

  const daysInStock = car
    ? calcDaysInStock(car.listed_date, car.status === "sold" ? car.sold_date : null)
    : 0;

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* ── Breadcrumb + CRUD Pill Bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/sales/showroom/used-cars" className="hover:text-[#185FA5]">
            中古車庫存
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">
            {isCreating ? "新增中古車" : (car?.model_display_name ?? "—")}
          </span>
          {isEditing && (
            <span className="ml-1 px-1.5 py-0.5 text-[10.5px] rounded bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {isCreating && (
            <span className="ml-1 px-1.5 py-0.5 text-[10.5px] rounded bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {isViewing && (
            <>
              <Link
                href="/sales/showroom/used-cars"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                onClick={() => {
                  resetForm(null);
                  setMode("create");
                }}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                disabled={isPending}
              >
                ＋ 新增
              </button>
              <button
                onClick={() => setMode("edit")}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                disabled={isPending || !car}
              >
                修改
              </button>
              <button
                onClick={handleDelete}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                disabled={isPending || !car}
              >
                刪除
              </button>
              <button
                onClick={() => setShowStatusModal(true)}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                disabled={isPending || !car}
              >
                切換狀態
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                onClick={() => setMode("view")}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                disabled={isPending}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {isCreating && (
            <>
              <button
                onClick={() => {
                  if (car) {
                    resetForm(car);
                    setMode("view");
                  } else {
                    router.push("/sales/showroom/used-cars");
                  }
                }}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                disabled={isPending}
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Title Card ── */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">中古車庫存</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? "（未命名中古車）" : (car?.model_display_name ?? "—")}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {!isCreating && car?.year && (
                  <span className="font-mono text-[#5A5955]">{car.year} 年</span>
                )}
                {!isCreating && car?.condition_grade && (
                  <span
                    className={
                      "px-1.5 py-0.5 rounded-md text-[11px] font-bold " +
                      (GRADE_CHIP[car.condition_grade] ?? "bg-[#9A9890] text-white")
                    }
                  >
                    Grade {car.condition_grade}
                  </span>
                )}
                {!isCreating && car?.status && (
                  <span
                    className={
                      "px-1.5 py-0.5 rounded-md text-[11px] font-semibold " +
                      (STATUS_CHIP[car.status] ?? "")
                    }
                  >
                    {statusLabel(car.status)}
                  </span>
                )}
                {isCreating && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
            {/* 快速 KPI */}
            {!isCreating && car && (
              <div className="flex gap-4 flex-wrap mt-1">
                <div>
                  <div className="text-[11px] text-[#9A9890]">在庫天數</div>
                  <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                    {daysInStock} 天
                  </div>
                </div>
                {car.listing_price && (
                  <div>
                    <div className="text-[11px] text-[#9A9890]">售價</div>
                    <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                      NT$ {car.listing_price.toLocaleString()}
                    </div>
                  </div>
                )}
                {car.mileage_km != null && (
                  <div>
                    <div className="text-[11px] text-[#9A9890]">里程</div>
                    <div className="text-[15px] font-bold font-mono text-[#2C2C2A]">
                      {car.mileage_km.toLocaleString()} km
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 圖片框 */}
          <div className="shrink-0">
            {isCreating ? (
              <div className="w-[280px] h-[180px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
                建立後可上傳車輛照片
              </div>
            ) : car ? (
              <EntityImageGallery
                entity="used-car"
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

      {/* ── 基本資料區段 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4">
          {isViewing ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="車款名稱" value={car?.model_display_name} />
              <Kv label="年份" value={car?.year} mono />
              <Kv label="顏色" value={
                car?.color ? (
                  <span className="flex items-center gap-1.5">
                    {car.color_hex && (
                      <span className="w-3 h-3 rounded-full border border-[#D5D3CB]" style={{ background: car.color_hex }} />
                    )}
                    {car.color}
                  </span>
                ) : "—"
              } />
              <Kv label="里程 (km)" value={car?.mileage_km != null ? car.mileage_km.toLocaleString() : "—"} mono />
              <Kv label="VIN" value={car?.vin} mono />
              <Kv label="車牌號碼" value={car?.license_plate} mono />
              <Kv label="等級" value={
                car?.condition_grade ? (
                  <span className={"px-1.5 py-0.5 rounded-md text-[11px] font-bold " + (GRADE_CHIP[car.condition_grade] ?? "")}>
                    {car.condition_grade}
                  </span>
                ) : "—"
              } />
              <Kv label="狀態" value={
                car?.status ? (
                  <span className={"px-1.5 py-0.5 rounded-md text-[11px] font-semibold " + (STATUS_CHIP[car.status] ?? "")}>
                    {statusLabel(car.status)}
                  </span>
                ) : "—"
              } />
              <Kv label="備註" value={car?.note} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
              <div className="md:col-span-2 flex flex-col gap-1">
                <label className={labelClass}>車款名稱 *</label>
                <input
                  className={inputClass}
                  value={form.model_display_name}
                  onChange={(e) => setForm({ ...form, model_display_name: e.target.value })}
                  placeholder="例：Panigale V4 S"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>年份 *</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  min={1990}
                  max={new Date().getFullYear() + 1}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>顏色</label>
                <input
                  className={inputClass}
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="例：紅"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>顏色 HEX</label>
                <input
                  className={inputClass}
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  placeholder="#C8001A"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>里程 (km)</label>
                <input
                  type="number"
                  className={inputClass}
                  value={form.mileage_km}
                  onChange={(e) => setForm({ ...form, mileage_km: e.target.value })}
                  min={0}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>VIN</label>
                <input
                  className={inputClass}
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value })}
                  placeholder="車架號碼"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>車牌號碼</label>
                <input
                  className={inputClass}
                  value={form.license_plate}
                  onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>等級</label>
                <select
                  className={inputClass}
                  value={form.condition_grade}
                  onChange={(e) => setForm({ ...form, condition_grade: e.target.value as UsedCarConditionGrade | "" })}
                >
                  <option value="">— 請選擇 —</option>
                  {USED_CAR_GRADE_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 md:col-span-3">
                <label className={labelClass}>備註</label>
                <textarea
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full resize-none"
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 價格與收購區段 ── */}
      {!isCreating && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 價格與收購</span>
          </header>
          <div className="px-4 py-4">
            {isViewing ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                <Kv label="收購成本 (NT$)" value={car?.cost != null ? car.cost.toLocaleString() : "—"} mono />
                <Kv label="收購價 (NT$)" value={car?.acquisition_price != null ? car.acquisition_price.toLocaleString() : "—"} mono />
                <Kv label="售價 (NT$)" value={car?.listing_price != null ? car.listing_price.toLocaleString() : "—"} mono />
                <Kv label="毛利 (NT$)" value={car?.margin != null ? car.margin.toLocaleString() : "—"} mono />
                <Kv label="收購來源" value={car?.acquisition_source ? USED_CAR_ACQUISITION_SOURCE_LABELS[car.acquisition_source] : "—"} />
                <Kv label="收購日期" value={car?.acquisition_date} mono />
                <Kv label="上架日期" value={car?.listed_date} mono />
                <Kv label="售出日期" value={car?.sold_date} mono />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>收購成本 (NT$)</label>
                  <input type="number" className={inputClass} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>收購價 (NT$)</label>
                  <input type="number" className={inputClass} value={form.acquisition_price} onChange={(e) => setForm({ ...form, acquisition_price: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>售價 (NT$)</label>
                  <input type="number" className={inputClass} value={form.listing_price} onChange={(e) => setForm({ ...form, listing_price: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>毛利 (NT$)</label>
                  <input type="number" className={inputClass} value={form.margin} onChange={(e) => setForm({ ...form, margin: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>收購來源</label>
                  <select className={inputClass} value={form.acquisition_source} onChange={(e) => setForm({ ...form, acquisition_source: e.target.value as UsedCarAcquisitionSource | "" })}>
                    <option value="">— 請選擇 —</option>
                    {Object.entries(USED_CAR_ACQUISITION_SOURCE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>收購日期</label>
                  <input type="date" className={inputClass} value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>上架日期</label>
                  <input type="date" className={inputClass} value={form.listed_date} onChange={(e) => setForm({ ...form, listed_date: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 建立提示（create mode 下隱藏 tabs）*/}
      {isCreating && (
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#9A9890]">
          建立後將跳轉到該中古車的詳情頁，可進一步維護動保、年審、業務推薦等欄位。
        </div>
      )}

      {/* ── Tabs（view/edit 模式才顯示）── */}
      {!isCreating && (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
            <div className="flex border-b border-[#EEECE6]">
              <button
                onClick={() => setActiveTab("business")}
                className={
                  "px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] " +
                  (activeTab === "business"
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]")
                }
              >
                業務資訊
              </button>
              <button
                onClick={() => setActiveTab("condition_report")}
                className={
                  "px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] " +
                  (activeTab === "condition_report"
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]")
                }
              >
                車況說明書
                {condReport.customer_acknowledged_at && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[#EAF3DE] text-[#3B6D11]">
                    已簽署
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 業務資訊 tab 內容 */}
          {activeTab === "business" && (
            <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
              {isViewing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                      <h2 className="text-[13px] font-semibold text-[#2C2C2A]">動保 / 年審</h2>
                    </header>
                    <div className="px-4 py-3 grid grid-cols-2 gap-3">
                      <Kv label="動保塗銷" value={
                        car?.lien_cleared === true ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">已清償</span>
                        ) : car?.lien_cleared === false ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">未清償</span>
                        ) : "—"
                      } />
                      <Kv label="年審到期日" value={car?.inspection_due_date} mono />
                    </div>
                  </section>
                  <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                      <h2 className="text-[13px] font-semibold text-[#2C2C2A]">衍生業務推薦</h2>
                    </header>
                    <div className="px-4 py-3">
                      {car?.recommended_services && car.recommended_services.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {car.recommended_services.map((t) => (
                            <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5]">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#9A9890]">尚無推薦</span>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>動保塗銷</label>
                    <select
                      className={inputClass}
                      value={form.lien_cleared}
                      onChange={(e) => setForm({ ...form, lien_cleared: e.target.value })}
                    >
                      <option value="">— 未知 —</option>
                      <option value="true">已清償</option>
                      <option value="false">未清償</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>年審到期日</label>
                    <input
                      type="date"
                      className={inputClass}
                      value={form.inspection_due_date}
                      onChange={(e) => setForm({ ...form, inspection_due_date: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 輪9 車況說明書 tab 內容 */}
          {activeTab === "condition_report" && (
            <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-4">
              {/* 技師欄位（唯讀，前端顯示但不可編輯）*/}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">技師評估（唯讀）</h2>
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B]">
                    技師填寫，業務員不可更改
                  </span>
                </header>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Kv label="事故歷史" value={
                    condReport.accident_history === true ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">有事故記錄</span>
                    ) : condReport.accident_history === false ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">無事故記錄</span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68]">尚未評估</span>
                    )
                  } />
                  <Kv label="泡水記錄" value={
                    condReport.flood_damage === true ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">有泡水記錄</span>
                    ) : condReport.flood_damage === false ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">無泡水記錄</span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68]">尚未評估</span>
                    )
                  } />
                </div>
              </section>

              {/* 業務員可編輯欄位 */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">車況說明</h2>
                </header>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>改裝 / 改色</label>
                    <input
                      className={inputClass}
                      value={condReport.modification ?? ""}
                      onChange={(e) => setCondReport({ ...condReport, modification: e.target.value || null })}
                      placeholder="例：原廠排氣管、貼膜"
                      disabled={condSaving}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>里程可信度</label>
                    <select
                      className={inputClass}
                      value={condReport.odometer_reliable === null ? "" : String(condReport.odometer_reliable)}
                      onChange={(e) => setCondReport({
                        ...condReport,
                        odometer_reliable: e.target.value === "" ? null : e.target.value === "true",
                      })}
                      disabled={condSaving}
                    >
                      <option value="">— 未評估 —</option>
                      <option value="true">可信</option>
                      <option value="false">存疑</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className={labelClass}>整體車況摘要</label>
                    <textarea
                      className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full resize-none"
                      rows={3}
                      value={condReport.inspection_summary ?? ""}
                      onChange={(e) => setCondReport({ ...condReport, inspection_summary: e.target.value || null })}
                      placeholder="整體車況描述（例：外觀良好，引擎聲音正常…）"
                      disabled={condSaving}
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className={labelClass}>附加說明</label>
                    <textarea
                      className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full resize-none"
                      rows={2}
                      value={condReport.additional_notes ?? ""}
                      onChange={(e) => setCondReport({ ...condReport, additional_notes: e.target.value || null })}
                      placeholder="其他注意事項…"
                      disabled={condSaving}
                    />
                  </div>
                </div>
              </section>

              {/* 客戶確認 / 簽名 */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">客戶確認簽名</h2>
                </header>
                <div className="px-4 py-3 space-y-3">
                  {/* 法律效果提示文字 — 從 legal_text_templates(condition_report_disclaimer) 讀取 */}
                  <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-3 py-2.5 text-[12px] text-[#854F0B] leading-relaxed whitespace-pre-wrap">
                    <b>客戶簽署前請詳閱：</b>
                    <br />
                    {disclaimerText ?? "本說明書所載車輛狀況（含事故歷史、泡水記錄、里程可信度）係依現狀告知。簽署即表示您已知情，依法不得再以此為由要求退車 / 減價。"}
                  </div>

                  {condReport.customer_acknowledged_at ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">
                        已簽署
                      </span>
                      <span className="text-[12px] text-[#9A9890]">
                        {new Date(condReport.customer_acknowledged_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                      </span>
                      {condReport.customer_signature_url && (
                        <a
                          href={condReport.customer_signature_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11.5px] text-[#185FA5] underline"
                        >
                          檢視簽名
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] text-[#9A9890]">尚未取得客戶簽名</div>
                  )}

                  {/* 簽名上傳（dataUrl 由外部 signature canvas 帶入，這裡做 file input 備案）*/}
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>上傳簽名圖檔（JPEG / PNG）</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="text-[12px] text-[#5A5955]"
                      disabled={condSaving}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setCondSigDataUrl(ev.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    {condSigDataUrl && (
                      <div className="mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={condSigDataUrl} alt="簽名預覽" className="h-[80px] border border-[#D5D3CB] rounded object-contain bg-white" />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 儲存按鈕 */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleSaveConditionReport}
                  disabled={condSaving || !car}
                  className={
                    "h-[32px] px-5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 " +
                    (condSaving ? "pointer-events-none" : "")
                  }
                >
                  {condSaving ? "儲存中⋯" : "儲存車況說明書"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 狀態切換 Modal ── */}
      <Modal
        open={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="切換狀態"
      >
        <div className="space-y-2">
          {USED_CAR_STATUS_OPTIONS.filter((o) => o.value).map((o) => (
            <button
              key={o.value}
              onClick={() => handleSetStatus(o.value as UsedCarDbStatus)}
              disabled={isPending || car?.status === o.value}
              className={
                "w-full text-left h-[36px] px-4 rounded text-[12.5px] border transition " +
                (car?.status === o.value
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C] font-semibold cursor-default"
                  : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] hover:bg-[#F8F7F4]")
              }
            >
              {o.label}
              {car?.status === o.value && " ← 目前狀態"}
            </button>
          ))}
        </div>
        {isPending && (
          <p className="mt-3 text-[12px] text-[#9A9890] text-center">切換中⋯</p>
        )}
      </Modal>

      {/* ── Banner ── */}
      {banner && (
        <div
          className={
            "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 " +
            (banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]")
          }
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}
