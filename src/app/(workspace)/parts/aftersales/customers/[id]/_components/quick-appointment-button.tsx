"use client";

/**
 * 「預約下次保養」一鍵 modal — 人車檔案 detail page 用。
 *
 * 流程：
 *  1. 預設帶入 customer + 第一台車（next_service_due_date 若有，作日期 default）
 *  2. user 確認日期 / 時段 / 服務類型 → 送出 createAppointmentAction
 *  3. 成功 → toast + router.refresh
 *
 * 寫入走 `@/lib/aftersales/appointment-actions`，不直連 supabase。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createAppointmentAction } from "@/lib/aftersales/appointment-actions";

type VehicleLite = {
  id: string;
  license_plate: string | null;
  next_service_due_date: string | null;
};

const SERVICE_TYPE_OPTIONS = [
  "定保",
  "Desmo Service",
  "故障維修",
  "車主自費",
  "其他",
];

function todayInTpe(): string {
  // YYYY-MM-DD (assume Asia/Taipei runtime; for demo OK)
  return new Date().toISOString().slice(0, 10);
}

export function QuickAppointmentButton({
  customerId,
  customerName,
  vehicles,
  canEdit,
}: {
  customerId: string;
  customerName: string;
  vehicles: VehicleLite[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Form state
  const defaultVehicle = vehicles[0] ?? null;
  const [vehicleId, setVehicleId] = useState<string>(defaultVehicle?.id ?? "");
  const [date, setDate] = useState<string>(
    defaultVehicle?.next_service_due_date ?? todayInTpe(),
  );
  const [time, setTime] = useState<string>("10:00");
  const [serviceType, setServiceType] = useState<string>("定保");
  const [notes, setNotes] = useState<string>("");

  function reset() {
    setVehicleId(defaultVehicle?.id ?? "");
    setDate(defaultVehicle?.next_service_due_date ?? todayInTpe());
    setTime("10:00");
    setServiceType("定保");
    setNotes("");
  }

  function submit() {
    if (!date || !time || !serviceType) {
      setBanner({ ok: false, msg: "請填寫日期 / 時段 / 服務類型" });
      return;
    }
    startTransition(async () => {
      const res = await createAppointmentAction({
        appointment_date: date,
        appointment_time: time,
        customer_id: customerId,
        vehicle_id: vehicleId || null,
        service_type: serviceType,
        notes: notes.trim() || null,
        source: "aftersales-customer-quick",
      });
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 預約已建立" });
        setTimeout(() => {
          setBanner(null);
          setOpen(false);
          reset();
          router.refresh();
        }, 1500);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!canEdit) return;
          reset();
          setBanner(null);
          setOpen(true);
        }}
        disabled={!canEdit}
        title={canEdit ? "建立下次保養預約" : "沒有建立預約的權限"}
        className={`h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium shadow-sm ${
          canEdit
            ? "bg-[#185FA5] text-white hover:bg-[#0F4A85]"
            : "bg-[#185FA5]/60 text-white pointer-events-none"
        }`}
      >
        📅 預約下次保養
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => !pending && setOpen(false)}
          />
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-[520px] mx-4">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                預約下次保養 — {customerName}
              </h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="ml-auto text-[#9A9890] hover:text-[#2C2C2A]"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>
            <div
              className={`px-4 py-4 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}
            >
              <Field label="車輛">
                <select
                  className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  disabled={vehicles.length === 0}
                >
                  {vehicles.length === 0 && (
                    <option value="">（此客戶名下尚無車輛）</option>
                  )}
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate ?? "未設車牌"}
                      {v.next_service_due_date
                        ? ` · 應保 ${v.next_service_due_date}`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="預約日期">
                  <input
                    type="date"
                    className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={todayInTpe()}
                  />
                </Field>
                <Field label="時段">
                  <input
                    type="time"
                    className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="服務類型">
                <select
                  className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                >
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="備註（選填）">
                <textarea
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white resize-none"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 客戶下班後 18:00 後可到廠"
                />
              </Field>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center gap-2">
              {banner && (
                <span
                  className={`text-[11.5px] ${banner.ok ? "text-[#3B6D11]" : "text-[#CC0000]"}`}
                >
                  {banner.msg}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  disabled={pending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                >
                  {pending ? "建立中⋯" : "建立預約"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
