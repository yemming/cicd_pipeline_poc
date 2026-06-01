/**
 * 進口文件 domain helper — server-only（讀取層）
 *
 * 對應表：import_documents。一份文件可掛 批次 / 採購單 / 車輛 任一層級。
 * 寫入走 @/lib/vehicle-import/document-actions。
 * 天條：UI 只 import 本 helper / actions，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ImportDocumentRow } from "./import-documents.constants";

export type {
  ImportDocumentRow,
  ImportDocType,
  DocLinkLevel,
} from "./import-documents.constants";

const COLS = `
  id, brand_id, doc_type, shipment_id, purchase_order_id, vehicle_id,
  doc_no, issued_by, issued_date, stage, file_url, created_at
`.trim();

export type DocumentFilters = {
  q?: string;
  doc_type?: string;
  stage?: string;
  shipment_id?: string;
};

/** 把單頭 row + 三張 lookup map 組成顯示用 ImportDocumentRow */
function mapDoc(
  r: Record<string, unknown>,
  shipmentNo: Map<string, string>,
  poNo: Map<string, string>,
  vin: Map<string, string>,
): ImportDocumentRow {
  const sid = (r.shipment_id as string) ?? null;
  const pid = (r.purchase_order_id as string) ?? null;
  const vid = (r.vehicle_id as string) ?? null;
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    doc_type: r.doc_type as ImportDocumentRow["doc_type"],
    shipment_id: sid,
    purchase_order_id: pid,
    vehicle_id: vid,
    doc_no: (r.doc_no as string) ?? null,
    issued_by: (r.issued_by as string) ?? null,
    issued_date: (r.issued_date as string) ?? null,
    stage: (r.stage as ImportDocumentRow["stage"]) ?? null,
    file_url: (r.file_url as string) ?? null,
    created_at: (r.created_at as string) ?? null,
    shipment_no: sid ? (shipmentNo.get(sid) ?? null) : null,
    po_no: pid ? (poNo.get(pid) ?? null) : null,
    vehicle_vin: vid ? (vin.get(vid) ?? null) : null,
  };
}

/** 撈一批文件需要的關聯顯示欄（shipment_no / po_no / vin），一次 IN 查回避免 N+1 */
async function loadLookups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<Record<string, unknown>>,
): Promise<{
  shipmentNo: Map<string, string>;
  poNo: Map<string, string>;
  vin: Map<string, string>;
}> {
  const shipmentIds = [...new Set(rows.map((r) => r.shipment_id as string).filter(Boolean))];
  const poIds = [...new Set(rows.map((r) => r.purchase_order_id as string).filter(Boolean))];
  const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id as string).filter(Boolean))];

  const [shp, po, veh] = await Promise.all([
    shipmentIds.length
      ? supabase.from("import_shipments").select("id, shipment_no").in("id", shipmentIds)
      : Promise.resolve({ data: [] }),
    poIds.length
      ? supabase.from("vehicle_purchase_orders").select("id, po_no").in("id", poIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length
      ? supabase.from("new_car_inventory").select("id, vin").in("id", vehicleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const shipmentNo = new Map<string, string>();
  for (const r of (shp.data ?? []) as Array<{ id: string; shipment_no: string | null }>) {
    if (r.shipment_no) shipmentNo.set(r.id, r.shipment_no);
  }
  const poNo = new Map<string, string>();
  for (const r of (po.data ?? []) as Array<{ id: string; po_no: string | null }>) {
    if (r.po_no) poNo.set(r.id, r.po_no);
  }
  const vin = new Map<string, string>();
  for (const r of (veh.data ?? []) as Array<{ id: string; vin: string | null }>) {
    if (r.vin) vin.set(r.id, r.vin);
  }
  return { shipmentNo, poNo, vin };
}

export async function listDocuments(
  filters: DocumentFilters = {},
): Promise<ImportDocumentRow[]> {
  const supabase = await createClient();
  let q = supabase.from("import_documents").select(COLS).order("created_at", { ascending: false });
  if (filters.doc_type && filters.doc_type !== "all") q = q.eq("doc_type", filters.doc_type);
  if (filters.stage && filters.stage !== "all") q = q.eq("stage", filters.stage);
  if (filters.shipment_id) q = q.eq("shipment_id", filters.shipment_id);
  if (filters.q?.trim()) {
    const t = filters.q.trim();
    q = q.or(`doc_no.ilike.%${t}%,issued_by.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];
  const { shipmentNo, poNo, vin } = await loadLookups(supabase, rows);
  return rows.map((r) => mapDoc(r, shipmentNo, poNo, vin));
}

export async function getDocumentById(id: string): Promise<ImportDocumentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("import_documents").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const { shipmentNo, poNo, vin } = await loadLookups(supabase, [r]);
  return mapDoc(r, shipmentNo, poNo, vin);
}

/** 批次內車輛下拉（建文件時挑「掛到哪台車」用） */
export async function listShipmentVehicleOptions(
  shipmentId: string,
): Promise<Array<{ id: string; vin: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin")
    .eq("shipment_id", shipmentId)
    .order("vin", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; vin: string | null }>).map((r) => ({
    id: r.id,
    vin: r.vin,
  }));
}

/** 所有已綁批次的車輛（建文件時做「批次 → 車輛」相依下拉用，一次撈避免 N+1） */
export async function listVehiclesForDocuments(): Promise<
  Array<{ id: string; vin: string | null; shipment_id: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin, shipment_id")
    .not("shipment_id", "is", null)
    .order("vin", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; vin: string | null; shipment_id: string | null }>)
    .filter((r) => r.shipment_id)
    .map((r) => ({ id: r.id, vin: r.vin, shipment_id: r.shipment_id as string }));
}

/** 批次下拉（建文件時挑「掛到哪個批次」用） */
export async function listShipmentOptions(): Promise<Array<{ id: string; shipment_no: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_shipments")
    .select("id, shipment_no")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; shipment_no: string }>).map((r) => ({
    id: r.id,
    shipment_no: r.shipment_no,
  }));
}
