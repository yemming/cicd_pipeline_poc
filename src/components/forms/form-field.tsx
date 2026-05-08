"use client";

import { useId } from "react";

/**
 * 共用 FormField：label + input/textarea/number + hint/error 的統一包裝。
 *
 * 用法（form action 範例）：
 *   <FormField name="title" label="標題" required hint="一句話描述" />
 *   <FormField name="phone" label="電話" type="tel" />
 *   <FormField name="notes" label="備註" multiline rows={5} />
 */
export function FormField({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required,
  disabled,
  readOnly,
  multiline,
  rows = 4,
  hint,
  error,
  className = "",
  prefix,
  suffix,
  inputMode,
  autoComplete,
}: {
  name: string;
  label?: string;
  type?: "text" | "email" | "tel" | "url" | "number" | "date" | "datetime-local" | "password";
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  error?: string;
  className?: string;
  prefix?: string;
  suffix?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  autoComplete?: string;
}) {
  const id = useId();
  const inputCls = `w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border outline-none text-[14px] text-[#172B4D] placeholder:text-[#8993A4] transition-all disabled:opacity-60 disabled:cursor-not-allowed read-only:bg-[#F4F5F7]/60 ${
    error
      ? "border-[#BF2600] focus:border-[#BF2600] focus:shadow-[0_0_0_2px_rgba(191,38,0,0.2)]"
      : "border-transparent focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)]"
  }`;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2"
        >
          {label}
          {required && <span className="text-[#BF2600] ml-0.5">*</span>}
        </label>
      )}
      {multiline ? (
        <textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          defaultValue={defaultValue as string | undefined}
          aria-invalid={error ? true : undefined}
          className={`${inputCls} rounded resize-none`}
        />
      ) : (
        <div className={`flex items-stretch rounded overflow-hidden ${error ? "" : ""}`}>
          {prefix && (
            <span className="inline-flex items-center px-2.5 bg-[#EBECF0] text-[12px] text-[#42526E] border border-r-0 border-transparent">
              {prefix}
            </span>
          )}
          <input
            id={id}
            name={name}
            type={type}
            required={required}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            defaultValue={defaultValue}
            inputMode={inputMode}
            autoComplete={autoComplete}
            aria-invalid={error ? true : undefined}
            className={`${inputCls} ${prefix ? "" : "rounded-l"} ${suffix ? "" : "rounded-r"}`}
          />
          {suffix && (
            <span className="inline-flex items-center px-2.5 bg-[#EBECF0] text-[12px] text-[#42526E] border border-l-0 border-transparent rounded-r">
              {suffix}
            </span>
          )}
        </div>
      )}
      {error ? (
        <p className="mt-1.5 text-[12px] text-[#BF2600]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[#6B778C]">{hint}</p>
      ) : null}
    </div>
  );
}
