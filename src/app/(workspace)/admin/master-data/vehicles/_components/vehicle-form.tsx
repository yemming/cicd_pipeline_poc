"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createVehicleAction,
  updateVehicleAction,
  type VehicleInput,
} from "@/lib/master-data/vehicle-actions";
import type { VehicleFieldKey } from "@/lib/master-data/vehicle-form-types";
import type {
  Customer,
  CustomerVehicle,
  Employee,
  VehicleModel,
} from "@/lib/parts/types";

const ACQUIRED_FROM_OPTIONS = [
  { value: "new", label: "新車購入" },
  { value: "transfer", label: "車主轉讓" },
  { value: "used", label: "中古車" },
  { value: "import", label: "灰色進口" },
  { value: "other", label: "其他" },
];

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function VehicleForm({
  mode,
  vehicle,
  customers,
  models,
  technicians,
}: {
  mode: "create" | "edit";
  vehicle?: CustomerVehicle | null;
  customers: Customer[];
  models: VehicleModel[];
  technicians: Employee[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<VehicleFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立車輛" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: VehicleInput = {
      customer_id: String(fd.get("customer_id") ?? "").trim(),
      model_id: strOrNull(fd.get("model_id")),
      vin: strOrNull(fd.get("vin")),
      license_plate: strOrNull(fd.get("license_plate")),
      engine_no: strOrNull(fd.get("engine_no")),
      color: strOrNull(fd.get("color")),
      manufactured_year: intOrNull(fd.get("manufactured_year")),
      acquired_from: (strOrNull(fd.get("acquired_from")) ?? "new") as VehicleInput["acquired_from"],
      purchase_date: strOrNull(fd.get("purchase_date")),
      purchase_amount: numOrNull(fd.get("purchase_amount")),
      current_mileage: numOrNull(fd.get("current_mileage")),
      last_service_date: strOrNull(fd.get("last_service_date")),
      last_service_mileage: numOrNull(fd.get("last_service_mileage")),
      next_service_due_date: strOrNull(fd.get("next_service_due_date")),
      next_service_due_mileage: numOrNull(fd.get("next_service_due_mileage")),
      warranty_until: strOrNull(fd.get("warranty_until")),
      insurance_company: strOrNull(fd.get("insurance_company")),
      insurance_policy_no: strOrNull(fd.get("insurance_policy_no")),
      insurance_until: strOrNull(fd.get("insurance_until")),
      preferred_technician_id: strOrNull(fd.get("preferred_technician_id")),
      notes: strOrNull(fd.get("notes")),
      is_active: fd.get("is_active") === "on",
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createVehicleAction(input)
          : await updateVehicleAction(vehicle!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立車輛" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/vehicles");
      } else {
        router.refresh();
      }
    });
  };

  const fe = fieldErrors;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{error}</strong>
          {Object.keys(fe).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60 space-y-6" : "space-y-6"}
      >
        {/* 車主與車型 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            車主與車型
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Combobox
              name="customer_id"
              label="車主（客戶）"
              required
              placeholder="搜尋姓名 / 代碼 / 統編 / 電話…"
              defaultValue={vehicle?.customer_id ?? ""}
              options={customers.map((c) => ({
                value: c.id,
                label: c.name,
                hint: [c.code, c.tax_id, c.phone].filter(Boolean).join(" · "),
              }))}
              error={fe.customer_id}
            />
            <Combobox
              name="model_id"
              label="車型"
              placeholder="搜尋車系 / 名稱…"
              defaultValue={vehicle?.model_id ?? ""}
              options={models.map((m) => ({
                value: m.id,
                label: m.display_name,
                hint: m.series,
              }))}
              error={fe.model_id}
            />
          </div>
        </section>

        {/* 車輛識別 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            車輛識別
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="vin"
              label="VIN（車輛識別號）"
              defaultValue={vehicle?.vin ?? ""}
              placeholder="17 字元，無資料可空白"
              hint="同 brand 內 VIN 唯一"
              error={fe.vin}
            />
            <FormField
              name="license_plate"
              label="車牌"
              defaultValue={vehicle?.license_plate ?? ""}
              placeholder="ABC-1234"
              error={fe.license_plate}
            />
            <FormField
              name="engine_no"
              label="引擎號碼"
              defaultValue={vehicle?.engine_no ?? ""}
              error={fe.engine_no}
            />
            <FormField
              name="color"
              label="顏色"
              defaultValue={vehicle?.color ?? ""}
              placeholder="例：Ducati Red"
              error={fe.color}
            />
            <FormField
              name="manufactured_year"
              label="出廠年份"
              type="number"
              inputMode="numeric"
              defaultValue={vehicle?.manufactured_year ?? ""}
              placeholder="例：2024"
              error={fe.manufactured_year}
            />
          </div>
        </section>

        {/* 取得 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            取得來源
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <SelectField
              name="acquired_from"
              label="來源"
              required
              defaultValue={vehicle?.acquired_from ?? "new"}
              options={ACQUIRED_FROM_OPTIONS}
              error={fe.acquired_from}
            />
            <FormField
              name="purchase_date"
              label="購入日"
              type="date"
              defaultValue={vehicle?.purchase_date ?? ""}
              error={fe.purchase_date}
            />
            <FormField
              name="purchase_amount"
              label="購入金額"
              type="number"
              inputMode="decimal"
              defaultValue={vehicle?.purchase_amount ?? ""}
              placeholder="0.00"
              prefix="NT$"
              error={fe.purchase_amount}
            />
          </div>
        </section>

        {/* 里程與保養 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            里程與保養
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="current_mileage"
              label="目前里程"
              type="number"
              inputMode="decimal"
              defaultValue={vehicle?.current_mileage ?? ""}
              suffix="km"
              error={fe.current_mileage}
            />
            <div />
            <FormField
              name="last_service_date"
              label="上次保養日"
              type="date"
              defaultValue={vehicle?.last_service_date ?? ""}
              error={fe.last_service_date}
            />
            <FormField
              name="last_service_mileage"
              label="上次保養里程"
              type="number"
              inputMode="decimal"
              defaultValue={vehicle?.last_service_mileage ?? ""}
              suffix="km"
              error={fe.last_service_mileage}
            />
            <FormField
              name="next_service_due_date"
              label="下次保養期限"
              type="date"
              defaultValue={vehicle?.next_service_due_date ?? ""}
              error={fe.next_service_due_date}
            />
            <FormField
              name="next_service_due_mileage"
              label="下次保養里程"
              type="number"
              inputMode="decimal"
              defaultValue={vehicle?.next_service_due_mileage ?? ""}
              suffix="km"
              error={fe.next_service_due_mileage}
            />
          </div>
        </section>

        {/* 保固保險 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            保固與保險
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              name="warranty_until"
              label="原廠保固到"
              type="date"
              defaultValue={vehicle?.warranty_until ?? ""}
              error={fe.warranty_until}
            />
            <div />
            <FormField
              name="insurance_company"
              label="保險公司"
              defaultValue={vehicle?.insurance_company ?? ""}
              error={fe.insurance_company}
            />
            <FormField
              name="insurance_policy_no"
              label="保單號"
              defaultValue={vehicle?.insurance_policy_no ?? ""}
              error={fe.insurance_policy_no}
            />
            <FormField
              name="insurance_until"
              label="保險到期"
              type="date"
              defaultValue={vehicle?.insurance_until ?? ""}
              error={fe.insurance_until}
            />
          </div>
        </section>

        {/* 服務指派 */}
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            服務指派偏好
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              name="preferred_technician_id"
              label="專任技師"
              defaultValue={vehicle?.preferred_technician_id ?? ""}
              options={technicians.map((t) => ({
                value: t.id,
                label: t.name,
                hint: [t.emp_code, t.position].filter(Boolean).join(" · "),
              }))}
              hint="非必填；接保養 / 維修可優先派該員"
              error={fe.preferred_technician_id}
            />
          </div>
        </section>

        {/* 備註 */}
        <FormField
          name="notes"
          label="備註"
          multiline
          rows={3}
          defaultValue={vehicle?.notes ?? ""}
          placeholder="改裝項目、車況特殊事項..."
        />

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={vehicle?.is_active ?? true}
              className="w-4 h-4"
            />
            車輛仍由該客戶持有（轉手或報廢時取消勾選）
          </label>
        )}

        <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/vehicles"
            className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
          >
            取消
          </Link>
        </div>
      </fieldset>

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
    </form>
  );
}
