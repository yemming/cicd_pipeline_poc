"use client";

import { useId } from "react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** 第二行附註，e.g. 客戶代碼、統編 */
  hint?: string;
};

/**
 * 共用 SelectField：受 master-data queries 驅動的下拉。
 *
 * server component 先 await listCustomers/Items/...，傳 options 進來。
 * 不在 client 裡打 supabase（保 RLS）。
 *
 * 用法（在 form 裡）：
 *   const items = await listItems();
 *   <SelectField name="item_id" label="料號" required
 *     options={items.map(i => ({ value: i.id, label: `${i.code} ${i.name}`, hint: i.category }))}
 *   />
 */
export function SelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  disabled,
  placeholder = "請選擇…",
  hint,
  error,
  className = "",
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
}) {
  const id = useId();

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
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={`w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border rounded outline-none text-[14px] text-[#172B4D] transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          error
            ? "border-[#BF2600] focus:border-[#BF2600] focus:shadow-[0_0_0_2px_rgba(191,38,0,0.2)]"
            : "border-transparent focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)]"
        }`}
      >
        {!required && <option value="">{placeholder}</option>}
        {required && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
            {o.hint ? `  —  ${o.hint}` : ""}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1.5 text-[12px] text-[#BF2600]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-[#6B778C]">{hint}</p>
      ) : null}
    </div>
  );
}
