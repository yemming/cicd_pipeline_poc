"use client";

import { formatNTD } from "@/lib/pos/format";

const keys: (string | null)[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "←"];
const quick = [100, 500, 1000, 5000, 10000];

export function PaymentPad({
  value,
  onChange,
  due,
  quickAmounts = quick,
}: {
  value: number;
  onChange: (n: number) => void;
  due: number;
  quickAmounts?: number[];
}) {
  function tap(k: string) {
    if (k === "←") {
      onChange(Math.floor(value / 10));
      return;
    }
    const next = parseInt(`${value}${k}`, 10);
    if (!Number.isNaN(next)) onChange(next);
  }

  const change = value - due;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
      <div>
        <div className="bg-indigo-900/5 border border-indigo-200/60 rounded-2xl p-6 mb-4">
          <p className="text-xs text-slate-500 mb-1">實收金額</p>
          <p className="text-4xl font-extrabold font-display text-slate-900 tabular-nums">
            {formatNTD(value)}
          </p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-500">應收 {formatNTD(due)}</span>
            <span
              className={`font-bold tabular-nums ${
                change >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {change >= 0 ? "找零 " : "尚差 "}
              {formatNTD(Math.abs(change))}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {quickAmounts.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange(value + a)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-indigo-50 hover:border-indigo-300"
            >
              +{formatNTD(a)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(due)}
            className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            剛好 {formatNTD(due)}
          </button>
          <button
            type="button"
            onClick={() => onChange(0)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            清除
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 min-w-[260px]">
        {keys.map((k, i) =>
          k ? (
            <button
              key={i}
              type="button"
              onClick={() => tap(k)}
              className="h-16 bg-white border border-slate-200 rounded-xl text-xl font-display font-bold text-slate-800 hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-transform"
            >
              {k}
            </button>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
    </div>
  );
}
