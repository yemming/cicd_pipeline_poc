export type SupplierPricingFieldKey =
  | "supplier_id"
  | "item_id"
  | "is_primary"
  | "unit_price"
  | "currency"
  | "lead_time_days"
  | "min_order_qty"
  | "order_multiple"
  | "valid_from"
  | "valid_to"
  | "notes";

export type SupplierPricingFormState = {
  error?: string;
  fieldErrors?: Partial<Record<SupplierPricingFieldKey, string>>;
};

export const EMPTY_SUPPLIER_PRICING_FORM_STATE: SupplierPricingFormState = {};

export type SupplierPricingRow = {
  id: string;
  brand_id: string;
  supplier_id: string;
  item_id: string;
  is_primary: boolean;
  unit_price: number;
  currency: string;
  lead_time_days: number;
  min_order_qty: number;
  order_multiple: number;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
