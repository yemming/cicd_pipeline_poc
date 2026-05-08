"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_CUSTOMER_FORM_STATE,
  type CustomerFormState,
} from "@/lib/master-data/customer-form-types";
import type { Account, Customer } from "@/lib/parts/types";

const TYPE_OPTIONS = [
  { value: "individual", label: "個人" },
  { value: "corporate", label: "公司行號" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "—" },
  { value: "walk_in", label: "店頭走客" },
  { value: "referral", label: "客戶介紹" },
  { value: "online", label: "網路詢問" },
  { value: "event", label: "車聚活動" },
  { value: "transfer", label: "車主轉讓" },
  { value: "other", label: "其他" },
];

type Action = (
  prev: CustomerFormState,
  fd: FormData,
) => Promise<CustomerFormState>;

export function CustomerForm({
  mode,
  action,
  customer,
  accounts,
}: {
  mode: "create" | "edit";
  action: Action;
  customer?: Customer | null;
  accounts: Account[];
}) {
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    action,
    EMPTY_CUSTOMER_FORM_STATE,
  );

  const submitIdle = mode === "create" ? "建立客戶" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {customer && <input type="hidden" name="id" value={customer.id} />}

      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{state.error}</strong>
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      {/* 基本資料 */}
      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          基本資料
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="code"
            label="客戶代碼"
            defaultValue={customer?.code ?? ""}
            required={mode === "edit"}
            placeholder={mode === "create" ? "留空自動產生 C00001…" : ""}
            hint={mode === "create" ? "同 brand 內 code 唯一；可手動指定" : "改動會影響歷史單據參照"}
            error={fe.code}
          />
          <FormField
            name="name"
            label="客戶名稱"
            required
            defaultValue={customer?.name ?? ""}
            placeholder="個人姓名 / 公司行號全名"
            error={fe.name}
          />
          <SelectField
            name="type"
            label="類型"
            required
            defaultValue={customer?.type ?? "individual"}
            options={TYPE_OPTIONS}
            error={fe.type}
          />
          <FormField
            name="tax_id"
            label="統一編號"
            defaultValue={customer?.tax_id ?? ""}
            placeholder="公司行號必填，個人可空白"
            hint="8 碼數字"
            error={fe.tax_id}
          />
        </div>
      </section>

      {/* 聯絡方式 */}
      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          聯絡方式
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="phone"
            label="電話"
            type="tel"
            defaultValue={customer?.phone ?? ""}
            placeholder="0912-345-678 / 02-1234-5678"
            error={fe.phone}
          />
          <FormField
            name="email"
            label="Email"
            type="email"
            defaultValue={customer?.email ?? ""}
            error={fe.email}
          />
          <div className="col-span-2">
            <FormField
              name="address"
              label="地址"
              defaultValue={customer?.address ?? ""}
              placeholder="例：台北市信義區松仁路 100 號"
              error={fe.address}
            />
          </div>
        </div>
      </section>

      {/* 補充 */}
      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          補充資訊
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="birthday"
            label="生日"
            type="date"
            defaultValue={customer?.birthday ?? ""}
            hint="個人客戶用於生日關懷；公司客戶可空白"
            error={fe.birthday}
          />
          <SelectField
            name="source_module"
            label="來源管道"
            defaultValue={customer?.source_module ?? ""}
            options={SOURCE_OPTIONS}
            hint="客戶最初是怎麼找上門的"
            error={fe.source_module}
          />
          <div className="col-span-2">
            <Combobox
              name="gl_receivable_account_id"
              label="應收帳款科目"
              placeholder="搜尋科目代碼 / 名稱…"
              defaultValue={customer?.gl_receivable_account_id ?? ""}
              options={accounts.map((a) => ({
                value: a.id,
                label: a.acct_name,
                hint: [a.acct_no, a.acct_type].filter(Boolean).join(" · "),
              }))}
              hint="非必填；接 NetSuite 對帳時用，現階段可空白"
              error={fe.gl_receivable_account_id}
            />
          </div>
        </div>
      </section>

      {/* 備註 */}
      <FormField
        name="notes"
        label="備註"
        multiline
        rows={3}
        defaultValue={customer?.notes ?? ""}
        placeholder="VIP 等級 / 偏好聯絡時段 / 特殊需求…"
      />

      {mode === "edit" && (
        <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={customer?.is_active ?? true}
            className="w-4 h-4"
          />
          客戶仍在往來中（停用後不會出現在新單據的 dropdown）
        </label>
      )}

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/customers"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
