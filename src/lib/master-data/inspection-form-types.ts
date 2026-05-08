/**
 * inspection_records form 純型別 / 常數檔。
 */

export type InspectionFieldKey =
  | "kind"
  | "vehicle_id"
  | "work_order_id"
  | "appointment_id"
  | "inspector_id"
  | "inspected_at"
  | "mileage_at_inspection"
  | "overall_status"
  | "customer_signature_url"
  | "notes"
  | "findings";

export type InspectionFormState = {
  error?: string;
  fieldErrors?: Partial<Record<InspectionFieldKey, string>>;
};

export const EMPTY_INSPECTION_FORM_STATE: InspectionFormState = {};

export type InspectionFindingDraft = {
  id: string | null;
  category: string;
  item_label: string;
  status: "ok" | "needs_attention" | "critical" | "na";
  measurement: string | null;
  notes: string | null;
  photo_url: string | null;
};

export const EMPTY_FINDING_DRAFT: InspectionFindingDraft = {
  id: null,
  category: "",
  item_label: "",
  status: "ok",
  measurement: null,
  notes: null,
  photo_url: null,
};
