/**
 * suppliers form 的純型別／常數檔。
 */

export type SupplierFieldKey =
  | "code"
  | "name"
  | "type"
  | "tax_id"
  | "primary_contact"
  | "phone"
  | "email"
  | "address"
  | "payment_terms"
  | "default_currency"
  | "gl_payable_coa_id"
  | "notes";

export type SupplierFormState = {
  error?: string;
  fieldErrors?: Partial<Record<SupplierFieldKey, string>>;
};

export const EMPTY_SUPPLIER_FORM_STATE: SupplierFormState = {};
