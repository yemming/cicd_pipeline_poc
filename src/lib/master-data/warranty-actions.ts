"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  WarrantyFieldKey,
  WarrantyLineDraft,
} from "./warranty-form-types";

const CLAIM_TYPES = [
  "oem_warranty",
  "extended_warranty",
  "tsb",
  "pdi",
  "goodwill",
] as const;
type ClaimType = (typeof CLAIM_TYPES)[number];

const STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "partial_approved",
  "rejected",
  "received",
  "cancelled",
] as const;
type Status = (typeof STATUSES)[number];

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<WarrantyFieldKey, string>> };

export type WarrantyClaimInput = {
  cl_no?: string | null;
  claim_type?: ClaimType | null;
  claim_date?: string | null;
  ro_id?: string | null;
  vin?: string | null;
  customer_id?: string | null;
  vehicle_model_id?: string | null;
  status?: Status | null;
  applied_amount?: number | null;
  approved_amount?: number | null;
  parts_cost?: number | null;
  labor_cost?: number | null;
  forecast_receipt_date?: string | null;
  actual_receipt_date?: string | null;
  oem_reference_no?: string | null;
  notes?: string | null;
  lines?: WarrantyLineDraft[];
};

function pickType(raw: string | null | undefined): ClaimType {
  const v = String(raw ?? "oem_warranty");
  return (CLAIM_TYPES as readonly string[]).includes(v)
    ? (v as ClaimType)
    : "oem_warranty";
}

function pickStatus(raw: string | null | undefined): Status {
  const v = String(raw ?? "draft");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "draft";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function numOrZero(v: number | null | undefined): number {
  if (v == null) return 0;
  return Number.isFinite(v) ? v : 0;
}

function genClNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `WC-${ymd}-${rand}`;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<WarrantyFieldKey, string>>;
} {
  if (error.code === "23505" && error.message.includes("warranty_claims_brand_id_cl_no_key")) {
    return {
      error: "索賠單號重複",
      fieldErrors: { cl_no: "此單號已存在，請改一個或留空自動產生" },
    };
  }
  if (error.code === "23503") {
    if (error.message.includes("ro_id")) {
      return { error: "工單不存在", fieldErrors: { ro_id: "請重新選擇" } };
    }
    if (error.message.includes("customer_id")) {
      return { error: "客戶不存在", fieldErrors: { customer_id: "請重新選擇" } };
    }
    if (error.message.includes("vehicle_model_id")) {
      return {
        error: "車型不存在",
        fieldErrors: { vehicle_model_id: "請重新選擇" },
      };
    }
    if (error.message.includes("item_id")) {
      return { error: "料號不存在（line items 內）" };
    }
  }
  return { error: `儲存失敗：${error.message}` };
}

function normalizeLines(input: WarrantyLineDraft[] | undefined): WarrantyLineDraft[] {
  if (!input || !Array.isArray(input)) return [];
  return input
    .map((raw, idx): WarrantyLineDraft | null => {
      if (!raw || typeof raw !== "object") return null;
      const itemId = String(raw.item_id ?? "").trim();
      if (!itemId) return null;
      const qty = Number(raw.qty ?? 1);
      const partsCost = Number(raw.parts_cost ?? 0);
      const laborCost = Number(raw.labor_cost ?? 0);
      const appliedAmount = Number(raw.applied_amount ?? partsCost + laborCost);
      const approvedRaw = raw.approved_amount;
      return {
        id: raw.id ? String(raw.id) : null,
        line_no: idx + 1,
        item_id: itemId,
        serial_no: raw.serial_no ? String(raw.serial_no).trim() || null : null,
        qty: Number.isFinite(qty) ? qty : 1,
        parts_cost: Number.isFinite(partsCost) ? partsCost : 0,
        labor_cost: Number.isFinite(laborCost) ? laborCost : 0,
        applied_amount: Number.isFinite(appliedAmount) ? appliedAmount : 0,
        approved_amount:
          approvedRaw == null
            ? null
            : Number.isFinite(Number(approvedRaw))
              ? Number(approvedRaw)
              : null,
        notes: raw.notes ? String(raw.notes).trim() || null : null,
      };
    })
    .filter((x): x is WarrantyLineDraft => x !== null);
}

function buildPayload(input: WarrantyClaimInput) {
  return {
    cl_no: trim(input.cl_no ?? null) ?? genClNo(),
    claim_type: pickType(input.claim_type),
    claim_date: trim(input.claim_date ?? null),
    ro_id: trim(input.ro_id ?? null),
    vin: trim(input.vin ?? null),
    customer_id: trim(input.customer_id ?? null),
    vehicle_model_id: trim(input.vehicle_model_id ?? null),
    status: pickStatus(input.status),
    applied_amount: numOrZero(input.applied_amount),
    approved_amount: input.approved_amount ?? null,
    parts_cost: numOrZero(input.parts_cost),
    labor_cost: numOrZero(input.labor_cost),
    forecast_receipt_date: trim(input.forecast_receipt_date ?? null),
    actual_receipt_date: trim(input.actual_receipt_date ?? null),
    oem_reference_no: trim(input.oem_reference_no ?? null),
    notes: trim(input.notes ?? null),
  };
}

function aggregate(lines: WarrantyLineDraft[]) {
  return lines.reduce(
    (acc, l) => ({
      parts: acc.parts + (Number.isFinite(l.parts_cost) ? l.parts_cost : 0),
      labor: acc.labor + (Number.isFinite(l.labor_cost) ? l.labor_cost : 0),
      applied:
        acc.applied + (Number.isFinite(l.applied_amount) ? l.applied_amount : 0),
      approved:
        l.approved_amount != null
          ? acc.approved + l.approved_amount
          : acc.approved,
      hasApproved: acc.hasApproved || l.approved_amount != null,
    }),
    { parts: 0, labor: 0, applied: 0, approved: 0, hasApproved: false },
  );
}

export async function createWarrantyClaimAction(
  input: WarrantyClaimInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const lines = normalizeLines(input.lines);

  // 自動 aggregate（覆寫使用者輸入，避免不一致）
  const agg = aggregate(lines);
  if (lines.length > 0) {
    payload.parts_cost = agg.parts;
    payload.labor_cost = agg.labor;
    payload.applied_amount = agg.applied;
    if (agg.hasApproved) payload.approved_amount = agg.approved;
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data: cl, error } = await supabase
    .from("warranty_claims")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  if (lines.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = lines.map((l) => ({
      brand_id: _brandId,
      cl_id: cl.id,
      line_no: l.line_no,
      item_id: l.item_id,
      serial_no: l.serial_no,
      qty: l.qty,
      parts_cost: l.parts_cost,
      labor_cost: l.labor_cost,
      applied_amount: l.applied_amount,
      approved_amount: l.approved_amount,
      notes: l.notes,
    }));
    const { error: linesErr } = await supabase
      .from("warranty_claim_lines")
      .insert(rows);
    if (linesErr) {
      // 主檔已寫入但子檔失敗，回收
      await supabase.from("warranty_claims").delete().eq("id", cl.id);
      const mapped = mapDbError(linesErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/warranty-claims");
  return { ok: true, data: { id: cl.id } };
}

export async function updateWarrantyClaimAction(
  id: string,
  input: WarrantyClaimInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!id) return { ok: false, error: "缺少 warranty claim id" };

  const payload = buildPayload(input);
  const lines = normalizeLines(input.lines);

  const agg = aggregate(lines);
  if (lines.length > 0) {
    payload.parts_cost = agg.parts;
    payload.labor_cost = agg.labor;
    payload.applied_amount = agg.applied;
    if (agg.hasApproved) payload.approved_amount = agg.approved;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("warranty_claims")
    .update(payload)
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  // Lines 全刪重建
  await supabase.from("warranty_claim_lines").delete().eq("cl_id", id);
  if (lines.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = lines.map((l) => ({
      brand_id: _brandId,
      cl_id: id,
      line_no: l.line_no,
      item_id: l.item_id,
      serial_no: l.serial_no,
      qty: l.qty,
      parts_cost: l.parts_cost,
      labor_cost: l.labor_cost,
      applied_amount: l.applied_amount,
      approved_amount: l.approved_amount,
      notes: l.notes,
    }));
    const { error: linesErr } = await supabase
      .from("warranty_claim_lines")
      .insert(rows);
    if (linesErr) {
      const mapped = mapDbError(linesErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/warranty-claims");
  revalidatePath(`/admin/master-data/warranty-claims/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteWarrantyClaimAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  if (!id) return { ok: false, error: "缺少 warranty claim id" };
  const supabase = await createClient();
  // 先刪 lines（FK），再刪主檔
  await supabase.from("warranty_claim_lines").delete().eq("cl_id", id);
  const { error } = await supabase.from("warranty_claims").delete().eq("id", id);
  if (error) {
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/warranty-claims");
  return { ok: true, data: null };
}
