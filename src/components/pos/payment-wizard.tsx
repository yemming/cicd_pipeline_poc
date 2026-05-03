"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import QRCode from "react-qr-code";
import { formatTWD } from "@/lib/pos/format";
import { PAYMENT_ICON, PAYMENT_LABEL, type PaymentMethod } from "@/lib/pos/types";
import { useCart } from "./cart-context";
import { completeSale, type CompleteSaleResult } from "@/lib/pos/actions";

type Step = "method" | "confirm" | "done";
type InvoiceType = "personal" | "carrier" | "taxid";
type ShipStatus  = "idle" | "loading" | "done" | "error";

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
  const { totalAmount, totalQty, lines, clear } = useCart();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [txId, setTxId] = useState<string>("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("personal");
  const [carrierCode, setCarrierCode] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");
  const [saleResult, setSaleResult] = useState<CompleteSaleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const change = cashReceivedNum - totalAmount;

  function handlePickMethod(m: PaymentMethod) {
    setMethod(m);
    if (m === "cash") setCashReceived(String(totalAmount));
    setStep("confirm");
  }

  function handleConfirm() {
    if (!method) return;
    if (method === "cash" && cashReceivedNum < totalAmount) return;

    const salelines = lines.map((l) => ({
      productId: l.product.id,
      sku:       l.product.sku,
      name:      l.product.name,
      qty:       l.qty,
      unitPrice: l.product.unitPrice,
    }));

    setError(null);
    startTransition(async () => {
      try {
        const result = await completeSale({
          lines:         salelines,
          totalAmount,
          paymentMethod: method,
          cashReceived:  method === "cash" ? cashReceivedNum : undefined,
          invoiceType,
          carrierCode:   invoiceType === "carrier" ? carrierCode : undefined,
          taxId:         invoiceType === "taxid"   ? taxId       : undefined,
        });
        setTxId(result.txId);
        setSaleResult(result);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleDone() {
    clear();
    onClose();
  }

  function handleBack() {
    if (step === "confirm" && !isPending) setStep("method");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={step === "done" || isPending ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === "confirm" && !isPending && (
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                aria-label="上一步"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
            )}
            <h2 className="text-base font-bold text-slate-800">
              {step === "method"  && "選擇收款方式"}
              {step === "confirm" && `確認${method ? PAYMENT_LABEL[method] : ""}`}
              {step === "done"    && "交易完成"}
            </h2>
          </div>
          {step !== "done" && !isPending && (
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

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex gap-2 items-start">
              <span className="material-symbols-outlined text-rose-500 text-[18px] mt-0.5 shrink-0">error</span>
              <p className="text-xs text-rose-700">{error}</p>
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
          {step === "confirm" && method && method !== "linepay" && (
            <ConfirmStep
              method={method}
              totalAmount={totalAmount}
              cashReceived={cashReceived}
              setCashReceived={setCashReceived}
              change={change}
              isPending={isPending}
              onConfirm={handleConfirm}
            />
          )}
          {step === "confirm" && method === "linepay" && (
            <LinepayStep
              lines={lines.map((l) => ({
                productId: l.product.id,
                sku:       l.product.sku,
                name:      l.product.name,
                qty:       l.qty,
                unitPrice: l.product.unitPrice,
              }))}
              totalAmount={totalAmount}
              invoiceType={invoiceType}
              carrierCode={carrierCode}
              taxId={taxId}
              onPaid={(result) => { setTxId(result.txId); setSaleResult(result); setStep("done"); }}
              onCancel={onClose}
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
              saleResult={saleResult}
              goodsName={lines.map((l) => l.product.name).join("、").slice(0, 50)}
              onDone={handleDone}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 1: 選擇付款方式 + 發票設定
// ─────────────────────────────────────────────────────────────
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
    { key: "carrier",  label: "手機載具", icon: "smartphone" },
    { key: "taxid",    label: "統一編號", icon: "business" },
  ];

  return (
    <div className="space-y-5">
      {/* 電子發票設定 */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-slate-500 text-[16px]">receipt_long</span>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">電子發票</span>
        </div>
        <div className="p-4 space-y-3">
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

          {invoiceType === "personal" && (
            <p className="text-xs text-slate-500 text-center py-1">
              雲端發票自動開立，存入財政部電子發票平台
            </p>
          )}

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

          {invoiceType === "taxid" && (
            <div>
              <input
                type="text"
                placeholder="12345678（8 位數）"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 8))}
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
                {m === "cash"        && "現場收現，系統計算找零"}
                {m === "credit-card" && "VISA / Master / JCB，刷卡機授權"}
                {m === "transfer"    && "客戶銀行轉帳，輸入尾碼確認"}
                {m === "linepay"     && "LINE Pay QR 掃碼付款"}
              </p>
            </div>
            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2: 確認收款
// ─────────────────────────────────────────────────────────────
function ConfirmStep({
  method,
  totalAmount,
  cashReceived,
  setCashReceived,
  change,
  isPending,
  onConfirm,
}: {
  method: PaymentMethod;
  totalAmount: number;
  cashReceived: string;
  setCashReceived: (v: string) => void;
  change: number;
  isPending: boolean;
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
            disabled={isPending}
            className="w-full h-14 px-4 text-2xl font-bold tabular-nums text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none disabled:opacity-60"
            inputMode="numeric"
          />
          <div className="mt-3 flex gap-2 flex-wrap">
            {[totalAmount, 1000, 500, 100].map((amt, i) => (
              <button
                key={i}
                disabled={isPending}
                onClick={() => {
                  const cur  = parseInt(cashReceived, 10) || 0;
                  const next = i === 0 ? amt : cur + amt;
                  setCashReceived(String(next));
                }}
                className="h-10 px-4 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg text-sm font-semibold text-slate-700"
              >
                {i === 0 ? `=${formatTWD(amt)}` : `+${amt}`}
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">找零</span>
            <span className={`text-2xl font-black tabular-nums ${change < 0 ? "text-rose-600" : "text-emerald-700"}`}>
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
          <p className="mt-3 text-xs text-slate-500 text-center">確認客戶已完成轉帳後，按下方按鈕。</p>
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
                {["VISA", "MC", "JCB"].map((b) => (
                  <span key={b} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10">{b}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[36px] text-white/90 animate-pulse">contactless</span>
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
            <span className="material-symbols-outlined text-slate-300 text-[120px]">qr_code_2</span>
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            請客戶用 LINE Pay 掃描 QR Code
            <br />完成付款後系統會自動偵測
          </p>
        </div>
      )}

      <button
        onClick={onConfirm}
        disabled={!cashOk || isPending}
        className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            收款中…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined">check_circle</span>
            確認收款
          </>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3: 完成畫面（含選配宅配）
// ─────────────────────────────────────────────────────────────
function DoneStep({
  method,
  totalAmount,
  txId,
  change,
  invoiceType,
  carrierCode,
  taxId,
  saleResult,
  goodsName,
  onDone,
}: {
  method: PaymentMethod;
  totalAmount: number;
  txId: string;
  change: number;
  invoiceType: InvoiceType;
  carrierCode: string;
  taxId: string;
  saleResult: CompleteSaleResult | null;
  goodsName: string;
  onDone: () => void;
}) {
  const [showShipping, setShowShipping] = useState(false);
  const [shipStatus,   setShipStatus]   = useState<ShipStatus>("idle");
  const [logisticsId,  setLogisticsId]  = useState("");
  const [shipError,    setShipError]    = useState("");
  const [rName,  setRName]  = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rZip,   setRZip]   = useState("");
  const [rAddr,  setRAddr]  = useState("");
  const [, startShipTransition] = useTransition();

  function handleCreateShipment() {
    if (!rName || !rPhone || !rZip || !rAddr) return;
    startShipTransition(async () => {
      setShipStatus("loading");
      try {
        const res = await fetch("/api/pos/logistics/create", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            goodsAmount:    totalAmount,
            goodsName,
            receiverName:   rName,
            receiverPhone:  rPhone,
            receiverZipCode:rZip,
            receiverAddress:rAddr,
          }),
        });
        const data = await res.json() as { success: boolean; allPayLogisticsId?: string; error?: string };
        if (data.success) {
          setLogisticsId(data.allPayLogisticsId ?? "");
          setShipStatus("done");
        } else {
          setShipError(data.error ?? "未知錯誤");
          setShipStatus("error");
        }
      } catch (err) {
        setShipError(err instanceof Error ? err.message : String(err));
        setShipStatus("error");
      }
    });
  }

  const invoiceLabel =
    invoiceType === "personal" ? "個人雲端發票" :
    invoiceType === "carrier"  ? `手機載具 ${carrierCode}` :
                                 `統一編號 ${taxId}`;

  const invoiceStatusLabel =
    saleResult?.ecpayStatus === "issued" && saleResult.invoiceNo
      ? saleResult.invoiceNo
      : saleResult?.ecpayStatus === "failed"
      ? "⚠ 開立失敗（已記錄，請手動補開）"
      : "開立中…";

  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
        <span className="material-symbols-outlined text-emerald-600 text-[44px]">check_circle</span>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-1">交易完成</h3>
      <p className="text-sm text-slate-500 mb-6">已寫入日記帳，庫存同步扣減</p>

      <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-left mb-4">
        <Row label="交易編號" value={<span className="font-mono text-xs">{txId}</span>} />
        <Row label="收款方式" value={PAYMENT_LABEL[method]} />
        <Row label="金額"     value={<span className="tabular-nums">{formatTWD(totalAmount)}</span>} />
        {method === "cash" && change > 0 && (
          <Row label="找零" value={<span className="tabular-nums text-emerald-700">{formatTWD(change)}</span>} />
        )}
        <div className="pt-1 border-t border-slate-200" />
        <Row label="發票類型" value={invoiceLabel} />
        <Row
          label="發票號碼"
          value={
            <span className={saleResult?.ecpayStatus === "failed" ? "text-amber-600 text-xs" : "font-mono"}>
              {invoiceStatusLabel}
            </span>
          }
        />
        {saleResult?.randomNumber && (
          <Row label="隨機碼" value={<span className="font-mono">{saleResult.randomNumber}</span>} />
        )}
      </div>

      {saleResult?.ecpayStatus === "failed" && saleResult.ecpayError && (
        <p className="mb-3 text-[11px] text-amber-600 text-left px-1">
          ECPay 錯誤：{saleResult.ecpayError}
        </p>
      )}

      {/* ─── 宅配選配區塊 ─── */}
      {shipStatus === "done" ? (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-left">
          <span className="material-symbols-outlined text-emerald-600 text-[18px] mt-0.5">local_shipping</span>
          <div>
            <p className="text-xs font-bold text-emerald-700">宅配訂單已建立</p>
            <p className="text-[11px] text-emerald-600 font-mono mt-0.5">{logisticsId}</p>
          </div>
        </div>
      ) : showShipping ? (
        <div className="mb-4 rounded-xl border border-indigo-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-indigo-600 text-[16px]">local_shipping</span>
            <span className="text-xs font-bold text-indigo-700">黑貓宅急便 — 收件資訊</span>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="收件人姓名"
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                disabled={shipStatus === "loading"}
                className="h-10 px-3 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <input
                type="tel"
                placeholder="手機（09xxxxxxxx）"
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                disabled={shipStatus === "loading"}
                className="h-10 px-3 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="郵遞區號"
                value={rZip}
                onChange={(e) => setRZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                disabled={shipStatus === "loading"}
                className="w-24 h-10 px-3 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <input
                type="text"
                placeholder="收件地址"
                value={rAddr}
                onChange={(e) => setRAddr(e.target.value)}
                disabled={shipStatus === "loading"}
                className="flex-1 h-10 px-3 text-sm bg-slate-50 rounded-lg border border-slate-200 focus:border-indigo-400 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
            </div>
            {shipStatus === "error" && (
              <p className="text-[11px] text-rose-600">建立失敗：{shipError}</p>
            )}
            <button
              onClick={handleCreateShipment}
              disabled={!rName || !rPhone || rPhone.length < 10 || !rZip || !rAddr || shipStatus === "loading"}
              className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold transition-all flex items-center justify-center gap-1.5"
            >
              {shipStatus === "loading" ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  建立中…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">send</span>
                  建立宅配訂單
                </>
              )}
            </button>
            <button
              onClick={() => setShowShipping(false)}
              disabled={shipStatus === "loading"}
              className="w-full text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowShipping(true)}
          className="w-full mb-4 h-10 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 text-slate-500 hover:text-indigo-600 text-sm font-semibold transition-all flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">local_shipping</span>
          安排宅配（選填）
        </button>
      )}

      <button
        onClick={onDone}
        className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-sm transition-all active:scale-[0.98]"
      >
        完成，回到收銀
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LINE Pay Step — 真實 QR + 3 秒 polling
// ─────────────────────────────────────────────────────────────
type SaleLineSimple = {
  productId: string; sku: string; name: string; qty: number; unitPrice: number;
};

function LinepayStep({
  lines, totalAmount, invoiceType, carrierCode, taxId, onPaid, onCancel,
}: {
  lines:       SaleLineSimple[];
  totalAmount: number;
  invoiceType: InvoiceType;
  carrierCode: string;
  taxId:       string;
  onPaid:      (result: CompleteSaleResult) => void;
  onCancel:    () => void;
}) {
  const [checkoutUrl,      setCheckoutUrl]      = useState<string | null>(null);
  const [merchantTradeNo,  setMerchantTradeNo]  = useState<string | null>(null);
  const [payStatus,        setPayStatus]        = useState<"waiting" | "paid" | "failed">("waiting");
  const [errorMsg,         setErrorMsg]         = useState<string | null>(null);
  const [secsLeft,         setSecsLeft]         = useState(600); // 10 min
  const [, startTransition] = useTransition();

  // 建立 LINE Pay 訂單
  useEffect(() => {
    const itemName = lines.map((l) => l.name.slice(0, 20)).join("#").slice(0, 400);
    fetch("/api/pos/payment/create", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ totalAmount, itemName, tradeDesc: "Ducati Taipei POS" }),
    })
      .then((r) => r.json())
      .then((d: { merchantTradeNo: string; checkoutUrl: string }) => {
        setMerchantTradeNo(d.merchantTradeNo);
        setCheckoutUrl(d.checkoutUrl);
      })
      .catch(() => setErrorMsg("無法建立 LINE Pay 訂單，請換其他付款方式"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 倒數計時
  useEffect(() => {
    if (payStatus !== "waiting") return;
    const t = setInterval(() => setSecsLeft((s) => {
      if (s <= 1) { clearInterval(t); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [payStatus]);

  // 每 3 秒 poll 狀態
  const poll = useCallback(() => {
    if (!merchantTradeNo || payStatus !== "waiting") return;
    fetch(`/api/pos/payment/status/${merchantTradeNo}`)
      .then((r) => r.json())
      .then(async (d: { paid: boolean }) => {
        if (!d.paid) return;
        setPayStatus("paid");
        // 付款確認 → 建立交易 + 開電子發票
        startTransition(async () => {
          try {
            const result = await completeSale({
              lines,
              totalAmount,
              paymentMethod: "linepay",
              invoiceType,
              carrierCode:   invoiceType === "carrier" ? carrierCode : undefined,
              taxId:         invoiceType === "taxid"   ? taxId       : undefined,
            });
            onPaid(result);
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : String(err));
          }
        });
      })
      .catch(() => { /* 忽略暫時性網路錯誤 */ });
  }, [merchantTradeNo, payStatus, lines, totalAmount, invoiceType, carrierCode, taxId, onPaid, startTransition]);

  useEffect(() => {
    if (!merchantTradeNo) return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [merchantTradeNo, poll]);

  const mins = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const secs = String(secsLeft % 60).padStart(2, "0");

  if (errorMsg) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 text-sm text-rose-700">{errorMsg}</div>
        <button onClick={onCancel} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">
          取消，換其他方式
        </button>
      </div>
    );
  }

  if (!checkoutUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <svg className="w-8 h-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-sm text-slate-500">產生 LINE Pay QR Code…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* QR Code */}
      <div className="p-4 bg-white rounded-2xl border-2 border-[#06C755] shadow-sm">
        <QRCode value={checkoutUrl} size={200} fgColor="#06C755" />
      </div>

      {/* 狀態 */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#06C755] animate-pulse" />
        <span className="text-sm font-semibold text-slate-700">等待 LINE Pay 付款</span>
        <span className="text-xs font-mono text-slate-400 ml-1">{mins}:{secs}</span>
      </div>

      <p className="text-xs text-slate-400 text-center">
        請客戶掃描 QR Code 完成付款
        <br />系統將自動偵測並繼續
      </p>

      {/* 逾時提示 */}
      {secsLeft === 0 && (
        <div className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 text-center">
          QR Code 已逾時，請取消後重新選擇付款方式
        </div>
      )}

      <button
        onClick={onCancel}
        className="w-full h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-semibold transition-all"
      >
        取消，換其他付款方式
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
