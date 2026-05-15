"use server";

/**
 * ro-handoffs domain helper
 *
 * 售後「串接工單」資料層 — 以 `pre_inspections` 為主表（無獨立 handoff 表），
 * 衍生 `handoff_status` chip + 提供 list / detail 查詢。
 *
 * 對應 nav_node: indian/串接工單 (id=f5f5f6e3-...)。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { HandoffStatus } from "./ro-handoffs.constants";

export type HandoffListRow = {
  id: string;
  brand_id: string;
  pi_no: string;
  pi_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  mileage_in: number | null;
  sa_name: string | null;
  estimated_subtotal: number | null;
  signed_at: string | null;
  transferred_at: string | null;
  repair_order_id: string | null;
  ro_code: string | null;
  ro_status: string | null;
  handoff_status: HandoffStatus;
  updated_at: string;
};

export type HandoffDetail = HandoffListRow & {
  appointment_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  estimated_labor_units: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function deriveStatus(row: {
  signed_at: string | null;
  repair_order_id: string | null;
}): HandoffStatus {
  if (row.repair_order_id) return "transferred";
  if (row.signed_at) return "ready";
  return "awaiting_signature";
}

export type ListFilter = {
  status?: HandoffStatus | "all";
  q?: string;
};

export async function listHandoffs(filter: ListFilter = {}): Promise<HandoffListRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("pre_inspections")
    .select(
      `id, brand_id, pi_no, status, customer_name, customer_phone,
       vehicle_license_plate, vehicle_model_name, mileage_in, sa_name,
       estimated_subtotal, signed_at, transferred_at, repair_order_id,
       updated_at,
       repair_order:repair_orders!pre_inspections_repair_order_id_fkey (ro_code, status)`,
    )
    .eq("brand_id", brand)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (filter.q?.trim()) {
    const k = `%${filter.q.trim()}%`;
    query = query.or(
      `pi_no.ilike.${k},customer_name.ilike.${k},vehicle_license_plate.ilike.${k}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[ro-handoffs] list error", error.message);
    return [];
  }

  type RawRow = {
    id: string;
    brand_id: string;
    pi_no: string;
    status: string;
    customer_name: string | null;
    customer_phone: string | null;
    vehicle_license_plate: string | null;
    vehicle_model_name: string | null;
    mileage_in: number | null;
    sa_name: string | null;
    estimated_subtotal: number | string | null;
    signed_at: string | null;
    transferred_at: string | null;
    repair_order_id: string | null;
    updated_at: string;
    repair_order: { ro_code: string | null; status: string | null }[] | { ro_code: string | null; status: string | null } | null;
  };

  const rows: HandoffListRow[] = ((data ?? []) as unknown as RawRow[]).map((r) => {
    const handoff_status = deriveStatus(r);
    const ro = Array.isArray(r.repair_order) ? r.repair_order[0] ?? null : r.repair_order;
    return {
      id: r.id,
      brand_id: r.brand_id,
      pi_no: r.pi_no,
      pi_status: r.status,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      vehicle_license_plate: r.vehicle_license_plate,
      vehicle_model_name: r.vehicle_model_name,
      mileage_in: r.mileage_in,
      sa_name: r.sa_name,
      estimated_subtotal: r.estimated_subtotal == null ? null : Number(r.estimated_subtotal),
      signed_at: r.signed_at,
      transferred_at: r.transferred_at,
      repair_order_id: r.repair_order_id,
      ro_code: ro?.ro_code ?? null,
      ro_status: ro?.status ?? null,
      handoff_status,
      updated_at: r.updated_at,
    };
  });

  if (filter.status && filter.status !== "all") {
    return rows.filter((r) => r.handoff_status === filter.status);
  }
  return rows;
}

export async function getHandoffById(id: string): Promise<HandoffDetail | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("pre_inspections")
    .select(
      `id, brand_id, pi_no, status, appointment_id, customer_id, vehicle_id,
       customer_name, customer_phone, vehicle_license_plate, vehicle_model_name,
       mileage_in, sa_name, estimated_subtotal, estimated_labor_units, metadata,
       signed_at, transferred_at, repair_order_id, created_at, updated_at,
       repair_order:repair_orders!pre_inspections_repair_order_id_fkey (ro_code, status)`,
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();

  if (error || !data) return null;

  type RawRow = {
    id: string;
    brand_id: string;
    pi_no: string;
    status: string;
    appointment_id: string | null;
    customer_id: string | null;
    vehicle_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    vehicle_license_plate: string | null;
    vehicle_model_name: string | null;
    mileage_in: number | null;
    sa_name: string | null;
    estimated_subtotal: number | string | null;
    estimated_labor_units: number | string | null;
    metadata: Record<string, unknown> | null;
    signed_at: string | null;
    transferred_at: string | null;
    repair_order_id: string | null;
    created_at: string;
    updated_at: string;
    repair_order: { ro_code: string | null; status: string | null }[] | { ro_code: string | null; status: string | null } | null;
  };
  const r = data as unknown as RawRow;
  const ro = Array.isArray(r.repair_order) ? r.repair_order[0] ?? null : r.repair_order;
  return {
    id: r.id,
    brand_id: r.brand_id,
    pi_no: r.pi_no,
    pi_status: r.status,
    appointment_id: r.appointment_id,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    vehicle_license_plate: r.vehicle_license_plate,
    vehicle_model_name: r.vehicle_model_name,
    mileage_in: r.mileage_in,
    sa_name: r.sa_name,
    estimated_subtotal: r.estimated_subtotal == null ? null : Number(r.estimated_subtotal),
    estimated_labor_units:
      r.estimated_labor_units == null ? null : Number(r.estimated_labor_units),
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    signed_at: r.signed_at,
    transferred_at: r.transferred_at,
    repair_order_id: r.repair_order_id,
    ro_code: ro?.ro_code ?? null,
    ro_status: ro?.status ?? null,
    handoff_status: deriveStatus(r),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
