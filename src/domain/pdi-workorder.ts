"use server";

/**
 * Domain Helper — PDI 整備工單執行（PD-IN 工單）
 *
 * 對應頁面：/parts/aftersales/workorders/pdi/[id]（id = repair_orders.id）
 * 設計稿：docs/20260527/02_PDI工單執行.html
 *
 * PDI 工單由 RS_INV02 到港確認自動建立（prefix_p1=PD / p2=IN / fee_allocation='vehicle_cost'）。
 * 技師執行 29 項 checklist + 記零件工時，完成核准後把費用寫回 new_car_inventory.pdi_labor_cost /
 * pdi_parts_cost（自動進 generated total_cost），車輛 pending_pdi → displayed（可售）。
 *
 * 儲存策略：checklist 29 項 + 零件/工時明細都是「本工單專用、純記錄、無稅無折扣、不走客付 lines 管線」，
 *   故全存 repair_orders.metadata（pdi_checklist / pdi_parts / pdi_labor），不寫 repair_order_lines
 *   （那條管線含 5% 稅 / 折扣 / 客付 lines_total 語意，跟 PDI「直接計入整車成本」語意衝突）。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  PDI_CHECKLIST_CATEGORIES,
  type PdiChecklistItemState,
  type PdiPartLine,
  type PdiLaborLine,
} from "./pdi-workorder.constants";

export type PdiWorkorderData = {
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
  arrival_no: string | null;
  /** 已關單（已完成核准） */
  is_closed: boolean;

  // 指派技師
  lead_technician_id: string | null;
  lead_technician_name: string | null;
  sa_id: string | null;
  sa_name: string | null;

  // 關聯新車
  new_car_id: string | null;
  vehicle: {
    id: string;
    vin: string | null;
    series: string | null;
    model_name: string | null;
    year: number | null;
    color: string | null;
    cost_price: number | null;
    total_cost: number | null;
    pdi_labor_cost: number | null;
    pdi_parts_cost: number | null;
    transfer_freight_cost: number | null;
    status: string;
  } | null;

  // 既存的執行資料（從 metadata 還原）
  checklist: PdiChecklistItemState[];
  parts: PdiPartLine[];
  labor: PdiLaborLine[];
  approval_note: string | null;
  completed_date: string | null;
};

/** 把 29 項 checklist 預設成空白狀態（idx 0–28） */
export async function defaultChecklist(): Promise<PdiChecklistItemState[]> {
  const out: PdiChecklistItemState[] = [];
  let idx = 0;
  for (const cat of PDI_CHECKLIST_CATEGORIES) {
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

export async function getPdiWorkorderData(roId: string): Promise<PdiWorkorderData | null> {
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
  // 只接受 PD（PDI 整備）工單
  if (roRec.prefix_p1 !== "PD") return null;

  const meta = (roRec.metadata ?? {}) as Record<string, unknown>;
  const newCarId = (roRec.related_new_car_id as string | null) ?? null;

  // 並行撈：技師 / SA / 關聯新車（含車型）
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
    newCarId
      ? supabase
          .from("new_car_inventory")
          .select(
            "id, vin, year, color, cost_price, total_cost, pdi_labor_cost, pdi_parts_cost, transfer_freight_cost, status, vehicle_models(display_name, series)",
          )
          .eq("id", newCarId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const tech = techRes.data as { id: string; name: string } | null;
  const sa = saRes.data as { id: string; name: string } | null;
  const carRaw = carRes.data as
    | {
        id: string;
        vin: string | null;
        year: number | null;
        color: string | null;
        cost_price: number | null;
        total_cost: number | null;
        pdi_labor_cost: number | null;
        pdi_parts_cost: number | null;
        transfer_freight_cost: number | null;
        status: string;
        vehicle_models: { display_name?: string; series?: string } | { display_name?: string; series?: string }[] | null;
      }
    | null;

  const vm = carRaw
    ? Array.isArray(carRaw.vehicle_models)
      ? carRaw.vehicle_models[0]
      : carRaw.vehicle_models
    : null;

  // 還原既存執行資料；缺值給預設
  const storedChecklist = Array.isArray(meta.pdi_checklist)
    ? (meta.pdi_checklist as PdiChecklistItemState[])
    : null;
  const checklist =
    storedChecklist && storedChecklist.length === 29
      ? storedChecklist
      : await defaultChecklist();

  const parts = Array.isArray(meta.pdi_parts) ? (meta.pdi_parts as PdiPartLine[]) : [];
  const labor = Array.isArray(meta.pdi_labor) ? (meta.pdi_labor as PdiLaborLine[]) : [];

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
    arrival_no: typeof meta.arrival_no === "string" ? (meta.arrival_no as string) : null,
    is_closed: isClosed,
    lead_technician_id: (roRec.lead_technician_id as string | null) ?? null,
    lead_technician_name: tech?.name ?? null,
    sa_id: (roRec.sa_id as string | null) ?? null,
    sa_name: sa?.name ?? null,
    new_car_id: newCarId,
    vehicle: carRaw
      ? {
          id: carRaw.id,
          vin: carRaw.vin,
          series: vm?.series ?? null,
          model_name: vm?.display_name ?? null,
          year: carRaw.year,
          color: carRaw.color,
          cost_price: carRaw.cost_price != null ? Number(carRaw.cost_price) : null,
          total_cost: carRaw.total_cost != null ? Number(carRaw.total_cost) : null,
          pdi_labor_cost: carRaw.pdi_labor_cost != null ? Number(carRaw.pdi_labor_cost) : null,
          pdi_parts_cost: carRaw.pdi_parts_cost != null ? Number(carRaw.pdi_parts_cost) : null,
          transfer_freight_cost:
            carRaw.transfer_freight_cost != null ? Number(carRaw.transfer_freight_cost) : null,
          status: carRaw.status,
        }
      : null,
    checklist,
    parts,
    labor,
    approval_note: typeof meta.pdi_approval_note === "string" ? (meta.pdi_approval_note as string) : null,
    completed_date:
      typeof meta.pdi_completed_date === "string"
        ? (meta.pdi_completed_date as string)
        : isClosed
          ? todayIsoDate()
          : null,
  };
}
