"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createEmployeeAction,
  updateEmployeeAction,
  type EmployeeInput,
} from "@/lib/master-data/employee-actions";
import type { EmployeeFieldKey } from "@/lib/master-data/employee-form-types";
import type { Department, Employee } from "@/lib/parts/types";

const STATUS_OPTIONS = [
  { value: "active", label: "在職" },
  { value: "on_leave", label: "留職停薪" },
  { value: "terminated", label: "已離職" },
  { value: "retired", label: "退休" },
];

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function EmployeeForm({
  mode,
  employee,
  departments,
}: {
  mode: "create" | "edit";
  employee?: Employee | null;
  departments: Department[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<EmployeeFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立員工" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fieldErr = fieldErrors;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: EmployeeInput = {
      emp_code: String(fd.get("emp_code") ?? "").trim(),
      name: String(fd.get("name") ?? "").trim(),
      email: strOrNull(fd.get("email")),
      phone: strOrNull(fd.get("phone")),
      dept_id: strOrNull(fd.get("dept_id")),
      position: strOrNull(fd.get("position")),
      hire_date: strOrNull(fd.get("hire_date")),
      leave_date: strOrNull(fd.get("leave_date")),
      pay_rate: numOrNull(fd.get("pay_rate")),
      employment_status: (strOrNull(fd.get("employment_status")) ?? "active") as EmployeeInput["employment_status"],
      notes: strOrNull(fd.get("notes")),
      ...(mode === "edit" ? { is_active: fd.get("is_active") === "on" } : {}),
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createEmployeeAction(input)
          : await updateEmployeeAction(employee!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立員工" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/employees");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{error}</strong>
          {Object.keys(fieldErr).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60" : ""}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="emp_code"
            label="員工代碼"
            required
            defaultValue={employee?.emp_code ?? ""}
            placeholder="例：D-EMP-001"
            hint="同 brand 內唯一"
            error={fieldErr.emp_code}
          />
          <FormField
            name="name"
            label="姓名"
            required
            defaultValue={employee?.name ?? ""}
            placeholder="例：陳大維"
            error={fieldErr.name}
          />
          <FormField
            name="email"
            label="Email"
            type="email"
            defaultValue={employee?.email ?? ""}
            placeholder="example@brand.tw"
            error={fieldErr.email}
          />
          <FormField
            name="phone"
            label="電話"
            type="tel"
            defaultValue={employee?.phone ?? ""}
            placeholder="0912-345-678"
            error={fieldErr.phone}
          />
          <SelectField
            name="dept_id"
            label="部門"
            defaultValue={employee?.dept_id ?? ""}
            options={departments.map((d) => ({
              value: d.id,
              label: d.name,
              hint: d.code,
            }))}
            error={fieldErr.dept_id}
          />
          <FormField
            name="position"
            label="職稱"
            defaultValue={employee?.position ?? ""}
            placeholder="例：資深技師"
            error={fieldErr.position}
          />
          <FormField
            name="hire_date"
            label="到職日"
            type="date"
            defaultValue={employee?.hire_date ?? ""}
            error={fieldErr.hire_date}
          />
          <FormField
            name="leave_date"
            label="離職日"
            type="date"
            defaultValue={employee?.leave_date ?? ""}
            error={fieldErr.leave_date}
          />
          <FormField
            name="pay_rate"
            label="薪資 / 時薪"
            type="number"
            inputMode="decimal"
            defaultValue={employee?.pay_rate ?? ""}
            placeholder="0.00"
            hint="非必填；可作工時計算用"
            error={fieldErr.pay_rate}
          />
          <SelectField
            name="employment_status"
            label="在職狀態"
            required
            defaultValue={employee?.employment_status ?? "active"}
            options={STATUS_OPTIONS}
            error={fieldErr.employment_status}
          />
        </div>

        <FormField
          name="notes"
          label="備註"
          multiline
          rows={3}
          defaultValue={employee?.notes ?? ""}
          placeholder="特殊事項、緊急聯絡人..."
        />

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D] mt-3">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={employee?.is_active ?? true}
              className="w-4 h-4"
            />
            資料啟用中（取消勾選等於停用，員工從下拉中消失）
          </label>
        )}

        <div className="flex items-center gap-3 pt-2 mt-3 border-t border-[#DFE1E6]">
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/employees"
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
