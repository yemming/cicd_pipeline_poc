"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  WorkOrderFormState,
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

function pickStatus(raw: FormDataEntryValue | null): Status {
  const v = String(raw ?? "draft");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "draft";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function numOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function genRoNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `RO-${ymd}-${rand}`;
}

function mapDbError(error: { code?: string; message: string }): WorkOrderFormState {
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

/**
 * 把 client 序列化的 items_json 解析回 array，做型別與數字 sanitize。
 * 失敗回 null（caller 視為「沒有 items」）。
 */
function parseItemsJson(raw: FormDataEntryValue | null): WorkOrderItemDraft[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw, idx): WorkOrderItemDraft | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
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

function pickPayload(fd: FormData) {
  return {
    ro_no: strOrNull(fd.get("ro_no")) ?? genRoNo(),
    customer_id: String(fd.get("customer_id") ?? "").trim(),
    vehicle_id: String(fd.get("vehicle_id") ?? "").trim(),
    appointment_id: strOrNull(fd.get("appointment_id")),
    status: pickStatus(fd.get("status")),
    advisor_id: strOrNull(fd.get("advisor_id")),
    lead_technician_id: strOrNull(fd.get("lead_technician_id")),
    mileage_in: numOrNull(fd.get("mileage_in")),
    mileage_out: numOrNull(fd.get("mileage_out")),
    customer_complaint: strOrNull(fd.get("customer_complaint")),
    diagnosis: strOrNull(fd.get("diagnosis")),
    work_summary: strOrNull(fd.get("work_summary")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createWorkOrderAction(
  _prevState: WorkOrderFormState,
  fd: FormData,
): Promise<WorkOrderFormState> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const items = parseItemsJson(fd.get("items_json"));

  const fieldErrors: WorkOrderFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const partsAmount = sumByKind(items, "parts");
  const laborAmount = sumByKind(items, "labor");
  const externalAmount = sumByKind(items, "external");
  const discountAmount = sumByKind(items, "discount");
  const totalAmount = partsAmount + laborAmount + externalAmount + discountAmount;

  const supabase = await createClient();

  const { data: wo, error } = await supabase
    .from("work_orders")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
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
  if (error) return mapDbError(error);

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
      return mapDbError(itemsErr);
    }
  }

  revalidatePath("/admin/master-data/work-orders");
  redirect("/admin/master-data/work-orders");
}

export async function updateWorkOrderAction(
  _prevState: WorkOrderFormState,
  fd: FormData,
): Promise<WorkOrderFormState> {
  await requirePermission(PERMISSIONS.RO_CREATE);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 work_order id" };

  const payload = pickPayload(fd);
  const items = parseItemsJson(fd.get("items_json"));

  const fieldErrors: WorkOrderFormState["fieldErrors"] = {};
  if (!payload.customer_id) fieldErrors.customer_id = "必選";
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
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
  if (error) return mapDbError(error);

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
    if (itemsErr) return mapDbError(itemsErr);
  }

  revalidatePath("/admin/master-data/work-orders");
  revalidatePath(`/admin/master-data/work-orders/${id}`);
  redirect("/admin/master-data/work-orders");
}
