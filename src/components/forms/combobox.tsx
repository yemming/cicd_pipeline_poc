"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SelectOption } from "./select-field";

/**
 * Combobox：可搜尋的下拉。給 items / customers / 車輛車型這類有上百筆主檔的場景。
 *
 * 用法：
 *   <Combobox name="item_id" label="料號" required
 *     options={items.map(i => ({ value: i.id, label: `${i.code} ${i.name}`, hint: i.category }))}
 *     placeholder="搜尋料號或品名…"
 *   />
 *
 * 註：目前是 client-side filter（option array 全傳）。
 * 若 options 超過 ~500 筆，要改成 server-side 動態 search（Wave 1 升級）。
 */
export function Combobox({
  name,
  label,
  options,
  defaultValue,
  required,
  disabled,
  placeholder = "搜尋…",
  hint,
  error,
  className = "",
  maxResults = 50,
  onChange,
}: {
  name: string;
  label?: string;
  options: SelectOption[];
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
  maxResults?: number;
  /** 選到 / 清除時額外通知外部 controlled state（不需要走 form submit 讀值時用） */
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectOption | null>(() => {
    if (!defaultValue) return null;
    return options.find((o) => o.value === defaultValue) ?? null;
  });

  // 點外面收掉
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxResults);
    return options
      .filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.hint && o.hint.toLowerCase().includes(q)),
      )
      .slice(0, maxResults);
  }, [query, options, maxResults]);

  const display = selected
    ? selected.hint
      ? `${selected.label} — ${selected.hint}`
      : selected.label
    : "";

  return (
    <div className={className} ref={wrapRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2"
        >
          {label}
          {required && <span className="text-[#BF2600] ml-0.5">*</span>}
        </label>
      )}
      <input type="hidden" name={name} value={selected?.value ?? ""} required={required} />
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={open ? query : display}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          aria-invalid={error ? true : undefined}
          className={`w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border rounded outline-none text-[14px] text-[#172B4D] placeholder:text-[#8993A4] transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            error
              ? "border-[#BF2600] focus:border-[#BF2600] focus:shadow-[0_0_0_2px_rgba(191,38,0,0.2)]"
              : "border-transparent focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)]"
          }`}
        />
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              setOpen(true);
              onChange?.("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B778C] hover:text-[#172B4D] text-[16px] leading-none"
            aria-label="清除"
          >
            ×
          </button>
        )}
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-white border border-[#DFE1E6] rounded shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-[#6B778C]">無相符結果</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    setSelected(o);
                    setOpen(false);
                    onChange?.(o.value);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#F4F5F7] focus:bg-[#F4F5F7] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-[14px] text-[#172B4D]">{o.label}</div>
                  {o.hint && <div className="text-[12px] text-[#6B778C]">{o.hint}</div>}
                </button>
              ))
            )}
            {options.length > filtered.length && query.trim() === "" && (
              <div className="px-3 py-1.5 text-[11px] text-[#6B778C] border-t border-[#F4F5F7] bg-[#FAFBFC]">
                顯示前 {maxResults} 筆，輸入關鍵字繼續搜尋
              </div>
            )}
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-1.5 text-[12px] text-[#BF2600]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[#6B778C]">{hint}</p>
      ) : null}
    </div>
  );
}
