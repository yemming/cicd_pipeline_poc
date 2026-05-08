/**
 * departments form 的純型別／常數檔。
 */

export type DepartmentFieldKey =
  | "code"
  | "name"
  | "parent_id"
  | "manager_employee_id";

export type DepartmentFormState = {
  error?: string;
  fieldErrors?: Partial<Record<DepartmentFieldKey, string>>;
};

export const EMPTY_DEPARTMENT_FORM_STATE: DepartmentFormState = {};
