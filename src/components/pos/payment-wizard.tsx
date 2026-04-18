"use client";

import { useState } from "react";
import { formatTWD } from "@/lib/pos/format";
import { PAYMENT_ICON, PAYMENT_LABEL, type PaymentMethod } from "@/lib/pos/types";
import { useCart } from "./cart-context";

type Step = "method" | "confirm" | "done";
type InvoiceType = "personal" | "carrier" | "taxid";

function genTxId(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `TX-${ymd}-${seq}`;
}

export function PaymentWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <WizardBody onClose={onClose} />;
}

function WizardBody({ onClose }: { onClose: () => void }) {
  const { totalAmount, totalQty, clear } = useCart();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [txId, setTxId] = useState<string>("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("personal");
  const [carrierCode, setCarrierCode] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");

  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const change = cashReceivedNum - totalAmount;

  function handlePickMethod(m: PaymentMethod) {
    setMethod(m);
    if (m === "cash") {
      setCashReceived(String(totalAmount));
    }
    setStep("confirm");
  }

  function handleConfirm() {
    if (method === "cash" && cashReceivedNum < totalAmount) return;
    setTxId(genTxId());
    setStep("done");
  }

  function handleDone() {
    clear();
    onClose();
  }

  function handleBack() {
    if (step === "confirm") setStep("method");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={step === "done" ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === "confirm" && (
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                aria-label="上一步"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
            )}
            <h2 className="text-base font-bold text-slate-800">
              {step === "method" && "選擇收款方式"}
              {step === "confirm" && `確認${method ? PAYMENT_LABEL[method] : ""}`}
              {step === "done" && "交易完成"}
            </h2>
          </div>
          {step !== "done" && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              aria-label="關閉"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Amount summary — always visible above body */}
          {step !== "done" && (
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                應收金額（{totalQty} 件）
              </p>
              <p className="text-4xl font-black text-slate-900 tabular-nums">
                {formatTWD(totalAmount)}
              </p>
            </div>
          )}

          {step === "method" && (
            <MethodStep
              onPick={handlePickMethod}
              invoiceType={invoiceType}
              setInvoiceType={setInvoiceType}
              carrierCode={carrierCode}
              setCarrierCode={setCarrierCode}
              taxId={taxId}
              setTaxId={setTaxId}
            />
          )}
          {step === "confirm" && method && (
            <ConfirmStep
              method={method}
              totalAmount={totalAmount}
              cashReceived={cashReceived}
              setCashReceived={setCashReceived}
              change={change}
              onConfirm={handleConfirm}
            />
          )}
          {step === "done" && method && (
            <DoneStep
              method={method}
              totalAmount={totalAmount}
              txId={txId}
              change={method === "cash" ? change : 0}
              invoiceType={invoiceType}
              carrierCode={carrierCode}
              taxId={taxId}
              onDone={handleDone}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MethodStep({
  onPick,
  invoiceType,
  setInvoiceType,
  carrierCode,
  setCarrierCode,
  taxId,
  setTaxId,
}: {
  onPick: (m: PaymentMethod) => void;
  invoiceType: InvoiceType;
  setInvoiceType: (v: InvoiceType) => void;
  carrierCode: string;
  setCarrierCode: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
}) {
  const methods: PaymentMethod[] = ["cash", "credit-card", "transfer", "linepay"];

  const tabs: { key: InvoiceType; label: string; icon: string }[] = [
    { key: "personal", label: "個人", icon: "person" },
    { key: "carrier", label: "手機載具", icon: "smartphone" },
    { key: "taxid", label: "統一編號", icon: "business" },
  ];

  return (
    <div className="space-y-5">
      {/* 電子發票區塊 */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-slate-500 text-[16px]">receipt_long</span>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">電子發票</span>
        </div>
        <div className="p-4 space-y-3">
          {/* 三個 tab */}
          <div className="flex rounded-lg bg-slate-100 p-1 gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setInvoiceType(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-md text-xs font-semibold transition-all ${
                  invoiceType === t.key
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* 個人：說明文字 */}
          {invoiceType === "personal" && (
            <p className="text-xs text-slate-500 text-center py-1">
              雲端發票自動開立，存入財政部平台
            </p>
          )}

          {/* 手機載具 */}
          {invoiceType === "carrier" && (
            <div>
              <input
                type="text"
                placeholder="/XXXXXXX（8 碼，/ 開頭）"
                value={carrierCode}
                onChange={(e) => {
                  let v = e.target.value.toUpperCase();
                  if (v && !v.startsWith("/")) v = "/" + v;
                  if (v.length <= 8) setCarrierCode(v);
                }}
                className="w-full h-11 px-4 text-sm font-mono text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none placeholder:text-slate-400"
                inputMode="text"
                autoFocus
              />
              {carrierCode.length > 0 && carrierCode.length < 8 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  載具碼需 / 加 7 碼英數（目前 {carrierCode.length - 1}/7）
                </p>
              )}
            </div>
          )}

          {/* 統一編號 */}
          {invoiceType === "taxid" && (
            <div>
              <input
                type="text"
                placeholder="12345678（8 位數）"
                value={taxId}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setTaxId(v);
                }}
                className="w-full h-11 px-4 text-sm font-mono text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none placeholder:text-slate-400"
                inputMode="numeric"
                autoFocus
              />
              {taxId.length > 0 && taxId.length < 8 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  統一編號需 8 位數（目前 {taxId.length}/8）
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 付款方式 */}
      <div className="grid grid-cols-1 gap-3">
        {methods.map((m) => (
          <button
            key={m}
            onClick={() => onPick(m)}
            className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/30 hover:shadow-sm transition-all active:scale-[0.99] text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-indigo-600 text-[28px]">
                {PAYMENT_ICON[m]}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-slate-800">{PAYMENT_LABEL[m]}</p>
              <p className="text-xs text-slate-500">
                {m === "cash" && "現場收現，系統計算找零"}
                {m === "credit-card" && "VISA / Master / JCB，刷卡機授權"}
                {m === "transfer" && "客戶銀行轉帳，輸入尾碼確認"}
                {m === "linepay" && "LINE Pay QR 掃碼付款"}
              </p>
            </div>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmStep({
  method,
  totalAmount,
  cashReceived,
  setCashReceived,
  change,
  onConfirm,
}: {
  method: PaymentMethod;
  totalAmount: number;
  cashReceived: string;
  setCashReceived: (v: string) => void;
  change: number;
  onConfirm: () => void;
}) {
  const cashOk = method !== "cash" || (parseInt(cashReceived, 10) || 0) >= totalAmount;

  return (
    <div className="space-y-5">
      {method === "cash" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            實收現金
          </label>
          <input
            type="number"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            className="w-full h-14 px-4 text-2xl font-bold tabular-nums text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
            inputMode="numeric"
          />
          <div className="mt-3 flex gap-2 flex-wrap">
            {[totalAmount, 1000, 500, 100].map((amt, i) => (
              <button
                key={i}
                onClick={() => {
                  const cur = parseInt(cashReceived, 10) || 0;
                  const next = i === 0 ? amt : cur + amt;
                  setCashReceived(String(next));
                }}
                className="h-10 px-4 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-700"
              >
                {i === 0 ? `=${formatTWD(amt)}` : `+${amt}`}
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              找零
            </span>
            <span
              className={`text-2xl font-black tabular-nums ${
                change < 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatTWD(Math.max(change, 0))}
            </span>
          </div>
        </div>
      )}

      {method === "transfer" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            轉入帳戶
          </label>
          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">銀行</span>
              <span className="font-semibold text-slate-800">國泰世華（013）</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">帳號</span>
              <span className="font-mono font-semibold text-slate-800">0012-3456-7890</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">戶名</span>
              <span className="font-semibold text-slate-800">Ducati Taipei</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            確認客戶已完成轉帳後，按下方按鈕。
          </p>
        </div>
      )}

      {method === "credit-card" && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            刷卡機
          </label>
          <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-700 text-white rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                中國信託 聯合刷卡機
              </span>
              <div className="flex gap-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10">VISA</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10">MC</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10">JCB</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[36px] text-white/90 animate-pulse">
                contactless
              </span>
              <div>
                <p className="text-sm font-bold">請客戶感應或插卡</p>
                <p className="text-[11px] text-white/70">授權完成後按下方按鈕</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {method === "linepay" && (
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center border-4 border-[#06C755]">
            <span className="material-symbols-outlined text-slate-300 text-[120px]">
              qr_code_2
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            請客戶用 LINE Pay 掃描 QR Code
            <br />
            完成付款後系統會自動偵測
          </p>
        </div>
      )}

      <button
        onClick={onConfirm}
        disabled={!cashOk}
        className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined">check_circle</span>
        確認收款
      </button>
    </div>
  );
}

function DoneStep({
  method,
  totalAmount,
  txId,
  change,
  invoiceType,
  carrierCode,
  taxId,
  onDone,
}: {
  method: PaymentMethod;
  totalAmount: number;
  txId: string;
  change: number;
  invoiceType: InvoiceType;
  carrierCode: string;
  taxId: string;
  onDone: () => void;
}) {
  const invoiceLabel =
    invoiceType === "personal"
      ? "個人雲端發票"
      : invoiceType === "carrier"
      ? `手機載具 ${carrierCode}`
      : `統一編號 ${taxId}`;

  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
        <span className="material-symbols-outlined text-emerald-600 text-[44px]">
          check_circle
        </span>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-1">交易完成</h3>
      <p className="text-sm text-slate-500 mb-6">已自動寫入日記帳、庫存同步扣減</p>

      <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-left mb-6">
        <Row label="交易編號" value={<span className="font-mono">{txId}</span>} />
        <Row label="收款方式" value={PAYMENT_LABEL[method]} />
        <Row label="金額" value={<span className="tabular-nums">{formatTWD(totalAmount)}</span>} />
        {method === "cash" && change > 0 && (
          <Row
            label="找零"
            value={<span className="tabular-nums text-emerald-700">{formatTWD(change)}</span>}
          />
        )}
        <Row label="發票" value={invoiceLabel} />
      </div>

      <button
        onClick={onDone}
        className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-sm transition-all active:scale-[0.98]"
      >
        完成，回到收銀
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
