"use client";

import { formatTWD } from "@/lib/pos/format";
import { useCart } from "./cart-context";

/**
 * Payment Wizard — Task 3 會在此檔內把三步流程實作完整。
 * 目前為 skeleton：顯示合計 + 關閉，用來驗證 modal 生命週期。
 */
export function PaymentWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { totalAmount, totalQty } = useCart();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">收款</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-6 text-center">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            應收金額（{totalQty} 件）
          </p>
          <p className="text-4xl font-black text-slate-900 tabular-nums mb-6">
            {formatTWD(totalAmount)}
          </p>
          <p className="text-sm text-slate-500">
            收款流程即將完成（步驟 3 會在下一個 commit 補齊）
          </p>
        </div>
      </div>
    </div>
  );
}
