import Link from "next/link";

import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Department, Employee } from "@/lib/parts/types";

const STATUS_OPTIONS = [
  { value: "active", label: "在職" },
  { value: "on_leave", label: "留職停薪" },
  { value: "terminated", label: "已離職" },
  { value: "retired", label: "退休" },
];

export function EmployeeForm({
  mode,
  action,
  employee,
  departments,
}: {
  mode: "create" | "edit";
  action: (fd: FormData) => Promise<void>;
  employee?: Employee | null;
  departments: Department[];
}) {
  const submitIdle = mode === "create" ? "建立員工" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";

  return (
    <form action={action} className="space-y-5">
      {employee && <input type="hidden" name="id" value={employee.id} />}

      <div className="grid grid-cols-2 gap-4">
        <FormField
          name="emp_code"
          label="員工代碼"
          required
          defaultValue={employee?.emp_code ?? ""}
          placeholder="例：D-EMP-001"
          hint="同 brand 內唯一"
        />
        <FormField
          name="name"
          label="姓名"
          required
          defaultValue={employee?.name ?? ""}
          placeholder="例：陳大維"
        />
        <FormField
          name="email"
          label="Email"
          type="email"
          defaultValue={employee?.email ?? ""}
          placeholder="example@brand.tw"
        />
        <FormField
          name="phone"
          label="電話"
          type="tel"
          defaultValue={employee?.phone ?? ""}
          placeholder="0912-345-678"
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
        />
        <FormField
          name="position"
          label="職稱"
          defaultValue={employee?.position ?? ""}
          placeholder="例：資深技師"
        />
        <FormField
          name="hire_date"
          label="到職日"
          type="date"
          defaultValue={employee?.hire_date ?? ""}
        />
        <FormField
          name="leave_date"
          label="離職日"
          type="date"
          defaultValue={employee?.leave_date ?? ""}
        />
        <FormField
          name="pay_rate"
          label="薪資 / 時薪"
          type="number"
          inputMode="decimal"
          defaultValue={employee?.pay_rate ?? ""}
          placeholder="0.00"
          hint="非必填；可作工時計算用"
        />
        <SelectField
          name="employment_status"
          label="在職狀態"
          required
          defaultValue={employee?.employment_status ?? "active"}
          options={STATUS_OPTIONS}
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
        <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={employee?.is_active ?? true}
            className="w-4 h-4"
          />
          資料啟用中（取消勾選等於停用，員工從下拉中消失）
        </label>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/employees"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
