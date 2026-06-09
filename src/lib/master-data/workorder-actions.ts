"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  WorkOrderFieldKey,
  WorkOrderItemDraft,
} from "./workorder-form-types";

const STATUSES = [
  "draft",
  "dispatched",
  "in_progress",
  "qc",
  "done",
  "closed",
  "cancelled",
] as const;
type Status = (typeof STATUSES)[number];

const ITEM_KINDS = ["parts", "labor", "external", "discount"] as const;

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<WorkOrderFieldKey, string>> };

export type WorkOrderInput = {
  ro_no?: string | null;
  customer_id: string;
  vehicle_id: string;
  appointment_id?: string | null;
  repair_order_id?: string | null;
  status?: Status | null;
  advisor_id?: string | null;
  lead_technician_id?: string | null;
  mileage_in?: number | null;
  mileage_out?: number | null;
  customer_complaint?: string | null;
  diagnosis?: string | null;
  work_summary?: string | null;
  notes?: string | null;
  items?: WorkOrderItemDraft[];
};

function pickStatus(raw: string | null | undefined): Status {
  const v = String(raw ?? "draft");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "draft";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function genRoNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `RO-${ymd}-${rand}`;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<WorkOrderFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("work_orders_brand_ro_no_unique")) {
    return {
      error: "工單號重複",
      fieldErrors: { ro_no: "此工單號已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503") {
    if (error.message.includes("customer_id")) {
      return { error: "客戶不存在", fieldErrors: { customer_id: "請重新選擇客戶" } };
    }
    if (error.message.includes("vehicle_id")) {
      return { error: "車輛不存在", fieldErrors: { vehicle_id: "請重新選擇車輛" } };
    }
  }
  return { error: `儲存失敗：${error.message}` };
}

function sanitizeItems(raw: WorkOrderItemDraft[] | undefined): WorkOrderItemDraft[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((r, idx): WorkOrderItemDraft | null => {
      if (!r || typeof r !== "object") return null;
      const kindStr = String(r.kind ?? "parts");
      if (!(ITEM_KINDS as readonly string[]).includes(kindStr)) return null;
      const description = String(r.description ?? "").trim();
      if (!description) return null;
      const qty = Number(r.qty ?? 1);
      const unitPrice = Number(r.unit_price ?? 0);
      return {
        id: r.id ? String(r.id) : null,
        line_no: idx + 1,
        kind: kindStr as WorkOrderItemDraft["kind"],
        item_id: r.item_id ? String(r.item_id) : null,
        labor_code: r.labor_code ? String(r.labor_code) : null,
        description,
        qty: Number.isFinite(qty) ? qty : 1,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        amount: Number.isFinite(Number(r.amount)) ? Number(r.amount) : qty * unitPrice,
        technician_id: r.technician_id ? String(r.technician_id) : null,
        labor_minutes:
          r.labor_minutes != null && Number.isFinite(Number(r.labor_minutes))
            ? Number(r.labor_minutes)
            : null,
        is_warranty: r.is_warranty === true,
        notes: r.notes ? String(r.notes) : null,
      };
    })
    .filter((x): x is WorkOrderItemDraft => x !== null);
}

function sumByKind(items: WorkOrderItemDraft[], kind: WorkOrderItemDraft["kind"]): number {
  return items
    .filter((i) => i.kind === kind)
    .reduce((acc, i) => acc + (Number.isFinite(i.amount) ? i.amount : 0), 0);
}

function buildPayload(input: WorkOrderInput) {
  return {
    ro_no: trim(input.ro_no ?? null) ?? genRoNo(),
    customer_id: (input.customer_id ?? "").trim(),
    vehicle_id: (input.vehicle_id ?? "").trim(),
    appointment_id: trim(input.appointment_id ?? null),
    repair_order_id: trim(input.repair_order_id ?? null),
    status: pickStatus(input.status),
    advisor_id: trim(input.advisor_id ?? null),
    lead_technician_id: trim(input.lead_technician_id ?? null),
    mileage_in: input.mileage_in ?? null,
    mileage_out: input.mileage_out ?? null,
    customer_complaint: trim(input.customer_complaint ?? null),
    diagnosis: trim(input.diagnosis ?? null),
    work_summary: trim(input.work_summary ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createWorkOrderAction(
  input: WorkOrderInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const items = sanitizeItems(input.items);

  const fieldErrors: Partial<Record<WorkOrderFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const partsAmount = sumByKind(items, "parts");
  const laborAmount = sumByKind(items, "labor");
  const externalAmount = sumByKind(items, "external");
  const discountAmount = sumByKind(items, "discount");
  const totalAmount = partsAmount + laborAmount + externalAmount + discountAmount;

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: wo, error } = await supabase
    .from("work_orders")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
      parts_amount: partsAmount,
      labor_amount: laborAmount,
      external_amount: externalAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  if (items.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = items.map((it) => ({
      brand_id: _brandId,
      work_order_id: wo.id,
      line_no: it.line_no,
      kind: it.kind,
      item_id: it.item_id,
      labor_code: it.labor_code,
      description: it.description,
      qty: it.qty,
      unit_price: it.unit_price,
      amount: it.amount,
      technician_id: it.technician_id,
      labor_minutes: it.labor_minutes,
      is_warranty: it.is_warranty,
      notes: it.notes,
    }));
    const { error: itemsErr } = await supabase.from("work_order_items").insert(rows);
    if (itemsErr) {
      // 主檔已寫入但子檔失敗 — 為避免孤兒，先回收主檔
      await supabase.from("work_orders").delete().eq("id", wo.id);
      const mapped = mapDbError(itemsErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/work-orders");
  return { ok: true, data: { id: wo.id } };
}

export async function updateWorkOrderAction(
  id: string,
  input: WorkOrderInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 work_order id" };

  const payload = buildPayload(input);
  const items = sanitizeItems(input.items);

  const fieldErrors: Partial<Record<WorkOrderFieldKey, string>> = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const partsAmount = sumByKind(items, "parts");
  const laborAmount = sumByKind(items, "labor");
  const externalAmount = sumByKind(items, "external");
  const discountAmount = sumByKind(items, "discount");
  const totalAmount = partsAmount + laborAmount + externalAmount + discountAmount;

  const supabase = await createClient();

  const { error } = await supabase
    .from("work_orders")
    .update({
      ...payload,
      parts_amount: partsAmount,
      labor_amount: laborAmount,
      external_amount: externalAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
    })
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  // Items 走「全刪重建」策略 — 簡單可靠，避免 diff 邏輯複雜化。
  // 若日後 line items 有 history / 引用（例如領料單），改成 upsert + soft delete。
  await supabase.from("work_order_items").delete().eq("work_order_id", id);

  if (items.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = items.map((it) => ({
      brand_id: _brandId,
      work_order_id: id,
      line_no: it.line_no,
      kind: it.kind,
      item_id: it.item_id,
      labor_code: it.labor_code,
      description: it.description,
      qty: it.qty,
      unit_price: it.unit_price,
      amount: it.amount,
      technician_id: it.technician_id,
      labor_minutes: it.labor_minutes,
      is_warranty: it.is_warranty,
      notes: it.notes,
    }));
    const { error: itemsErr } = await supabase.from("work_order_items").insert(rows);
    if (itemsErr) {
      const mapped = mapDbError(itemsErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/work-orders");
  revalidatePath(`/admin/master-data/work-orders/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteWorkOrderAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 work_order id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("work_orders")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "此工單被其他單據引用，無法刪除。請改用「已取消」狀態保留歷史。",
      };
    }
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/work-orders");
  return { ok: true, data: null };
}
