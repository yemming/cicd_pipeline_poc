"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createAppointmentAction,
  updateAppointmentAction,
  type AppointmentInput,
} from "@/lib/master-data/appointment-actions";
import type { AppointmentFieldKey } from "@/lib/master-data/appointment-form-types";
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

export function AppointmentForm({
  mode,
  appointment,
  customers,
  vehicles,
  advisors,
}: {
  mode: "create" | "edit";
  appointment?: ServiceAppointment | null;
  customers: Customer[];
  vehicles: CustomerVehicle[];
  advisors: Employee[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<AppointmentFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立預約" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: AppointmentInput = {
      customer_id: String(fd.get("customer_id") ?? "").trim(),
      vehicle_id: strOrNull(fd.get("vehicle_id")),
      appt_no: strOrNull(fd.get("appt_no")),
      scheduled_at: String(fd.get("scheduled_at") ?? "").trim(),
      duration_minutes: intOrNull(fd.get("duration_minutes")) ?? 60,
      service_type: (strOrNull(fd.get("service_type")) ?? "general") as AppointmentInput["service_type"],
      mileage_at_appointment: numOrNull(fd.get("mileage_at_appointment")),
      status: (strOrNull(fd.get("status")) ?? "booked") as AppointmentInput["status"],
      advisor_id: strOrNull(fd.get("advisor_id")),
      notes: strOrNull(fd.get("notes")),
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createAppointmentAction(input)
          : await updateAppointmentAction(appointment!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立預約" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/appointments");
      } else {
        router.refresh();
      }
    });
  };

  const fe = fieldErrors;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
        className={isPending ? "pointer-events-none opacity-60" : ""}
      >
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
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/appointments"
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
