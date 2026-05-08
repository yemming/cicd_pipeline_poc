/**
 * customers form 的純型別／常數檔。
 * "use server" 檔不能 export 物件，所以拆出來。
 */

export type CustomerFieldKey =
  | "code"
  | "name"
  | "type"
  | "tax_id"
  | "phone"
  | "email"
  | "address"
  | "birthday"
  | "source_module"
  | "gl_receivable_account_id"
  | "notes";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Partial<Record<CustomerFieldKey, string>>;
};

export const EMPTY_CUSTOMER_FORM_STATE: CustomerFormState = {};
