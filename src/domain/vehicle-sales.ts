"use server";

/**
 * Domain Helper — 整車 O2C（個別認定成本 + 整車 AR + 訂金）
 *
 *   collectDeposit       訂金：Dr 銀行 / Cr 預收訂金-新車(2230101)（NetSuite Customer Deposit）
 *   deliverVehicle       交車：fire vehicle_sale 成本事件（存貨歸零）
 *                        + COGS_ON_VEHICLE_SALE（Dr 整車COGS 5100102 / Cr 整車存貨 1210102 by VIN）
 *                        + VEHICLE_AR_INVOICE（Dr AR 1180101 / Cr 整車收入 4100102 / Cr 銷項稅 2250101）
 *                        + 訂金沖抵 VEHICLE_DEPOSIT_APPLY（Dr 預收訂金 / Cr AR）
 *   receiveVehicleBalance 尾款：Dr 銀行 / Cr AR(1180101)
 *
 * 本輪鎖定進口新車（1210102/5100102/4100102）。整車成本真相 = inventory_cost_ledger（P1 vehicle 路徑）。
 * 天條：UI 只 import 此檔。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { postDocToGl } from "@/lib/accounting/posting";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";
import { postCostEvent, getVehicleLandedCost } from "@/domain/costing";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const VAT_RATE = 0.05;

function genDocNo(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

type VehicleDims = {
  vehicle_id: string;
  model_id: string | null;
  model_year: string | null;
  vin: string | null;
  store_id: string | null;
  subsidiary_id: string | null;
  brand_id: string;
  dept_id: string | null;
  salesperson: string | null;
  customer_id: string | null;
  order_id: string | null;
};

/** 從 sales_order + 連結整車 解析整車 GL 需要的全部維度（service client、繞 RLS）。 */
async function resolveVehicleContext(salesOrderId: string): Promise<
  | { ok: true; so: Record<string, unknown>; vehicle: Record<string, unknown>; dims: VehicleDims }
  | { ok: false; error: string }
> {
  const svc = createServiceClient();
  const { data: so } = await svc
    .from("sales_orders")
    .select("id, brand_id, customer_id, created_by, rs_name, total_amount, deal_price, down_payment, contract_type")
    .eq("id", salesOrderId)
    .maybeSingle();
  if (!so) return { ok: false, error: "找不到銷售訂單" };

  const { data: vehicle } = await svc
    .from("new_car_inventory")
    .select("id, vin, year, vehicle_model_id, organization_id, subsidiary_id, brand_id")
    .eq("linked_sales_order_id", salesOrderId)
    .maybeSingle();
  if (!vehicle) return { ok: false, error: "此訂單未連結整車（new_car_inventory.linked_sales_order_id）" };

  // store / subsidiary 鏈
  let storeId = (vehicle.organization_id as string | null) ?? null;
  let subsidiaryId = (vehicle.subsidiary_id as string | null) ?? null;
  if (storeId && !subsidiaryId) {
    const { data: org } = await svc.from("organizations").select("subsidiary_id").eq("id", storeId).maybeSingle();
    subsidiaryId = (org?.subsidiary_id as string | null) ?? null;
  }
  if (!subsidiaryId || !storeId) {
    const { data: brandRow } = await svc.from("brands").select("default_subsidiary_id").eq("id", so.brand_id).maybeSingle();
    subsidiaryId = subsidiaryId ?? ((brandRow?.default_subsidiary_id as string | null) ?? null);
    if (!storeId && subsidiaryId) {
      const { data: store } = await svc
        .from("organizations").select("id").eq("subsidiary_id", subsidiaryId).eq("is_active", true)
        .order("level", { ascending: false }).limit(1).maybeSingle();
      storeId = (store?.id as string | null) ?? null;
    }
  }

  // 業務部 (SAL)
  const { data: dept } = await svc
    .from("departments").select("id").eq("brand_id", so.brand_id).eq("code", "SAL").limit(1).maybeSingle();

  const salesperson = (so.created_by as string | null) ?? (so.rs_name as string | null) ?? null;
  const dims: VehicleDims = {
    vehicle_id: vehicle.id as string,
    model_id: (vehicle.vehicle_model_id as string | null) ?? null,
    model_year: vehicle.year != null ? String(vehicle.year) : null,
    vin: (vehicle.vin as string | null) ?? null,
    store_id: storeId,
    subsidiary_id: subsidiaryId,
    brand_id: so.brand_id as string,
    dept_id: (dept?.id as string | null) ?? null,
    salesperson,
    customer_id: (so.customer_id as string | null) ?? null,
    order_id: so.id as string,
  };
  return { ok: true, so, vehicle, dims };
}

/** 共用 ctx（整車各 type 的維度來源一致）。 */
function vehicleCtx(dims: VehicleDims, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    vehicle_id: dims.vehicle_id,
    model_id: dims.model_id,
    model_year: dims.model_year,
    vin: dims.vin,
    store_id: dims.store_id,
    subsidiary_id: dims.subsidiary_id,
    brand_id: dims.brand_id,
    dept_id: dims.dept_id,
    salesperson: dims.salesperson,
    customer_id: dims.customer_id,
    order_id: dims.order_id,
    bank_id: "BANK-MAIN",
    ...extra,
  };
}

/** 訂金（預收）：Dr 銀行 / Cr 預收訂金。記一筆 customer_receipts(kind=vehicle_deposit) 供追蹤 + 冪等。 */
export async function collectDeposit(input: {
  sales_order_id: string;
  amount: number;
  receipt_date?: string;
}): Promise<Result<{ receipt_id: string; entry_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) return { ok: false, error: "沒有收訂金的權限" };
  if (!(input.amount > 0)) return { ok: false, error: "訂金需大於 0" };

  const ctxRes = await resolveVehicleContext(input.sales_order_id);
  if (!ctxRes.ok) return ctxRes;
  const { dims } = ctxRes;

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();
  const amount = round2(input.amount);

  const { data: rec, error } = await supabase
    .from("customer_receipts")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: dims.subsidiary_id ?? scope.subsidiary_id,
      receipt_no: genDocNo("VDEP"),
      customer_id: dims.customer_id,
      receipt_date: input.receipt_date ?? new Date().toISOString().slice(0, 10),
      currency: "TWD",
      exchange_rate: 1,
      amount,
      func_amount: amount,
      status: "draft",
      notes: "整車訂金",
      metadata: { kind: "vehicle_deposit", sales_order_id: input.sales_order_id, vehicle_id: dims.vehicle_id, applied: false },
      created_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立訂金單失敗：${error.message}` };

  const r = await postDocToGl({
    table: "customer_receipts",
    docId: rec.id,
    typeCode: TX_TYPES.VEHICLE_DEPOSIT,
    ctx: vehicleCtx(dims, { func_amount: amount }),
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };
  await supabase.from("customer_receipts").update({ status: "posted" }).eq("id", rec.id);

  revalidatePath("/admin/accounting/receipts");
  return { ok: true, data: { receipt_id: rec.id, entry_no: r.entryNo } };
}

/** 交車：成本事件 + COGS + 整車 AR 發票 + 訂金沖抵。 */
export async function deliverVehicle(
  salesOrderId: string,
): Promise<Result<{ ar_invoice_id: string; cogs_entry: string; ar_entry: string; landed_cost: number; deposit_applied: number }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) return { ok: false, error: "沒有交車過帳的權限" };

  const ctxRes = await resolveVehicleContext(salesOrderId);
  if (!ctxRes.ok) return ctxRes;
  const { so, dims } = ctxRes;
  if (!dims.customer_id) return { ok: false, error: "訂單無客戶" };
  if (!dims.model_year) return { ok: false, error: "整車缺年份（MODEL_YEAR 維度）" };
  if (!dims.salesperson) return { ok: false, error: "訂單缺業務員（SALESPERSON 維度）" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 防重複交車
  const { data: existing } = await supabase
    .from("ar_invoices")
    .select("id").eq("source_module", "sales_order").eq("source_doc_id", salesOrderId).eq("ar_coa_code", "1180101")
    .maybeSingle();
  if (existing) return { ok: false, error: "此訂單已交車開立整車發票" };

  const landedCost = round2(await getVehicleLandedCost(dims.vehicle_id));
  if (!(landedCost > 0)) return { ok: false, error: "整車 landed cost 為 0（成本帳未建？）" };

  const dealPrice = round2(Number(so.deal_price ?? so.total_amount ?? 0));
  if (!(dealPrice > 0)) return { ok: false, error: "訂單成交價為 0" };
  const funcNet = dealPrice;
  const funcTax = round2(dealPrice * VAT_RATE);

  // 1) 成本事件（vehicle_sale，存貨歸零）
  const costEv = await postCostEvent({
    subjectType: "vehicle",
    eventType: "vehicle_sale",
    brandId: dims.brand_id,
    vehicleId: dims.vehicle_id,
    qty: 1,
    subsidiaryId: dims.subsidiary_id ?? undefined,
    sourceTable: "sales_orders",
    sourceId: salesOrderId,
    userId: userId ?? undefined,
  });
  if (!costEv.ok) return { ok: false, error: `整車成本事件失敗：${costEv.error}` };

  // 2) COGS_ON_VEHICLE_SALE（無 doc row，直接過帳）
  const cogs = await instantiateTransaction(
    TX_TYPES.COGS_ON_VEHICLE_SALE,
    vehicleCtx(dims, { func_cost: landedCost }),
    { autoPost: true, userId: userId ?? undefined },
  );
  if (!cogs.ok) return { ok: false, error: `整車 COGS 過帳失敗：${cogs.error}` };

  // 3) 整車 AR 發票
  const { data: inv, error: invErr } = await supabase
    .from("ar_invoices")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: dims.subsidiary_id ?? scope.subsidiary_id,
      invoice_no: genDocNo("VARV"),
      customer_id: dims.customer_id,
      currency: "TWD",
      exchange_rate: 1,
      amount_pretax: funcNet,
      amount_tax: funcTax,
      amount_total: round2(funcNet + funcTax),
      func_amount_pretax: funcNet,
      func_amount_tax: funcTax,
      func_amount_total: round2(funcNet + funcTax),
      open_amount: round2(funcNet + funcTax),
      open_func_amount: round2(funcNet + funcTax),
      status: "draft",
      source_module: "sales_order",
      source_doc_id: salesOrderId,
      ar_coa_code: "1180101",
      vehicle_id: dims.vehicle_id,
      created_by: userId ?? null,
    })
    .select("id")
    .single();
  if (invErr) return { ok: false, error: `建立整車發票失敗：${invErr.message}` };

  const arPost = await postDocToGl({
    table: "ar_invoices",
    docId: inv.id,
    typeCode: TX_TYPES.VEHICLE_AR_INVOICE,
    ctx: vehicleCtx(dims, { func_net: funcNet, func_tax: funcTax }),
    userId: userId ?? undefined,
  });
  if (!arPost.ok) return { ok: false, error: arPost.error };
  await supabase.from("ar_invoices").update({ status: "posted" }).eq("id", inv.id);

  // 4) 訂金沖抵（未沖訂金總額）
  let depositApplied = 0;
  const { data: deposits } = await supabase
    .from("customer_receipts")
    .select("id, func_amount, metadata")
    .eq("customer_id", dims.customer_id)
    .contains("metadata", { kind: "vehicle_deposit", sales_order_id: salesOrderId, applied: false });
  const depTotal = round2((deposits ?? []).reduce((s, d) => s + Number(d.func_amount ?? 0), 0));
  if (depTotal > 0) {
    const apply = await instantiateTransaction(
      TX_TYPES.VEHICLE_DEPOSIT_APPLY,
      vehicleCtx(dims, { func_dep: depTotal }),
      { autoPost: true, userId: userId ?? undefined },
    );
    if (!apply.ok) return { ok: false, error: `訂金沖抵失敗：${apply.error}` };
    depositApplied = depTotal;
    const newOpen = round2(round2(funcNet + funcTax) - depTotal);
    await supabase
      .from("ar_invoices")
      .update({ open_amount: newOpen, open_func_amount: newOpen, status: newOpen <= 0.01 ? "paid" : "partially_paid" })
      .eq("id", inv.id);
    for (const d of deposits ?? []) {
      await supabase
        .from("customer_receipts")
        .update({ metadata: { ...(d.metadata as Record<string, unknown>), applied: true } })
        .eq("id", d.id);
    }
  }

  revalidatePath("/admin/accounting/ar-invoices");
  return {
    ok: true,
    data: { ar_invoice_id: inv.id, cogs_entry: cogs.data.entry_no, ar_entry: arPost.entryNo, landed_cost: landedCost, deposit_applied: depositApplied },
  };
}

/** 尾款收款：Dr 銀行 / Cr AR(1180101)；沖整車發票 open。 */
export async function receiveVehicleBalance(input: {
  sales_order_id: string;
  amount: number;
  receipt_date?: string;
}): Promise<Result<{ receipt_id: string; entry_no: string; invoice_open: number }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) return { ok: false, error: "沒有收尾款的權限" };
  if (!(input.amount > 0)) return { ok: false, error: "尾款需大於 0" };

  const ctxRes = await resolveVehicleContext(input.sales_order_id);
  if (!ctxRes.ok) return ctxRes;
  const { dims } = ctxRes;

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: inv } = await supabase
    .from("ar_invoices")
    .select("id, open_amount, open_func_amount")
    .eq("source_module", "sales_order").eq("source_doc_id", input.sales_order_id).eq("ar_coa_code", "1180101")
    .maybeSingle();
  if (!inv) return { ok: false, error: "找不到整車發票（尚未交車？）" };

  const amount = round2(input.amount);
  if (amount > Number(inv.open_amount) + 0.01) {
    return { ok: false, error: `尾款超過發票未沖餘額（${inv.open_amount}）` };
  }

  const { data: rec, error } = await supabase
    .from("customer_receipts")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: dims.subsidiary_id ?? scope.subsidiary_id,
      receipt_no: genDocNo("VRCP"),
      customer_id: dims.customer_id,
      receipt_date: input.receipt_date ?? new Date().toISOString().slice(0, 10),
      currency: "TWD",
      exchange_rate: 1,
      amount,
      func_amount: amount,
      status: "draft",
      notes: "整車尾款",
      metadata: { kind: "vehicle_balance", sales_order_id: input.sales_order_id },
      created_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立尾款單失敗：${error.message}` };

  const r = await postDocToGl({
    table: "customer_receipts",
    docId: rec.id,
    typeCode: TX_TYPES.VEHICLE_RECEIPT,
    ctx: vehicleCtx(dims, { func_amount: amount }),
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };
  await supabase.from("customer_receipts").update({ status: "posted" }).eq("id", rec.id);

  const newOpen = round2(Number(inv.open_amount) - amount);
  await supabase
    .from("ar_invoices")
    .update({ open_amount: newOpen, open_func_amount: newOpen, status: newOpen <= 0.01 ? "paid" : "partially_paid" })
    .eq("id", inv.id);

  revalidatePath("/admin/accounting/ar-invoices");
  return { ok: true, data: { receipt_id: rec.id, entry_no: r.entryNo, invoice_open: newOpen } };
}
