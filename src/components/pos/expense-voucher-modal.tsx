"use client";

import { useState } from "react";
import type { LedgerCategory, LedgerEntry } from "@/lib/pos/types";

export function ExpenseVoucherModal({
  categories,
  onClose,
  onSubmit,
}: {
  categories: LedgerCategory[];
  onClose: () => void;
  onSubmit: (entry: Omit<LedgerEntry, "id">) => void;
}) {
  const [category, setCategory] = useState<LedgerCategory>(categories[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const amountNum = parseInt(amount, 10) || 0;
  const canSubmit = amountNum > 0 && description.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      date: new Date().toISOString(),
      type: "expense",
      category,
      amount: amountNum,
      description: description.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">新增費用傳票</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              分類
            </label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`h-10 rounded-lg border-2 text-xs font-bold transition-all ${
                    category === c
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              金額
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-14 px-4 text-2xl font-bold tabular-nums text-slate-900 bg-slate-50 rounded-xl border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
              說明
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：三月水電費"
              className="w-full h-11 px-4 text-sm text-slate-900 bg-slate-50 rounded-lg border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
            />
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-base transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">save</span>
            寫入日記帳
          </button>
        </div>
      </div>
    </div>
  );
}
