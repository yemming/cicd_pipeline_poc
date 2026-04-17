"use client";

import { useState } from "react";
import { formatTWD } from "@/lib/pos/format";
import type { SaleOrder, UsedVehicle } from "@/lib/pos/types";

export function DeliveryWizard({
  order,
  vehicle,
  onClose,
  onConfirm,
}: {
  order: SaleOrder;
  vehicle: UsedVehicle | undefined;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inspection, setInspection] = useState({
    body: false,
    docs: false,
    keys: false,
  });
  const allChecked = inspection.body && inspection.docs && inspection.keys;

  const remaining = order.salePrice - order.depositAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
              交車確認 · 第 {step} / 2 步
            </p>
            <h2 className="text-base font-bold text-slate-800">{order.id}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-indigo-600 transition-all"
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-4">
          {step === 1 ? (
            <>
              <h3 className="text-sm font-bold text-slate-800">交車前檢查</h3>
              <p className="text-xs text-slate-500">
                {vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}` : "— 車輛已移除 —"}
              </p>
              <div className="space-y-2">
                <CheckItem
                  label="車況最終確認（外觀、輪胎、油量）"
                  checked={inspection.body}
                  onChange={(v) => setInspection((s) => ({ ...s, body: v }))}
                />
                <CheckItem
                  label="文件已備妥（行照、保險、過戶書）"
                  checked={inspection.docs}
                  onChange={(v) => setInspection((s) => ({ ...s, docs: v }))}
                />
                <CheckItem
                  label="鑰匙與配件清點（主/副鑰匙、使用手冊）"
                  checked={inspection.keys}
                  onChange={(v) => setInspection((s) => ({ ...s, keys: v }))}
                />
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-slate-800">尾款收款</h3>
              {order.paymentStatus === "paid" ? (
                <div className="bg-emerald-50 rounded-lg p-4 flex items-center gap-3">
                  <span className="material-symbols-outlined text-emerald-600 text-[28px]">
                    check_circle
                  </span>
                  <div>
                    <p className="text-sm font-bold text-emerald-700">款項已全額收齊</p>
                    <p className="text-[11px] text-emerald-600">無需再收尾款，可直接交車</p>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">成交價</span>
                    <span className="font-semibold tabular-nums">{formatTWD(order.salePrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">已收訂金</span>
                    <span className="font-semibold tabular-nums">{formatTWD(order.depositAmount)}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-2 flex justify-between">
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                      應收尾款
                    </span>
                    <span className="text-xl font-black text-amber-700 tabular-nums">
                      {formatTWD(remaining)}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 text-center">
                按下方按鈕後，車輛狀態將變更為「已售出」，並寫入日記帳。
              </p>
            </>
          )}
        </div>

        <div className="px-6 pb-6">
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!allChecked}
              className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              下一步
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={onConfirm}
              className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">local_shipping</span>
              確認交車
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
        checked ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
          checked ? "border-emerald-600 bg-emerald-600" : "border-slate-300"
        }`}
      >
        {checked && (
          <span className="material-symbols-outlined text-white text-[16px]">check</span>
        )}
      </div>
      <span className={`text-sm ${checked ? "text-slate-800 font-semibold" : "text-slate-600"}`}>
        {label}
      </span>
    </button>
  );
}
