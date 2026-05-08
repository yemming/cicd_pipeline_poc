/**
 * service_appointments form 純型別 / 常數檔。
 * "use server" 檔不能 export 物件，所以拆出來。
 */

export type AppointmentFieldKey =
  | "customer_id"
  | "vehicle_id"
  | "appt_no"
  | "scheduled_at"
  | "duration_minutes"
  | "service_type"
  | "mileage_at_appointment"
  | "status"
  | "advisor_id";

export type AppointmentFormState = {
  error?: string;
  fieldErrors?: Partial<Record<AppointmentFieldKey, string>>;
};

export const EMPTY_APPOINTMENT_FORM_STATE: AppointmentFormState = {};
