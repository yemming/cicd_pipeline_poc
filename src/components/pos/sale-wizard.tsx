"use client";

import { useMemo, useState } from "react";
import { formatTWD, gpTone } from "@/lib/pos/format";
import type {
  SaleOrder,
  UsedVehicle,
  UsedVehicleSourceType,
} from "@/lib/pos/types";

type Step = 1 | 2 | 3 | 4;

function genOrderId(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `UC-SO-${n}`;
}

export function SaleWizard({
  vehicle,
  onClose,
  onConfirm,
}: {
  vehicle: UsedVehicle;
  onClose: () => void;
  onConfirm: (order: SaleOrder) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [salePrice, setSalePrice] = useState(String(vehicle.listPrice));
  const [depositAmount, setDepositAmount] = useState("");
  const [fullPay, setFullPay] = useState(true);
  const [sourceType, setSourceType] = useState<UsedVehicleSourceType>("sales-led");

  const priceNum = parseInt(salePrice, 10) || 0;
  const depositNum = fullPay ? priceNum : parseInt(depositAmount, 10) || 0;
  const gp = useMemo(() => {
    const amt = priceNum - vehicle.purchasePrice - vehicle.refurbCost;
    const ratio = priceNum > 0 ? amt / priceNum : 0;
    return { amt, ratio, tone: gpTone(ratio) };
  }, [priceNum, vehicle]);

  const step1Ok = customerName.trim().length > 0 && customerPhone.trim().length >= 8;
  const step2Ok = priceNum > 0;
  const step3Ok = fullPay || (depositNum > 0 && depositNum < priceNum);

  function next() {
    if (step === 1 && step1Ok) setStep(2);
    else if (step === 2 && step2Ok) setStep(3);
    else if (step === 3 && step3Ok) setStep(4);
  }
  function back() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  function handleSubmit() {
    const order: SaleOrder = {
      id: genOrderId(),
      vehicleId: vehicle.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      salePrice: priceNum,
      gp1: gp.amt,
      gpRatio: gp.ratio,
      paymentStatus: fullPay ? "paid" : "deposit",
      depositAmount: depositNum,
      deliveryDate: null,
      sourceType,
      salesperson: "Amy",
      createdAt: new Date().toISOString(),
    };
    onConfirm(order);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={back}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
            )}
            <div>
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                建立銷售單 · 第 {step} / 4 步
              </p>
              <h2 className="text-base font-bold text-slate-800">
                {vehicle.brand} {vehicle.model} {vehicle.year}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <SectionLabel>客戶資料</SectionLabel>
              <TextField
                label="姓名"
                value={customerName}
                onChange={setCustomerName}
                placeholder="王大明"
              />
              <TextField
                label="電話"
                value={customerPhone}
                onChange={setCustomerPhone}
                placeholder="0912-345-678"
              />
              <div>
                <SectionLabel>線索來源</SectionLabel>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <RadioCard
                    active={sourceType === "sales-led"}
                    onClick={() => setSourceType("sales-led")}
                    icon="person"
                    label="銷售引導"
                  />
                  <RadioCard
                    active={sourceType === "technician-rec"}
                    onClick={() => setSourceType("technician-rec")}
                    icon="build"
                    label="技師推薦"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <SectionLabel>成交價</SectionLabel>
              <div>
                <input
                  type="number"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full h-14 px-4 text-2xl font-bold tabular-nums text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
                  inputMode="numeric"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  牌價 {formatTWD(vehicle.listPrice)}
                </p>
              </div>
              <InfoRow label="收購成本" value={formatTWD(vehicle.purchasePrice)} />
              <InfoRow label="整備費用" value={formatTWD(vehicle.refurbCost)} />
              <div className={`rounded-lg px-4 py-3 ${gp.tone.bg}`}>
                <div className="flex items-baseline justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${gp.tone.text}`}>
                    預估毛利（{gp.tone.label}）
                  </span>
                  <span className={`text-lg font-black tabular-nums ${gp.tone.text}`}>
                    {formatTWD(gp.amt)} · {(gp.ratio * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SectionLabel>付款方式</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <RadioCard
                  active={fullPay}
                  onClick={() => setFullPay(true)}
                  icon="payments"
                  label="全額付款"
                />
                <RadioCard
                  active={!fullPay}
                  onClick={() => setFullPay(false)}
                  icon="schedule"
                  label="訂金 + 尾款"
                />
              </div>
              {!fullPay && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                    訂金金額
                  </label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full h-12 px-4 text-lg font-bold tabular-nums text-slate-900 bg-slate-50 rounded-lg border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
                    inputMode="numeric"
                    placeholder="例：100000"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    尾款自動 = 成交價 - 訂金 = {formatTWD(Math.max(priceNum - depositNum, 0))}
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <SectionLabel>確認資料</SectionLabel>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <InfoRow label="車輛" value={`${vehicle.brand} ${vehicle.model} ${vehicle.year}`} />
                <InfoRow label="客戶" value={customerName} />
                <InfoRow label="電話" value={customerPhone} />
                <InfoRow label="成交價" value={formatTWD(priceNum)} />
                <InfoRow
                  label="付款"
                  value={fullPay ? "全額已付" : `訂金 ${formatTWD(depositNum)}`}
                />
                <InfoRow
                  label="毛利"
                  value={
                    <span className={`font-bold ${gp.tone.text}`}>
                      {formatTWD(gp.amt)} · {(gp.ratio * 100).toFixed(1)}%
                    </span>
                  }
                />
                <InfoRow
                  label="來源"
                  value={sourceType === "sales-led" ? "銷售引導" : "技師推薦"}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          {step < 4 ? (
            <button
              onClick={next}
              disabled={(step === 1 && !step1Ok) || (step === 2 && !step2Ok) || (step === 3 && !step3Ok)}
              className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              下一步
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">check_circle</span>
              確認建立銷售單
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 px-4 text-sm text-slate-900 bg-slate-50 rounded-lg border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
      />
    </div>
  );
}

function RadioCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
        active
          ? "border-indigo-600 bg-indigo-50/50 text-indigo-700"
          : "border-slate-200 text-slate-600 hover:border-slate-300"
      }`}
    >
      <span className="material-symbols-outlined text-[24px]">{icon}</span>
      <span className="text-xs font-bold">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
      {children}
    </h3>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
