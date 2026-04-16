"use client";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  size = "md",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const btnSize = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const textSize = size === "sm" ? "text-sm w-8" : "text-base w-10";

  return (
    <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={`${btnSize} flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined text-[16px]">remove</span>
      </button>
      <div className={`${textSize} text-center font-medium tabular-nums border-x border-slate-200 py-1`}>
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={`${btnSize} flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
      </button>
    </div>
  );
}
