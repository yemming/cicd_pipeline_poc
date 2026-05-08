/**
 * customer_vehicles form 的純型別／常數檔。
 * "use server" 檔不能 export 物件，所以拆出來。
 */

export type VehicleFieldKey =
  | "customer_id"
  | "model_id"
  | "vin"
  | "license_plate"
  | "engine_no"
  | "color"
  | "manufactured_year"
  | "acquired_from"
  | "purchase_date"
  | "purchase_amount"
  | "current_mileage"
  | "last_service_date"
  | "last_service_mileage"
  | "next_service_due_date"
  | "next_service_due_mileage"
  | "warranty_until"
  | "insurance_company"
  | "insurance_policy_no"
  | "insurance_until"
  | "preferred_technician_id";

export type VehicleFormState = {
  error?: string;
  fieldErrors?: Partial<Record<VehicleFieldKey, string>>;
};

export const EMPTY_VEHICLE_FORM_STATE: VehicleFormState = {};
