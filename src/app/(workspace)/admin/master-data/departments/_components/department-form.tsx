"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_DEPARTMENT_FORM_STATE,
  type DepartmentFormState,
} from "@/lib/master-data/department-form-types";
import type { Department, Employee } from "@/lib/parts/types";

type Action = (
  prev: DepartmentFormState,
  fd: FormData,
) => Promise<DepartmentFormState>;

export function DepartmentForm({
  mode,
  action,
  department,
  parents,
  employees,
}: {
  mode: "create" | "edit";
  action: Action;
  department?: Department | null;
  parents: Department[];
  employees: Employee[];
}) {
  const [state, formAction] = useActionState<DepartmentFormState, FormData>(
    action,
    EMPTY_DEPARTMENT_FORM_STATE,
  );

  const submitIdle = mode === "create" ? "建立部門" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {department && <input type="hidden" name="id" value={department.id} />}

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
            label="部門代碼"
            required
            defaultValue={department?.code ?? ""}
            placeholder="例：SVC / SAL / PRT"
            hint="同 brand 內 code 唯一"
            error={fe.code}
          />
          <FormField
            name="name"
            label="部門名稱"
            required
            defaultValue={department?.name ?? ""}
            placeholder="例：維修部"
            error={fe.name}
          />
          <Combobox
            name="parent_id"
            label="上層部門"
            placeholder="搜尋部門代碼 / 名稱…"
            defaultValue={department?.parent_id ?? ""}
            options={parents
              .filter((p) => p.id !== department?.id)
              .map((p) => ({
                value: p.id,
                label: p.name,
                hint: p.code,
              }))}
            hint="留空表示頂層部門"
            error={fe.parent_id}
          />
          <Combobox
            name="manager_employee_id"
            label="部門主管"
            placeholder="搜尋姓名 / 員工代碼…"
            defaultValue={department?.manager_employee_id ?? ""}
            options={employees.map((e) => ({
              value: e.id,
              label: e.name,
              hint: [e.emp_code, e.position].filter(Boolean).join(" · "),
            }))}
            hint="非必填；指定後員工列表可顯示主管"
            error={fe.manager_employee_id}
          />
        </div>
      </section>

      {mode === "edit" && (
        <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={department?.is_active ?? true}
            className="w-4 h-4"
          />
          部門仍在營運中（停用後不會出現在新員工的 dropdown）
        </label>
      )}

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/departments"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
