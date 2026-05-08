/**
 * customer_contacts form 的純型別／常數檔。
 */

export type CustomerContactFieldKey =
  | "role"
  | "name"
  | "phone"
  | "email"
  | "relation";

export type CustomerContactFormState = {
  error?: string;
  fieldErrors?: Partial<Record<CustomerContactFieldKey, string>>;
};

export const EMPTY_CUSTOMER_CONTACT_FORM_STATE: CustomerContactFormState = {};
