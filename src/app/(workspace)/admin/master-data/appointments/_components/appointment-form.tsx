"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_APPOINTMENT_FORM_STATE,
  type AppointmentFormState,
} from "@/lib/master-data/appointment-form-types";
import type {
  Customer,
  CustomerVehicle,
  Employee,
  ServiceAppointment,
} from "@/lib/parts/types";

const STATUS_OPTIONS = [
  { value: "booked", label: "已預約" },
  { value: "checked_in", label: "已報到" },
  { value: "in_progress", label: "施工中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "no_show", label: "未到場" },
];

const SERVICE_TYPE_OPTIONS = [
  { value: "general", label: "一般保養" },
  { value: "scheduled_maintenance", label: "定期保養" },
  { value: "repair", label: "維修" },
  { value: "pdi", label: "PDI 交車前檢驗" },
  { value: "other", label: "其他" },
];

type Action = (
  prev: AppointmentFormState,
  fd: FormData,
) => Promise<AppointmentFormState>;

/**
 * 把 ISO timestamptz（UTC）轉成 <input type="datetime-local"> 在 Asia/Taipei 顯示的格式。
 * 該 input 不認 Z / timezone offset，要用 YYYY-MM-DDTHH:mm。
 * 強制 Asia/Taipei，避免 SSR (server UTC) vs CSR (browser local) 不一致。
 */
function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  // toLocaleString sv-SE 給 ISO-ish 'YYYY-MM-DD HH:mm:ss' 格式
  const taipei = new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });
  // 'YYYY-MM-DD HH:mm:ss' → 'YYYY-MM-DDTHH:mm'
  return taipei.replace(" ", "T").slice(0, 16);
}

export function AppointmentForm({
  mode,
  action,
  appointment,
  customers,
  vehicles,
  advisors,
}: {
  mode: "create" | "edit";
  action: Action;
  appointment?: ServiceAppointment | null;
  customers: Customer[];
  vehicles: CustomerVehicle[];
  advisors: Employee[];
}) {
  const [state, formAction] = useActionState<AppointmentFormState, FormData>(
    action,
    EMPTY_APPOINTMENT_FORM_STATE,
  );

  const submitIdle = mode === "create" ? "建立預約" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {appointment && <input type="hidden" name="id" value={appointment.id} />}

      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{state.error}</strong>
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Combobox
          name="customer_id"
          label="車主（客戶）"
          required
          placeholder="搜尋姓名 / 代碼 / 電話…"
          defaultValue={appointment?.customer_id ?? ""}
          options={customers.map((c) => ({
            value: c.id,
            label: c.name,
            hint: [c.code, c.phone].filter(Boolean).join(" · "),
          }))}
          error={fe.customer_id}
        />
        <Combobox
          name="vehicle_id"
          label="車輛"
          placeholder="搜尋車牌 / VIN…"
          defaultValue={appointment?.vehicle_id ?? ""}
          options={vehicles.map((v) => ({
            value: v.id,
            label: v.license_plate ?? v.vin ?? v.id.slice(0, 8),
            hint: [v.vin, v.color].filter(Boolean).join(" · "),
          }))}
          hint="非必填；不知道是哪台車可空著"
          error={fe.vehicle_id}
        />
        <FormField
          name="appt_no"
          label="預約單號"
          defaultValue={appointment?.appt_no ?? ""}
          placeholder="留空自動產生"
          hint="同 brand 內唯一；可手動指定，留空走自動編號"
          error={fe.appt_no}
        />
        <FormField
          name="scheduled_at"
          label="預約時間"
          type="datetime-local"
          required
          defaultValue={isoToLocal(appointment?.scheduled_at)}
          error={fe.scheduled_at}
        />
        <FormField
          name="duration_minutes"
          label="預估時長"
          type="number"
          inputMode="numeric"
          defaultValue={appointment?.duration_minutes ?? 60}
          suffix="分鐘"
          error={fe.duration_minutes}
        />
        <SelectField
          name="service_type"
          label="服務類型"
          required
          defaultValue={appointment?.service_type ?? "general"}
          options={SERVICE_TYPE_OPTIONS}
          error={fe.service_type}
        />
        <FormField
          name="mileage_at_appointment"
          label="預約當下里程"
          type="number"
          inputMode="decimal"
          defaultValue={appointment?.mileage_at_appointment ?? ""}
          suffix="km"
          hint="若客戶已告知當前里程"
          error={fe.mileage_at_appointment}
        />
        <SelectField
          name="status"
          label="狀態"
          required
          defaultValue={appointment?.status ?? "booked"}
          options={STATUS_OPTIONS}
          error={fe.status}
        />
        <SelectField
          name="advisor_id"
          label="服務顧問"
          defaultValue={appointment?.advisor_id ?? ""}
          options={advisors.map((a) => ({
            value: a.id,
            label: a.name,
            hint: [a.emp_code, a.position].filter(Boolean).join(" · "),
          }))}
          hint="負責此次預約的 SA；非必填"
          error={fe.advisor_id}
        />
      </div>

      <FormField
        name="notes"
        label="備註"
        multiline
        rows={3}
        defaultValue={appointment?.notes ?? ""}
        placeholder="客戶要求、特殊狀況..."
      />

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/appointments"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
