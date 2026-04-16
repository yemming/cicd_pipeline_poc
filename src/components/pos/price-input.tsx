"use client";

import { type ChangeEvent } from "react";

export function PriceInput({
  value,
  onChange,
  placeholder = "0",
  readOnly,
  className = "",
  size = "md",
}: {
  value: number;
  onChange?: (n: number) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const formatted = value === 0 ? "" : value.toLocaleString("zh-TW");
  const sizeCls =
    size === "sm"
      ? "h-9 text-sm pl-10 pr-3"
      : size === "lg"
        ? "h-14 text-2xl pl-14 pr-4 font-display font-bold"
        : "h-11 text-base pl-11 pr-3";

  const prefixCls =
    size === "sm"
      ? "left-3 text-xs"
      : size === "lg"
        ? "left-4 text-base font-bold"
        : "left-3 text-sm";

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, "");
    const n = raw === "" ? 0 : parseInt(raw, 10);
    onChange?.(n);
  }

  return (
    <div className={`relative ${className}`}>
      <span className={`absolute top-1/2 -translate-y-1/2 text-slate-400 font-medium ${prefixCls}`}>
        NT$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={handle}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full ${sizeCls} bg-slate-50 border border-slate-200 rounded-xl text-right tabular-nums font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${readOnly ? "cursor-default" : ""}`}
      />
    </div>
  );
}
