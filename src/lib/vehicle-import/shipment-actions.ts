"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getShipmentBrandId } from "@/domain/import-shipments";

export type ShipmentActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ShipmentInput = {
  shipment_no?: string;
  bl_no?: string | null;
  awb_no?: string | null;
  customs_decl_no?: string | null;
  vessel?: string | null;
  forwarder?: string | null;
  incoterms?: string | null;
  total_cif?: number | null;
  customs_valuation?: number | null;
  etd?: string | null;
  eta?: string | null;
  customs_clear_date?: string | null;
  notes?: string | null;
};

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

/** 產號 SHP-YYYYMM-NNN（當月最大 +1） */
async function nextShipmentNo(
  sb: ReturnType<typeof createServiceClient>,
  brandId: string,
): Promise<string> {
  const tpe = new Date(Date.now() + 8 * 3600 * 1000);
  const yyyymm = `${tpe.getUTCFullYear()}${String(tpe.getUTCMonth() + 1).padStart(2, "0")}`;
  const prefix = `SHP-${yyyymm}-`;
  const { data } = await sb
    .from("import_shipments")
    .select("shipment_no")
    .eq("brand_id", brandId)
    .like("shipment_no", `${prefix}%`)
    .order("shipment_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = 1;
  const cur = (data as { shipment_no?: string } | null)?.shipment_no;
  if (cur) {
    const n = parseInt(cur.slice(prefix.length), 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function buildPatch(input: ShipmentInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of [
    "shipment_no",
    "bl_no",
    "awb_no",
    "customs_decl_no",
    "vessel",
    "forwarder",
    "incoterms",
    "total_cif",
    "customs_valuation",
    "etd",
    "eta",
    "customs_clear_date",
    "notes",
  ] as const) {
    if (typeof input[k] !== "undefined") {
      const v = input[k];
      patch[k] = v === "" ? null : v;
    }
  }
  return patch;
}

export async function createShipmentAction(
  input: ShipmentInput,
): Promise<ShipmentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const brandId = await getShipmentBrandId();
  const sb = createServiceClient();
  const shipment_no = input.shipment_no?.trim() || (await nextShipmentNo(sb, brandId));

  const { data, error } = await sb
    .from("import_shipments")
    .insert({ ...buildPatch(input), brand_id: brandId, shipment_no, created_by: gate.userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `批次號「${shipment_no}」已存在` };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath("/vehicle-import/shipments", "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateShipmentAction(
  id: string,
  input: ShipmentInput,
): Promise<ShipmentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb
    .from("import_shipments")
    .update({ ...buildPatch(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(`/vehicle-import/shipments/${id}`, "page");
  return { ok: true, data: { id } };
}

export async function setShipmentStageAction(
  id: string,
  stage: string,
): Promise<ShipmentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const valid = ["ordered", "producing", "shipping", "customs", "inspection", "stocked", "sold"];
  if (!valid.includes(stage)) return { ok: false, error: "無效的階段" };
  const sb = createServiceClient();
  const { error } = await sb
    .from("import_shipments")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/vehicle-import/shipments/${id}`, "page");
  return { ok: true, data: { id } };
}

export async function deleteShipmentAction(
  id: string,
): Promise<ShipmentActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  // 先解綁車輛（不刪車）
  await sb.from("new_car_inventory").update({ shipment_id: null }).eq("shipment_id", id);
  const { error } = await sb.from("import_shipments").delete().eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/vehicle-import/shipments", "page");
  return { ok: true, data: { id } };
}
