"use client";

import { useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";

export function Confirm1View({ delivery }: { delivery: DeliveryRow }) {
  const confirmed = Boolean(delivery.step_completion?.confirm1);
  const [form, setForm] = useState({
    customer_name: delivery.customer_name ?? "",
    customer_phone: delivery.customer_phone ?? "",
    customer_email: delivery.customer_email ?? "",
    customer_address: delivery.customer_address ?? "",
    vin: delivery.vin ?? "",
    scheduled_delivery_date: delivery.scheduled_delivery_date ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const inputCls =
    "w-full h-[32px] px-2.5 rounded border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none";

  async function handleNext(): Promise<boolean> {
    setErr(null);
    const res = await updateDeliveryStepAction(
      delivery.id,
      "confirm1",
      { ...form, confirmedOrder: true },
      "pdi_in_progress",
    );
    if (!res.ok) {
      setErr(res.error);
      return false;
    }
    return true;
  }

  return (
    <DeliveryFrame
      stepId={1}
      delivery={delivery}
      stepDone={confirmed}
      nextLabel={confirmed ? "已覆核 → PDI 整備 →" : "完成覆核 → PDI 整備 →"}
      onNext={handleNext}
    >
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="confirm1-order-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#EAF4FB] inline-flex items-center justify-center text-[13px]">
            📋
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              訂單覆核資料
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              從銷售訂單帶下 · 交車前再次確認資訊正確
            </div>
          </div>
          <span
            className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold ${
              confirmed
                ? "bg-[#E1F5EE] text-[#0F6E56]"
                : "bg-[#F1EFE8] text-[#5A5955]"
            }`}
            data-testid="confirm1-order-status"
          >
            {confirmed ? "✓ 已覆核" : "待覆核"}
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field
            label="客戶姓名"
            testId="confirm1-input-customer-name"
            value={form.customer_name}
            onChange={(v) => set("customer_name", v)}
            input={inputCls}
          />
          <Field
            label="手機號碼"
            testId="confirm1-input-customer-phone"
            value={form.customer_phone}
            onChange={(v) => set("customer_phone", v)}
            input={inputCls}
          />
          <Field
            label="電子郵件"
            testId="confirm1-input-customer-email"
            value={form.customer_email}
            onChange={(v) => set("customer_email", v)}
            input={inputCls}
          />
          <Field
            label="通訊地址"
            testId="confirm1-input-customer-address"
            value={form.customer_address}
            onChange={(v) => set("customer_address", v)}
            input={inputCls}
          />
          <Field
            label="訂購車款"
            value={delivery.vehicle_model_name ?? ""}
            input={inputCls}
            readOnly
          />
          <Field
            label="車身顏色"
            value={delivery.vehicle_color ?? ""}
            input={inputCls}
            readOnly
          />
          <Field
            label="車身號碼（VIN）"
            testId="confirm1-input-vin"
            value={form.vin}
            onChange={(v) => set("vin", v.toUpperCase())}
            input={`${inputCls} font-mono`}
          />
          <Field
            label="交車單號"
            value={delivery.delivery_no}
            input={`${inputCls} font-mono`}
            readOnly
          />
          <Field
            label="銷售顧問"
            value={delivery.rs_name ?? ""}
            input={inputCls}
            readOnly
          />
          <Field
            label="預定交車日"
            type="date"
            value={form.scheduled_delivery_date}
            onChange={(v) => set("scheduled_delivery_date", v)}
            input={inputCls}
          />
        </div>
      </section>

      <section className="bg-[#FDF3E3] border border-[#F2D9A0] rounded-lg px-4 py-3 text-[12px] text-[#854F0B] leading-relaxed">
        <b>覆核提醒</b>：請逐欄確認訂單帶下的客戶 / 車輛資訊正確。完成覆核後將
        進入 PDI 整備階段（status → PDI 進行中）。
      </section>

      {err && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          data-testid="confirm1-error"
        >
          {err}
        </div>
      )}
    </DeliveryFrame>
  );
}

function Field({
  label,
  value,
  onChange,
  input,
  type,
  readOnly,
  testId,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  input: string;
  type?: string;
  readOnly?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <input
        type={type ?? "text"}
        className={`${input} ${
          readOnly ? "bg-[#F4F3F0] text-[#5A5955] cursor-not-allowed" : ""
        }`}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
