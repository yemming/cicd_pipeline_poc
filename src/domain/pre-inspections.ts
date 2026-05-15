"use server";

/**
 * Domain Helper — 售後 接待預檢（SA Pre-Inspection）
 *
 * 對應頁面：/parts/aftersales/pre-inspections（list + 5-step wizard）
 * Spec：DUCATI 售後預檢單 v2
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  CheckRow,
  DotMark,
  PreInspectionStatus,
  SaQuoteItem,
  Signature,
  TechRow,
} from "./pre-inspections.constants";

export type PreInspectionMetadata = {
  dot_marks?: DotMark[];
  checks?: CheckRow[];
  purposes?: number[];
  customer_words?: string;
  asks?: Record<string, "yes" | "no" | "na">;
  sa_remark?: string;
  tech_rows?: TechRow[];
  sa_items?: SaQuoteItem[];
  sig_sa?: Signature;
  sig_customer?: Signature;
  warranty_snapshot?: {
    valid?: boolean;
    started_at?: string;
    expires_at?: string;
    mileage?: string;
  };
};

export type PreInspectionRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  pi_no: string;
  status: PreInspectionStatus;
  appointment_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  repair_order_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  mileage_in: number | null;
  sa_id: string | null;
  sa_name: string | null;
  estimated_subtotal: number | null;
  estimated_labor_units: number | null;
  metadata: PreInspectionMetadata | null;
  signed_at: string | null;
  transferred_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PreInspectionListRow = PreInspectionRow & {
  total_checks: number;
  done_checks: number;
  warning_count: number;
  damage_count: number;
};

export type PreInspectionFilters = {
  status?: PreInspectionStatus | "all";
  q?: string;
};

function decorate(rows: PreInspectionRow[]): PreInspectionListRow[] {
  return rows.map((r) => {
    const checks = (r.metadata?.checks ?? []) as CheckRow[];
    const total = checks.length;
    const done = checks.filter((c) => c.state >= 0).length;
    const warn = checks.filter((c) => c.state === 1).length;
    const dmg = checks.filter((c) => c.state === 2).length;
    return { ...r, total_checks: total, done_checks: done, warning_count: warn, damage_count: dmg };
  });
}

export async function listPreInspections(
  filters: PreInspectionFilters = {},
): Promise<PreInspectionListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("pre_inspections")
    .select("*")
    .eq("brand_id", brand)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    query = query.or(
      `pi_no.ilike.%${q}%,customer_name.ilike.%${q}%,vehicle_license_plate.ilike.%${q}%`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return decorate((data ?? []) as unknown as PreInspectionRow[]);
}

export async function getPreInspectionById(
  id: string,
): Promise<PreInspectionListRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("pre_inspections")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return decorate([data as unknown as PreInspectionRow])[0] ?? null;
}

/** 撈可建立預檢的「已到店未轉預檢」appointment 候選 */
export type AppointmentCandidate = {
  id: string;
  appt_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  scheduled_at: string;
  status: string;
};

export async function listAppointmentCandidates(): Promise<AppointmentCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: existed } = await supabase
    .from("pre_inspections")
    .select("appointment_id")
    .eq("brand_id", brand)
    .not("appointment_id", "is", null);
  const exclude = new Set(
    ((existed ?? []) as { appointment_id: string }[]).map((r) => r.appointment_id),
  );

  const { data, error } = await supabase
    .from("service_appointments")
    .select("id, appt_no, customer_id, vehicle_id, scheduled_at, status")
    .eq("brand_id", brand)
    .in("status", ["confirmed", "checked_in", "in_progress"])
    .order("scheduled_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const apps = (data ?? []).filter((a) => !exclude.has(a.id));
  if (apps.length === 0) return [];

  const customerIds = Array.from(
    new Set(apps.map((a) => a.customer_id).filter(Boolean) as string[]),
  );
  const vehicleIds = Array.from(
    new Set(apps.map((a) => a.vehicle_id).filter(Boolean) as string[]),
  );

  const [custRes, vehRes] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("brand_id", brand)
          .in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(display_name, model_name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            license_plate: string;
            vehicle_models:
              | { display_name?: string | null; model_name?: string | null }
              | { display_name?: string | null; model_name?: string | null }[]
              | null;
          }>,
        }),
  ]);
  const custMap = new Map(
    ((custRes.data ?? []) as { id: string; name: string; phone: string | null }[]).map((c) => [
      c.id,
      { name: c.name, phone: c.phone },
    ]),
  );
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string;
      vehicle_models:
        | { display_name?: string | null; model_name?: string | null }
        | { display_name?: string | null; model_name?: string | null }[]
        | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [
        v.id,
        {
          license_plate: v.license_plate,
          model: m?.display_name ?? m?.model_name ?? null,
        },
      ] as const;
    }),
  );

  return apps.map((a) => ({
    id: a.id,
    appt_no: a.appt_no,
    customer_name: a.customer_id ? custMap.get(a.customer_id)?.name ?? null : null,
    customer_phone: a.customer_id ? custMap.get(a.customer_id)?.phone ?? null : null,
    vehicle_license_plate: a.vehicle_id ? vehMap.get(a.vehicle_id)?.license_plate ?? null : null,
    vehicle_model_name: a.vehicle_id ? vehMap.get(a.vehicle_id)?.model ?? null : null,
    scheduled_at: a.scheduled_at,
    status: a.status,
  }));
}
