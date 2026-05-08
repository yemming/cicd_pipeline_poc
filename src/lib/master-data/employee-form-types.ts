/**
 * 拆出來的純型別 / 常數檔 — 因為 employee-actions.ts 是 "use server"，
 * 只能 export async function；型別與初始 state 必須住別處。
 */

export type EmployeeFieldKey =
  | "emp_code"
  | "name"
  | "email"
  | "phone"
  | "dept_id"
  | "position"
  | "hire_date"
  | "leave_date"
  | "pay_rate"
  | "employment_status";

export type EmployeeFormState = {
  error?: string;
  fieldErrors?: Partial<Record<EmployeeFieldKey, string>>;
};

export const EMPTY_EMPLOYEE_FORM_STATE: EmployeeFormState = {};
