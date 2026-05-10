"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_SUPPLIER_FORM_STATE,
  type SupplierFormState,
} from "@/lib/master-data/supplier-form-types";
import type { Account, Supplier } from "@/lib/parts/types";

const TYPE_OPTIONS = [
  { value: "oem", label: "OEM 原廠" },
  { value: "agent", label: "代理商" },
  { value: "consumable", label: "耗材／工具" },
  { value: "services", label: "服務商" },
  { value: "other", label: "其他" },
];

const CURRENCY_OPTIONS = [
  { value: "TWD", label: "TWD（新台幣）" },
  { value: "USD", label: "USD（美元）" },
  { value: "EUR", label: "EUR（歐元）" },
  { value: "JPY", label: "JPY（日圓）" },
  { value: "CNY", label: "CNY（人民幣）" },
];

type Action = (
  prev: SupplierFormState,
  fd: FormData,
) => Promise<SupplierFormState>;

export function SupplierForm({
  mode,
  action,
  supplier,
  accounts,
}: {
  mode: "create" | "edit";
  action: Action;
  supplier?: Supplier | null;
  accounts: Account[];
}) {
  const [state, formAction] = useActionState<SupplierFormState, FormData>(
    action,
    EMPTY_SUPPLIER_FORM_STATE,
  );

  const submitIdle = mode === "create" ? "建立供應商" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}

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

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          基本資料
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="code"
            label="供應商代碼"
            defaultValue={supplier?.code ?? ""}
            required={mode === "edit"}
            placeholder={mode === "create" ? "留空自動產生 S00001…" : ""}
            hint={mode === "create" ? "同 brand 內 code 唯一；可手動指定" : "改動會影響歷史單據參照"}
            error={fe.code}
          />
          <FormField
            name="name"
            label="供應商名稱"
            required
            defaultValue={supplier?.name ?? ""}
            placeholder="公司行號全名"
            error={fe.name}
          />
          <SelectField
            name="type"
            label="供應商類型"
            required
            defaultValue={supplier?.type ?? "agent"}
            options={TYPE_OPTIONS}
            error={fe.type}
          />
          <FormField
            name="tax_id"
            label="統一編號"
            defaultValue={supplier?.tax_id ?? ""}
            placeholder="8 碼數字"
            error={fe.tax_id}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          聯絡方式
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="primary_contact"
            label="主要聯絡人"
            defaultValue={supplier?.primary_contact ?? ""}
            error={fe.primary_contact}
          />
          <FormField
            name="phone"
            label="電話"
            type="tel"
            defaultValue={supplier?.phone ?? ""}
            error={fe.phone}
          />
          <FormField
            name="email"
            label="Email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            error={fe.email}
          />
          <div />
          <div className="col-span-2">
            <FormField
              name="address"
              label="地址"
              defaultValue={supplier?.address ?? ""}
              error={fe.address}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          帳務 / 採購
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="payment_terms"
            label="付款條件"
            defaultValue={supplier?.payment_terms ?? ""}
            placeholder="例：月結 30 天 / Net 30 / 預付"
            error={fe.payment_terms}
          />
          <SelectField
            name="default_currency"
            label="預設幣別"
            required
            defaultValue={supplier?.default_currency ?? "TWD"}
            options={CURRENCY_OPTIONS}
            error={fe.default_currency}
          />
          <div className="col-span-2">
            <Combobox
              name="gl_payable_coa_id"
              label="應付帳款科目"
              placeholder="搜尋科目代碼 / 名稱…"
              defaultValue={supplier?.gl_payable_coa_id ?? ""}
              options={accounts.map((a) => ({
                value: a.id,
                label: a.name_zh_tw,
                hint: [a.account_code, a.l1_category].filter(Boolean).join(" · "),
              }))}
              hint="非必填；接 NetSuite 對帳時用"
              error={fe.gl_payable_coa_id}
            />
          </div>
        </div>
      </section>

      <FormField
        name="notes"
        label="備註"
        multiline
        rows={3}
        defaultValue={supplier?.notes ?? ""}
        placeholder="供貨範圍 / 交期偏好 / 特殊條款…"
      />

      {mode === "edit" && (
        <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={supplier?.is_active ?? true}
            className="w-4 h-4"
          />
          供應商仍在往來中（停用後不會出現在新採購單的 dropdown）
        </label>
      )}

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/suppliers"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
