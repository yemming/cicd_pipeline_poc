/**
 * Client-safe constants — Test Ride Incidents（試乘事故記錄）
 *
 * 純展示常數 / type；server-only 的 query / mutation 留在 test-ride-incidents.ts。
 */

export type TestRideIncidentRow = {
  id: string;
  test_drive_id: string;
  incident_occurred: boolean;
  reported_by: string;
  reported_at: string;
  brand_id: string;
  store_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReportTestRideIncidentInput = {
  test_drive_id: string;
  /** 關聯的 new_car_inventory id（若試駕車在庫存中，凍結為 incident_hold） */
  vehicle_inventory_id?: string | null;
  description: string;
  location?: string | null;
  injured?: boolean;
  damage_description?: string | null;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
