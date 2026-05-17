"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createSupplierAction,
  updateSupplierAction,
  type SupplierInput,
} from "@/lib/master-data/supplier-actions";
import type { SupplierFieldKey } from "@/lib/master-data/supplier-form-types";
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

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

export function SupplierForm({
  mode,
  supplier,
  accounts,
}: {
  mode: "create" | "edit";
  supplier?: Supplier | null;
  accounts: Account[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<SupplierFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立供應商" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: SupplierInput = {
      code: strOrNull(fd.get("code")),
      name: String(fd.get("name") ?? "").trim(),
      type: (strOrNull(fd.get("type")) ?? "agent") as SupplierInput["type"],
      tax_id: strOrNull(fd.get("tax_id")),
      primary_contact: strOrNull(fd.get("primary_contact")),
      phone: strOrNull(fd.get("phone")),
      email: strOrNull(fd.get("email")),
      address: strOrNull(fd.get("address")),
      payment_terms: strOrNull(fd.get("payment_terms")),
      default_currency: strOrNull(fd.get("default_currency")) ?? "TWD",
      gl_payable_coa_id: strOrNull(fd.get("gl_payable_coa_id")),
      notes: strOrNull(fd.get("notes")),
      is_active: fd.get("is_active") === "on",
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createSupplierAction(input)
          : await updateSupplierAction(supplier!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立供應商" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/suppliers");
      } else {
        router.refresh();
      }
    });
  };

  const fe = fieldErrors;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{error}</strong>
          {Object.keys(fe).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60 space-y-6" : "space-y-6"}
      >
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
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/suppliers"
            className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
          >
            取消
          </Link>
        </div>
      </fieldset>

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </form>
  );
}
