"use client";

import { useTransition } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { useDelivery } from "@/lib/delivery-store";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";

export function Confirm1View({ deliveryId }: { deliveryId?: string }) {
  const { state, patch } = useDelivery();
  const [, startTransition] = useTransition();

  const inputCls =
    "w-full h-[32px] px-2.5 rounded border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none";

  function handleNext() {
    if (!state.confirmedOrder) patch({ confirmedOrder: true });
    if (deliveryId) {
      startTransition(async () => {
        await updateDeliveryStepAction(deliveryId, "confirm1", {
          customer_name: state.customerName,
          customer_phone: state.customerPhone,
          customer_email: state.customerEmail,
          customer_address: state.customerAddress,
          vehicle_model_name: state.vehicleModel,
          vehicle_color: state.vehicleColor,
          vin: state.vin,
          rs_name: state.rsName,
          scheduled_delivery_date: state.deliveryDate,
          confirmedOrder: true,
        }, "pdi_in_progress");
      });
    }
  }

  return (
    <DeliveryFrame
      stepId={1}
      stepDone={state.confirmedOrder}
      nextLabel={
        state.confirmedOrder ? "已覆核 → PDI 整備 →" : "完成覆核 → PDI 整備 →"
      }
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
              從 RS04 訂單帶下 · 交車前再次確認資訊正確
            </div>
          </div>
          <span
            className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold ${
              state.confirmedOrder
                ? "bg-[#E1F5EE] text-[#0F6E56]"
                : "bg-[#F1EFE8] text-[#5A5955]"
            }`}
            data-testid="confirm1-order-status"
          >
            {state.confirmedOrder ? "✓ 已覆核" : "待覆核"}
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          <Field
            label="客戶姓名"
            testId="confirm1-input-customer-name"
            value={state.customerName}
            onChange={(v) => patch({ customerName: v })}
            input={inputCls}
          />
          <Field
            label="手機號碼"
            testId="confirm1-input-customer-phone"
            value={state.customerPhone}
            onChange={(v) => patch({ customerPhone: v })}
            input={inputCls}
          />
          <Field
            label="電子郵件"
            testId="confirm1-input-customer-email"
            value={state.customerEmail}
            onChange={(v) => patch({ customerEmail: v })}
            input={inputCls}
          />
          <Field
            label="通訊地址"
            testId="confirm1-input-customer-address"
            value={state.customerAddress}
            onChange={(v) => patch({ customerAddress: v })}
            input={inputCls}
          />
          <Field
            label="訂購車款"
            value={state.vehicleModel}
            onChange={(v) => patch({ vehicleModel: v })}
            input={inputCls}
            readOnly
          />
          <Field
            label="車身顏色"
            value={state.vehicleColor}
            onChange={(v) => patch({ vehicleColor: v })}
            input={inputCls}
            readOnly
          />
          <Field
            label="車身號碼（VIN）"
            testId="confirm1-input-vin"
            value={state.vin}
            onChange={(v) => patch({ vin: v.toUpperCase() })}
            input={`${inputCls} font-mono`}
          />
          <Field
            label="合約編號"
            value={state.contractNo}
            onChange={(v) => patch({ contractNo: v })}
            input={`${inputCls} font-mono`}
            readOnly
          />
          <Field
            label="銷售顧問"
            value={state.rsName}
            onChange={(v) => patch({ rsName: v })}
            input={inputCls}
            readOnly
          />
          <Field
            label="預定交車日"
            type="date"
            value={state.deliveryDate}
            onChange={(v) => patch({ deliveryDate: v })}
            input={inputCls}
          />
        </div>
      </section>

      <section className="bg-[#FDF3E3] border border-[#F2D9A0] rounded-lg px-4 py-3 text-[12px] text-[#854F0B] leading-relaxed">
        <b>覆核提醒</b>：請逐欄確認 RS04 帶下的客戶 / 車輛資訊正確。完成覆核後將
        進入 PDI 整備階段，建立 PD-IN 內部工單通知售後技師。
      </section>
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
  onChange: (v: string) => void;
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
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
