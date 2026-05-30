"use server";

/**
 * Domain Helper — 整車進貨（進口新車 GR/IR 模型 + 成本 ledger）
 *
 *   receiveVehicle           到貨：fire vehicle `receipt` 成本事件（建 cost ledger → 餵
 *                            deliverVehicle 的 getVehicleLandedCost 硬依賴）
 *                            + VEHICLE_INVENTORY_RECEIPT（Dr 整車存貨 1210102 / Cr 車輛 GR/IR 2170106）
 *   createVehicleImportBill  廠商發票草稿：沿用 vendor_bills 表（一行 = 整車進口成本）
 *   postVehicleImportBill    過帳：VEHICLE_VENDOR_BILL（Dr 車輛 GR/IR 2170106 + 進項稅 / Cr AP）
 *
 * 付款沿用 payments.ts（BILL_PAYMENT），整車帳單就是 vendor_bills row、零新 code。
 *
 * 本輪鎖定進口新車（1210102 / 2170106）。GL 永遠存 func(TWD)。
 * PDI 工時 / 運費的 landed cost 資本化留下一輪（現階段只認基本車價 cost_price = total_cost）。
 * 天條：UI 只 import 此檔。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { postDocToGl } from "@/lib/accounting/posting";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";
import { postCostEvent } from "@/domain/costing";

import { createVendorBill } from "./vendor-bills";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const VAT_RATE = 0.05;

type VehicleReceiptDims = {
  vehicle_id: string;
  vin: string | null;
  model_id: string | null;
  model_year: string | null;
  store_id: string | null;
  subsidiary_id: string | null;
  brand_id: string;
  cost_price: number;
  status: string;
};

/**
 * 解析整車進貨需要的維度（service client、繞 RLS，與 engine / vehicle-sales 一致）。
 * store / subsidiary 鏈：vehicle.org → org.subsidiary → brand.default_subsidiary（再回頭補 store）。
 */
async function resolveVehicleReceiptContext(
  vehicleId: string,
): Promise<{ ok: true; dims: VehicleReceiptDims } | { ok: false; error: string }> {
  const svc = createServiceClient();
  const { data: v } = await svc
    .from("new_car_inventory")
    .select(
      "id, vin, year, vehicle_model_id, organization_id, subsidiary_id, brand_id, cost_price, status",
    )
    .eq("id", vehicleId)
    .maybeSingle();
  if (!v) return { ok: false, error: "找不到整車（new_car_inventory）" };

  let storeId = (v.organization_id as string | null) ?? null;
  let subsidiaryId = (v.subsidiary_id as string | null) ?? null;
  if (storeId && !subsidiaryId) {
    const { data: org } = await svc
      .from("organizations")
      .select("subsidiary_id")
      .eq("id", storeId)
      .maybeSingle();
    subsidiaryId = (org?.subsidiary_id as string | null) ?? null;
  }
  if (!subsidiaryId || !storeId) {
    const { data: brandRow } = await svc
      .from("brands")
      .select("default_subsidiary_id")
      .eq("id", v.brand_id)
      .maybeSingle();
    subsidiaryId = subsidiaryId ?? ((brandRow?.default_subsidiary_id as string | null) ?? null);
    if (!storeId && subsidiaryId) {
      const { data: store } = await svc
        .from("organizations")
        .select("id")
        .eq("subsidiary_id", subsidiaryId)
        .eq("is_active", true)
        .order("level", { ascending: false })
        .limit(1)
        .maybeSingle();
      storeId = (store?.id as string | null) ?? null;
    }
  }

  return {
    ok: true,
    dims: {
      vehicle_id: v.id as string,
      vin: (v.vin as string | null) ?? null,
      model_id: (v.vehicle_model_id as string | null) ?? null,
      model_year: v.year != null ? String(v.year) : null,
      store_id: storeId,
      subsidiary_id: subsidiaryId,
      brand_id: v.brand_id as string,
      cost_price: Number(v.cost_price ?? 0),
      status: (v.status as string | null) ?? "",
    },
  };
}

/**
 * 整車到貨入庫：建成本 ledger（受款給 deliverVehicle）+ VEHICLE_INVENTORY_RECEIPT 過帳。
 * 冪等：以 inventory_cost_ledger 是否已有此車的 receipt 事件為準（重跑直接擋）。
 */
export async function receiveVehicle(input: {
  vehicle_id: string;
  /** 不傳則用 new_car_inventory.cost_price（基本車價）。 */
  cost_override?: number;
  receipt_date?: string;
}): Promise<Result<{ ledger_id: string; entry_no: string; value_after: number }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有整車進貨過帳的權限" };
  }

  const ctxRes = await resolveVehicleReceiptContext(input.vehicle_id);
  if (!ctxRes.ok) return ctxRes;
  const { dims } = ctxRes;

  const cost = round2(input.cost_override ?? dims.cost_price);
  if (!(cost > 0)) return { ok: false, error: "整車成本為 0（cost_price 未填？）" };
  if (!dims.model_year) return { ok: false, error: "整車缺年份（MODEL_YEAR 維度）" };
  if (!dims.store_id) return { ok: false, error: "整車缺門市（STORE 維度，無法解析 organization）" };
  if (!dims.subsidiary_id) return { ok: false, error: "整車缺法人（SUBSIDIARY 維度）" };

  const svc = createServiceClient();
  // 冪等守門：已有 receipt 事件就擋（避免重複建 ledger + 重複過帳）
  const { data: existing } = await svc
    .from("inventory_cost_ledger")
    .select("id")
    .eq("vehicle_id", dims.vehicle_id)
    .eq("event_type", "receipt")
    .eq("source_table", "new_car_inventory")
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: "此車已進貨入庫（成本 ledger 已有 receipt 事件）" };

  const { userId } = await getCurrentUserAndAdmin();
  const entryDate = input.receipt_date ?? new Date().toISOString().slice(0, 10);

  // 1) 成本事件（receipt，建 VIN 成本層）— value_after = cost
  const costEv = await postCostEvent({
    subjectType: "vehicle",
    eventType: "receipt",
    brandId: dims.brand_id,
    vehicleId: dims.vehicle_id,
    qty: 1,
    unitCostIn: cost,
    subsidiaryId: dims.subsidiary_id ?? undefined,
    sourceTable: "new_car_inventory",
    sourceId: dims.vehicle_id,
    userId: userId ?? undefined,
  });
  if (!costEv.ok) return { ok: false, error: `整車成本事件失敗：${costEv.error}` };

  // 2) GL：Dr 整車存貨 1210102 / Cr 車輛 GR/IR 2170106（func/TWD）
  const gl = await instantiateTransaction(
    TX_TYPES.VEHICLE_INVENTORY_RECEIPT,
    {
      vehicle_id: dims.vehicle_id,
      vin: dims.vin,
      model_id: dims.model_id,
      model_year: dims.model_year,
      store_id: dims.store_id,
      subsidiary_id: dims.subsidiary_id,
      func_goods: cost,
    },
    { autoPost: true, entryDate, userId: userId ?? undefined },
  );
  if (!gl.ok) {
    // GL 失敗：成本 ledger 已有 receipt（冪等守門會擋重跑）。回報讓人工沖銷 ledger 後重來。
    return {
      ok: false,
      error: `整車進貨 GL 過帳失敗：${gl.error}（成本 ledger 已建 ledger_id=${costEv.ledgerId}，需人工沖銷後重試）`,
    };
  }

  // 3) 回寫 new_car_inventory.metadata 進貨標記（審計 + UI 顯示）— merge 不覆蓋既有 key
  const { data: cur } = await svc
    .from("new_car_inventory")
    .select("metadata")
    .eq("id", dims.vehicle_id)
    .maybeSingle();
  const curMeta = (cur?.metadata as Record<string, unknown> | null) ?? {};
  await svc
    .from("new_car_inventory")
    .update({
      metadata: {
        ...curMeta,
        gl_received: {
          entry_no: gl.data.entry_no,
          ledger_id: costEv.ledgerId,
          value_after: costEv.valueAfter,
          received_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", dims.vehicle_id);

  revalidatePath("/admin/accounting/vehicle-receipts");
  return {
    ok: true,
    data: { ledger_id: costEv.ledgerId, entry_no: gl.data.entry_no, value_after: costEv.valueAfter },
  };
}

/**
 * 建整車進口廠商發票草稿（沿用 vendor_bills 表，一行 = 整車進口成本）。
 * 後續 postVehicleImportBill 清車輛 GR/IR。
 */
export async function createVehicleImportBill(input: {
  vehicle_id: string;
  vendor_id: string;
  bill_date?: string;
  vendor_invoice_no?: string | null;
  currency?: string;
  /** 不傳則查 exchange_rates。 */
  exchange_rate?: number;
  /** 不傳則用 new_car_inventory.cost_price。 */
  cost_override?: number;
  /** 進項稅率，預設 5%；進口保稅情境可傳 0。 */
  tax_rate?: number;
}): Promise<Result<{ id: string; bill_no: string }>> {
  const ctxRes = await resolveVehicleReceiptContext(input.vehicle_id);
  if (!ctxRes.ok) return ctxRes;
  const { dims } = ctxRes;

  const cost = round2(input.cost_override ?? dims.cost_price);
  if (!(cost > 0)) return { ok: false, error: "整車成本為 0，無法建立發票" };
  const taxRate = input.tax_rate ?? VAT_RATE;

  return createVendorBill({
    vendor_id: input.vendor_id,
    vendor_invoice_no: input.vendor_invoice_no ?? null,
    bill_date: input.bill_date,
    currency: input.currency,
    exchange_rate: input.exchange_rate,
    source_doc_type: "new_car_inventory",
    source_doc_id: dims.vehicle_id,
    notes: `整車進口 - ${dims.vin ?? dims.vehicle_id}`,
    lines: [
      {
        line_type: "inventory",
        description: `整車進口成本 - ${dims.vin ?? ""}`.trim(),
        qty: 1,
        unit_cost: cost,
        line_amount: cost,
        tax_amount: round2(cost * taxRate),
        match_status: "matched",
        matched_qty: 1,
      },
    ],
  });
}

/**
 * 過帳整車進口廠商發票：VEHICLE_VENDOR_BILL（Dr 車輛 GR/IR 2170106 + 進項稅 / Cr AP）。
 * 清掉 receiveVehicle 時掛的車輛 GR/IR，轉正式 AP。func 金額由單據快照取。
 */
export async function postVehicleImportBill(
  id: string,
): Promise<Result<{ entry_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有過帳廠商發票的權限" };
  }
  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: bill, error } = await supabase
    .from("vendor_bills")
    .select(
      "id, vendor_id, subsidiary_id, bill_date, status, gl_posted, func_amount_pretax, func_amount_tax",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!bill) return { ok: false, error: "找不到廠商發票" };
  if (bill.status !== "draft" || bill.gl_posted) {
    return { ok: false, error: `狀態 ${bill.status} 不可過帳（或已過帳）` };
  }

  // GR/IR(車輛) 只要求 SUBSIDIARY；進項稅 / AP 要求 STORE → 解析該法人下的一個 store
  const storeId = await resolveSubsidiaryStore(bill.subsidiary_id);

  const r = await postDocToGl({
    table: "vendor_bills",
    docId: id,
    typeCode: TX_TYPES.VEHICLE_VENDOR_BILL,
    ctx: {
      supplier_id: bill.vendor_id,
      subsidiary_id: bill.subsidiary_id,
      store_id: storeId,
      func_goods: Number(bill.func_amount_pretax ?? 0),
      func_tax: Number(bill.func_amount_tax ?? 0),
    },
    entryDate: bill.bill_date,
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  await supabase.from("vendor_bills").update({ status: "posted" }).eq("id", id);

  revalidatePath("/admin/accounting/vendor-bills");
  revalidatePath(`/admin/accounting/vendor-bills/${id}`);
  return { ok: true, data: { entry_no: r.entryNo } };
}

/** 解析該法人下的一個 store（給 AP / 進項稅 的 STORE 維度用）。service client 繞 RLS。 */
async function resolveSubsidiaryStore(subsidiaryId: string | null): Promise<string | null> {
  if (!subsidiaryId) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from("organizations")
    .select("id")
    .eq("subsidiary_id", subsidiaryId)
    .eq("is_active", true)
    .order("level", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
