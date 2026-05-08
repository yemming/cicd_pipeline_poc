"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_CUSTOMER_CONTACT_FORM_STATE,
  type CustomerContactFormState,
} from "@/lib/master-data/customer-contact-form-types";
import type { CustomerContact } from "@/lib/parts/types";

const ROLE_OPTIONS = [
  { value: "primary", label: "主要聯絡人" },
  { value: "emergency", label: "緊急聯絡人" },
  { value: "family", label: "家屬" },
  { value: "secretary", label: "秘書 / 助理" },
  { value: "other", label: "其他" },
];

type Action = (
  prev: CustomerContactFormState,
  fd: FormData,
) => Promise<CustomerContactFormState>;

export function ContactForm({
  mode,
  action,
  customerId,
  contact,
}: {
  mode: "create" | "edit";
  action: Action;
  customerId: string;
  contact?: CustomerContact | null;
}) {
  const [state, formAction] = useActionState<CustomerContactFormState, FormData>(
    action,
    EMPTY_CUSTOMER_CONTACT_FORM_STATE,
  );

  const submitIdle = mode === "create" ? "新增聯絡人" : "儲存變更";
  const submitPending = mode === "create" ? "新增中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="customer_id" value={customerId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}

      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{state.error}</strong>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          name="role"
          label="角色"
          required
          defaultValue={contact?.role ?? "primary"}
          options={ROLE_OPTIONS}
        />
        <FormField
          name="name"
          label="姓名"
          required
          defaultValue={contact?.name ?? ""}
          error={fe.name}
        />
        <FormField
          name="phone"
          label="電話"
          type="tel"
          defaultValue={contact?.phone ?? ""}
          error={fe.phone}
        />
        <FormField
          name="email"
          label="Email"
          type="email"
          defaultValue={contact?.email ?? ""}
          error={fe.email}
        />
        <FormField
          name="relation"
          label="關係 / 職稱"
          defaultValue={contact?.relation ?? ""}
          placeholder="例：父親 / 配偶 / 助理"
          error={fe.relation}
        />
      </div>

      <FormField
        name="notes"
        label="備註"
        multiline
        rows={2}
        defaultValue={contact?.notes ?? ""}
        placeholder="可聯絡時段 / 偏好語言…"
      />

      {mode === "edit" && (
        <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={contact?.is_active ?? true}
            className="w-4 h-4"
          />
          仍在使用（取消勾選等同停用此聯絡人）
        </label>
      )}

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href={`/admin/master-data/customers/${customerId}`}
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
