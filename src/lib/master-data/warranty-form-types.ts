/**
 * warranty_claims form 純型別 / 常數檔。
 */

export type WarrantyFieldKey =
  | "cl_no"
  | "claim_type"
  | "claim_date"
  | "ro_id"
  | "vin"
  | "customer_id"
  | "vehicle_model_id"
  | "status"
  | "applied_amount"
  | "approved_amount"
  | "parts_cost"
  | "labor_cost"
  | "forecast_receipt_date"
  | "actual_receipt_date"
  | "oem_reference_no"
  | "lines";

export type WarrantyFormState = {
  error?: string;
  fieldErrors?: Partial<Record<WarrantyFieldKey, string>>;
};

export const EMPTY_WARRANTY_FORM_STATE: WarrantyFormState = {};

export type WarrantyLineDraft = {
  id: string | null;
  line_no: number;
  item_id: string;
  serial_no: string | null;
  qty: number;
  parts_cost: number;
  labor_cost: number;
  applied_amount: number;
  approved_amount: number | null;
  notes: string | null;
};

export const EMPTY_LINE_DRAFT: Omit<WarrantyLineDraft, "line_no"> = {
  id: null,
  item_id: "",
  serial_no: null,
  qty: 1,
  parts_cost: 0,
  labor_cost: 0,
  applied_amount: 0,
  approved_amount: null,
  notes: null,
};
