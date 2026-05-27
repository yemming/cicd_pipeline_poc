"use server";

/**
 * Domain Helper — 中古車整備工單執行（PD-UC 工單）
 *
 * 對應頁面：/parts/aftersales/workorders/recon/[id]（id = repair_orders.id）
 * 設計稿：docs/20260527/02_中古車整備工單.html
 *
 * PD-UC 工單由 RS06 收購決策 或 RS_INV05 直購申請 自動建立
 * （prefix_p1=PD / p2=IN / fee_allocation='vehicle_cost' / related_used_car_id 非空）。
 * 技師執行 24 項 checklist + 記零件工時，完成核准後把費用寫回
 * used_car_inventory.recon_labor_cost / recon_parts_cost（自動進 generated total_cost），
 * 車輛 pending_recon → available（可售）。
 *
 * 與新車 PDI（PD-IN，related_new_car_id）的區隔：
 *   - PD + related_used_car_id 非空 → 中古整備（本 helper）
 *   - PD + related_new_car_id 非空 → 新車 PDI（pdi-workorder.ts）
 *
 * 儲存策略：checklist 24 項 + 零件/工時明細都「本工單專用、純記錄、無稅無折扣、不走客付 lines 管線」，
 *   故全存 repair_orders.metadata（recon_checklist / recon_parts / recon_labor），不寫 repair_order_lines。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  RECON_CHECKLIST_CATEGORIES,
  RECON_CHECKLIST_TOTAL,
  type ReconChecklistItemState,
  type ReconPartLine,
  type ReconLaborLine,
} from "./recon-workorder.constants";

export type ReconWorkorderData = {
  // RO 單頭
  id: string;
  ro_code: string;
  status: string;
  prefix_p1: string;
  prefix_p2: string;
  fee_allocation: string | null;
  issue_date: string | null;
  opened_at: string | null;
  closed_at: string | null;
  estimated_completion: string | null;
  /** 已關單（已完成核准） */
  is_closed: boolean;

  // 指派技師
  lead_technician_id: string | null;
  lead_technician_name: string | null;
  sa_id: string | null;
  sa_name: string | null;

  // 關聯中古車
  used_car_id: string | null;
  vehicle: {
    id: string;
    vin: string | null;
    license_plate: string | null;
    model_name: string | null;
    year: number | null;
    color: string | null;
    mileage_km: number | null;
    acquisition_price: number | null;
    acquisition_source: string | null;
    total_cost: number | null;
    recon_labor_cost: number | null;
    recon_parts_cost: number | null;
    bodywork_cost: number | null;
    transfer_freight_cost: number | null;
    status: string;
  } | null;

  // 既存的執行資料（從 metadata 還原）
  checklist: ReconChecklistItemState[];
  parts: ReconPartLine[];
  labor: ReconLaborLine[];
  approval_note: string | null;
  completed_date: string | null;
};

/** 把 24 項 checklist 預設成空白狀態（idx 0–23） */
export async function defaultChecklist(): Promise<ReconChecklistItemState[]> {
  const out: ReconChecklistItemState[] = [];
  let idx = 0;
  for (const cat of RECON_CHECKLIST_CATEGORIES) {
    for (let i = 0; i < cat.items.length; i++) {
      out.push({ idx, result: null, note: "" });
      idx++;
    }
  }
  return out;
}

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getReconWorkorderData(roId: string): Promise<ReconWorkorderData | null> {
  if (!roId) return null;
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !ro) return null;

  const roRec = ro as Record<string, unknown>;
  const usedCarId = (roRec.related_used_car_id as string | null) ?? null;
  // 只接受 PD-UC（中古整備）工單：prefix_p1=PD 且 related_used_car_id 非空
  // （藉此跟新車 PDI（PD-IN，related_new_car_id）區隔）
  if (roRec.prefix_p1 !== "PD" || !usedCarId) return null;

  const meta = (roRec.metadata ?? {}) as Record<string, unknown>;

  // 並行撈：技師 / SA / 關聯中古車
  const [techRes, saRes, carRes] = await Promise.all([
    roRec.lead_technician_id
      ? supabase
          .from("aftersales_technicians")
          .select("id, name")
          .eq("id", roRec.lead_technician_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    roRec.sa_id
      ? supabase
          .from("employees")
          .select("id, name")
          .eq("id", roRec.sa_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("used_car_inventory")
      .select(
        "id, vin, license_plate, model_display_name, year, color, mileage_km, acquisition_price, acquisition_source, total_cost, recon_labor_cost, recon_parts_cost, bodywork_cost, transfer_freight_cost, status",
      )
      .eq("id", usedCarId)
      .maybeSingle(),
  ]);

  const tech = techRes.data as { id: string; name: string } | null;
  const sa = saRes.data as { id: string; name: string } | null;
  const carRaw = carRes.data as
    | {
        id: string;
        vin: string | null;
        license_plate: string | null;
        model_display_name: string | null;
        year: number | null;
        color: string | null;
        mileage_km: number | null;
        acquisition_price: number | null;
        acquisition_source: string | null;
        total_cost: number | null;
        recon_labor_cost: number | null;
        recon_parts_cost: number | null;
        bodywork_cost: number | null;
        transfer_freight_cost: number | null;
        status: string;
      }
    | null;

  // 還原既存執行資料；缺值給預設
  const storedChecklist = Array.isArray(meta.recon_checklist)
    ? (meta.recon_checklist as ReconChecklistItemState[])
    : null;
  const checklist =
    storedChecklist && storedChecklist.length === RECON_CHECKLIST_TOTAL
      ? storedChecklist
      : await defaultChecklist();

  const parts = Array.isArray(meta.recon_parts) ? (meta.recon_parts as ReconPartLine[]) : [];
  const labor = Array.isArray(meta.recon_labor) ? (meta.recon_labor as ReconLaborLine[]) : [];

  const status = roRec.status as string;
  const isClosed = status === "已關單";

  return {
    id: roRec.id as string,
    ro_code: roRec.ro_code as string,
    status,
    prefix_p1: roRec.prefix_p1 as string,
    prefix_p2: roRec.prefix_p2 as string,
    fee_allocation: (roRec.fee_allocation as string | null) ?? null,
    issue_date: (roRec.issue_date as string | null) ?? null,
    opened_at: (roRec.opened_at as string | null) ?? null,
    closed_at: (roRec.closed_at as string | null) ?? null,
    estimated_completion:
      typeof meta.estimated_completion === "string" ? (meta.estimated_completion as string) : null,
    is_closed: isClosed,
    lead_technician_id: (roRec.lead_technician_id as string | null) ?? null,
    lead_technician_name: tech?.name ?? null,
    sa_id: (roRec.sa_id as string | null) ?? null,
    sa_name: sa?.name ?? null,
    used_car_id: usedCarId,
    vehicle: carRaw
      ? {
          id: carRaw.id,
          vin: carRaw.vin,
          license_plate: carRaw.license_plate,
          model_name: carRaw.model_display_name,
          year: carRaw.year,
          color: carRaw.color,
          mileage_km: carRaw.mileage_km != null ? Number(carRaw.mileage_km) : null,
          acquisition_price:
            carRaw.acquisition_price != null ? Number(carRaw.acquisition_price) : null,
          acquisition_source: carRaw.acquisition_source,
          total_cost: carRaw.total_cost != null ? Number(carRaw.total_cost) : null,
          recon_labor_cost: carRaw.recon_labor_cost != null ? Number(carRaw.recon_labor_cost) : null,
          recon_parts_cost: carRaw.recon_parts_cost != null ? Number(carRaw.recon_parts_cost) : null,
          bodywork_cost: carRaw.bodywork_cost != null ? Number(carRaw.bodywork_cost) : null,
          transfer_freight_cost:
            carRaw.transfer_freight_cost != null ? Number(carRaw.transfer_freight_cost) : null,
          status: carRaw.status,
        }
      : null,
    checklist,
    parts,
    labor,
    approval_note:
      typeof meta.recon_approval_note === "string" ? (meta.recon_approval_note as string) : null,
    completed_date:
      typeof meta.recon_completed_date === "string"
        ? (meta.recon_completed_date as string)
        : isClosed
          ? todayIsoDate()
          : null,
  };
}
