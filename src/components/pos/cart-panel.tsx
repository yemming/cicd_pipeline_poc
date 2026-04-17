"use client";

import { formatTWD } from "@/lib/pos/format";
import { useCart } from "./cart-context";

export function CartPanel({ onCheckout }: { onCheckout: () => void }) {
  const { lines, totalQty, totalAmount, inc, dec, remove, clear } = useCart();
  const empty = lines.length === 0;

  return (
    <aside className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-600">shopping_cart</span>
          <h2 className="text-sm font-bold text-slate-800">購物車</h2>
          {totalQty > 0 && (
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              {totalQty}
            </span>
          )}
        </div>
        {!empty && (
          <button
            onClick={clear}
            className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition"
          >
            清空
          </button>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto">
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
            <span className="material-symbols-outlined text-5xl mb-2">shopping_basket</span>
            <p className="text-sm text-center">點左側商品加入購物車</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.product.id} className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">
                      {l.product.name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {formatTWD(l.product.unitPrice)} × {l.qty}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(l.product.id)}
                    className="text-slate-300 hover:text-rose-500 transition shrink-0"
                    aria-label="移除"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  {/* Qty stepper — 48px touch target */}
                  <div className="inline-flex items-center bg-slate-50 rounded-lg border border-slate-200">
                    <button
                      onClick={() => dec(l.product.id)}
                      className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-l-lg"
                      aria-label="減少"
                    >
                      <span className="material-symbols-outlined text-[20px]">remove</span>
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-slate-800 tabular-nums">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => inc(l.product.id)}
                      disabled={l.qty >= l.product.stockQty}
                      className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-r-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="增加"
                    >
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  </div>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatTWD(l.product.unitPrice * l.qty)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: total + checkout */}
      <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/60">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            合計
          </span>
          <span className="text-3xl font-black text-slate-900 tabular-nums">
            {formatTWD(totalAmount)}
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={empty}
          className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined">point_of_sale</span>
          收款結帳
        </button>
      </div>
    </aside>
  );
}
