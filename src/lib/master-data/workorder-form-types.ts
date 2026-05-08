/**
 * work_orders form 純型別 / 常數檔。
 */

export type WorkOrderFieldKey =
  | "ro_no"
  | "customer_id"
  | "vehicle_id"
  | "appointment_id"
  | "status"
  | "advisor_id"
  | "lead_technician_id"
  | "opened_at"
  | "mileage_in"
  | "mileage_out"
  | "customer_complaint"
  | "diagnosis"
  | "work_summary"
  | "items";

export type WorkOrderFormState = {
  error?: string;
  fieldErrors?: Partial<Record<WorkOrderFieldKey, string>>;
};

export const EMPTY_WORK_ORDER_FORM_STATE: WorkOrderFormState = {};

export type WorkOrderItemDraft = {
  /** 已存在的 item id；新加的 row 留 null */
  id: string | null;
  line_no: number;
  kind: "parts" | "labor" | "external" | "discount";
  item_id: string | null;
  labor_code: string | null;
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  technician_id: string | null;
  labor_minutes: number | null;
  is_warranty: boolean;
  notes: string | null;
};

export const EMPTY_ITEM_DRAFT: Omit<WorkOrderItemDraft, "line_no"> = {
  id: null,
  kind: "parts",
  item_id: null,
  labor_code: null,
  description: "",
  qty: 1,
  unit_price: 0,
  amount: 0,
  technician_id: null,
  labor_minutes: null,
  is_warranty: false,
  notes: null,
};
