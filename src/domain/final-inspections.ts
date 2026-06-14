"use server";

/**
 * Domain Helper — 售後 竣工複檢（Final Inspection）
 *
 * 對應頁面：/parts/aftersales/final-inspections（list + 5-step wizard）
 * Spec：docs/DUCATI_售後工單模組_..._最新版/06_竣工複檢_v1.html
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  Cleaning,
  FinalInspectionStatus,
  LineResult,
  NextService,
  NotificationLog,
  TestDrive,
} from "./final-inspections.constants";

export type FinalInspectionRow = {
  id: string;
  brand_id: string;
  repair_order_id: string;
  inspection_no: string;
  status: FinalInspectionStatus;
  inspector_id: string | null;
  inspector_name: string | null;
  inspector_role: string | null;
  line_results: LineResult[];
  issue_note: string | null;
  test_drive: TestDrive;
  cleaning: Cleaning;
  signed_at: string | null;
  signature_text: string | null;
  signoff_note: string | null;
  notifications: NotificationLog[];
  next_service: NextService;
  photos: string[];
  closed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FinalInspectionListRow = FinalInspectionRow & {
  ro_code: string | null;
  ro_status: string | null;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  mileage_in: number | null;
  total_lines: number;
  passed_lines: number;
  /** M-09：RO 施工主技師 ID，用於後端複檢人員驗證（inspector_id 不得等於此值） */
  lead_technician_id: string | null;
};

export type FinalInspectionFilters = {
  status?: FinalInspectionStatus | "all";
  q?: string;
};

export async function listFinalInspections(
  filters: FinalInspectionFilters = {},
): Promise<FinalInspectionListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("final_inspections")
    .select("*")
    .eq("brand_id", brand)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.q && filters.q.trim()) {
    query = query.ilike("inspection_no", `%${filters.q.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown) as FinalInspectionRow[];
  return joinList(rows, brand);
}

export async function getFinalInspectionById(id: string): Promise<FinalInspectionListRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("final_inspections")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const list = await joinList([data as unknown as FinalInspectionRow], brand);
  return list[0] ?? null;
}

export async function getFinalInspectionByRoId(
  ro_id: string,
): Promise<FinalInspectionListRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("final_inspections")
    .select("*")
    .eq("repair_order_id", ro_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const list = await joinList([data as unknown as FinalInspectionRow], brand);
  return list[0] ?? null;
}

/** 撈「可以建立竣工複檢」的 RO 候選（status 是維修中 / 進行中、且還沒有 final inspection） */
export type RoCandidate = {
  id: string;
  ro_code: string;
  status: string;
  customer_name: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  mileage_in: number | null;
  line_count: number;
};

export async function listRoCandidatesForInspection(): Promise<RoCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: existed } = await supabase
    .from("final_inspections")
    .select("repair_order_id")
    .eq("brand_id", brand);
  const exclude = new Set(((existed ?? []) as { repair_order_id: string }[]).map((r) => r.repair_order_id));

  const { data: ros, error } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id, vehicle_id, mileage_in")
    .eq("brand_id", brand)
    .in("status", ["維修中", "進行中"])
    .order("issue_date", { ascending: false })
    .limit(200);
  if (error) throw error;
  const roList = (ros ?? []).filter((r) => !exclude.has(r.id));
  if (roList.length === 0) return [];

  const ids = roList.map((r) => r.id);
  const customerIds = Array.from(new Set(roList.map((r) => r.customer_id).filter(Boolean) as string[]));
  const vehicleIds = Array.from(new Set(roList.map((r) => r.vehicle_id).filter(Boolean) as string[]));

  const [linesRes, custRes, vehRes] = await Promise.all([
    supabase.from("repair_order_lines").select("repair_order_id").in("repair_order_id", ids),
    customerIds.length
      ? supabase.from("customers").select("id, name").eq("brand_id", brand).in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            license_plate: string;
            vehicle_models: { name?: string } | { name?: string }[] | null;
          }>,
        }),
  ]);
  const lineCount = new Map<string, number>();
  ((linesRes.data ?? []) as { repair_order_id: string }[]).forEach((l) => {
    lineCount.set(l.repair_order_id, (lineCount.get(l.repair_order_id) ?? 0) + 1);
  });
  const custMap = new Map(((custRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models: { name?: string } | { name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { license_plate: v.license_plate, model: m?.name ?? null }] as const;
    }),
  );

  return roList.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    customer_name: r.customer_id ? custMap.get(r.customer_id) ?? null : null,
    vehicle_license_plate: r.vehicle_id ? vehMap.get(r.vehicle_id)?.license_plate ?? null : null,
    vehicle_model_name: r.vehicle_id ? vehMap.get(r.vehicle_id)?.model ?? null : null,
    mileage_in: r.mileage_in,
    line_count: lineCount.get(r.id) ?? 0,
  }));
}

/** 撈一張 RO 的 lines（用於建立複檢時預載 line_results） */
export async function listRepairOrderLinesById(ro_id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repair_order_lines")
    .select("id, line_no, kind, labor_name, part_name, labor_note")
    .eq("repair_order_id", ro_id)
    .order("line_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    part_name: string | null;
    labor_note: string | null;
  }>;
}

async function joinList(
  rows: FinalInspectionRow[],
  brand_id: string,
): Promise<FinalInspectionListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const roIds = Array.from(new Set(rows.map((r) => r.repair_order_id)));
  const { data: roData } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id, vehicle_id, mileage_in, lead_technician_id")
    .in("id", roIds)
    .eq("brand_id", brand_id);
  const roMap = new Map(
    ((roData ?? []) as Array<{
      id: string;
      ro_code: string;
      status: string;
      customer_id: string | null;
      vehicle_id: string | null;
      mileage_in: number | null;
      lead_technician_id: string | null;
    }>).map((r) => [r.id, r]),
  );
  const customerIds = Array.from(
    new Set(((roData ?? []) as { customer_id: string | null }[]).map((r) => r.customer_id).filter(Boolean) as string[]),
  );
  const vehicleIds = Array.from(
    new Set(((roData ?? []) as { vehicle_id: string | null }[]).map((r) => r.vehicle_id).filter(Boolean) as string[]),
  );
  const [custRes, vehRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").eq("brand_id", brand_id).in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            license_plate: string;
            vehicle_models: { name?: string } | { name?: string }[] | null;
          }>,
        }),
  ]);
  const custMap = new Map(((custRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models: { name?: string } | { name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { license_plate: v.license_plate, model: m?.name ?? null }] as const;
    }),
  );

  return rows.map((r) => {
    const ro = roMap.get(r.repair_order_id);
    const customer = ro?.customer_id ? custMap.get(ro.customer_id) ?? null : null;
    const veh = ro?.vehicle_id ? vehMap.get(ro.vehicle_id) : null;
    const lineResults = Array.isArray(r.line_results) ? (r.line_results as LineResult[]) : [];
    const passed = lineResults.filter((l) => l.state === "ok").length;
    return {
      ...r,
      line_results: lineResults,
      test_drive: (r.test_drive ?? {}) as TestDrive,
      cleaning: (r.cleaning ?? {}) as Cleaning,
      notifications: Array.isArray(r.notifications) ? (r.notifications as NotificationLog[]) : [],
      next_service: (r.next_service ?? {}) as NextService,
      photos: Array.isArray(r.photos) ? (r.photos as string[]) : [],
      ro_code: ro?.ro_code ?? null,
      ro_status: ro?.status ?? null,
      customer_name: customer,
      vehicle_license_plate: veh?.license_plate ?? null,
      vehicle_model_name: veh?.model ?? null,
      mileage_in: ro?.mileage_in ?? null,
      total_lines: lineResults.length,
      passed_lines: passed,
      lead_technician_id: ro?.lead_technician_id ?? null,
    };
  });
}
