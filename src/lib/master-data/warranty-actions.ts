"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  WarrantyFormState,
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

function pickType(raw: FormDataEntryValue | null): ClaimType {
  const v = String(raw ?? "oem_warranty");
  return (CLAIM_TYPES as readonly string[]).includes(v)
    ? (v as ClaimType)
    : "oem_warranty";
}

function pickStatus(raw: FormDataEntryValue | null): Status {
  const v = String(raw ?? "draft");
  return (STATUSES as readonly string[]).includes(v) ? (v as Status) : "draft";
}

function strOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function dateOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  return v.length === 0 ? null : v;
}

function numOrZero(raw: FormDataEntryValue | null): number {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function genClNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `WC-${ymd}-${rand}`;
}

function mapDbError(error: { code?: string; message: string }): WarrantyFormState {
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

function parseLinesJson(raw: FormDataEntryValue | null): WarrantyLineDraft[] {
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
    .map((raw, idx): WarrantyLineDraft | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const itemId = String(r.item_id ?? "").trim();
      if (!itemId) return null;
      const qty = Number(r.qty ?? 1);
      const partsCost = Number(r.parts_cost ?? 0);
      const laborCost = Number(r.labor_cost ?? 0);
      const appliedAmount = Number(r.applied_amount ?? partsCost + laborCost);
      const approvedRaw = r.approved_amount;
      return {
        id: r.id ? String(r.id) : null,
        line_no: idx + 1,
        item_id: itemId,
        serial_no: r.serial_no ? String(r.serial_no).trim() || null : null,
        qty: Number.isFinite(qty) ? qty : 1,
        parts_cost: Number.isFinite(partsCost) ? partsCost : 0,
        labor_cost: Number.isFinite(laborCost) ? laborCost : 0,
        applied_amount: Number.isFinite(appliedAmount) ? appliedAmount : 0,
        approved_amount:
          approvedRaw == null || approvedRaw === ""
            ? null
            : Number.isFinite(Number(approvedRaw))
              ? Number(approvedRaw)
              : null,
        notes: r.notes ? String(r.notes).trim() || null : null,
      };
    })
    .filter((x): x is WarrantyLineDraft => x !== null);
}

function pickPayload(fd: FormData) {
  return {
    cl_no: strOrNull(fd.get("cl_no")) ?? genClNo(),
    claim_type: pickType(fd.get("claim_type")),
    claim_date: dateOrNull(fd.get("claim_date")),
    ro_id: strOrNull(fd.get("ro_id")),
    vin: strOrNull(fd.get("vin")),
    customer_id: strOrNull(fd.get("customer_id")),
    vehicle_model_id: strOrNull(fd.get("vehicle_model_id")),
    status: pickStatus(fd.get("status")),
    applied_amount: numOrZero(fd.get("applied_amount")),
    approved_amount: numOrNull(fd.get("approved_amount")),
    parts_cost: numOrZero(fd.get("parts_cost")),
    labor_cost: numOrZero(fd.get("labor_cost")),
    forecast_receipt_date: dateOrNull(fd.get("forecast_receipt_date")),
    actual_receipt_date: dateOrNull(fd.get("actual_receipt_date")),
    oem_reference_no: strOrNull(fd.get("oem_reference_no")),
    notes: strOrNull(fd.get("notes")),
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
  _prevState: WarrantyFormState,
  fd: FormData,
): Promise<WarrantyFormState> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const lines = parseLinesJson(fd.get("lines_json"));

  // 自動 aggregate（覆寫使用者輸入，避免不一致）
  const agg = aggregate(lines);
  if (lines.length > 0) {
    payload.parts_cost = agg.parts;
    payload.labor_cost = agg.labor;
    payload.applied_amount = agg.applied;
    if (agg.hasApproved) payload.approved_amount = agg.approved;
  }

  const supabase = await createClient();
  const { data: cl, error } = await supabase
    .from("warranty_claims")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      ...payload,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return mapDbError(error);

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
      return mapDbError(linesErr);
    }
  }

  revalidatePath("/admin/master-data/warranty-claims");
  redirect("/admin/master-data/warranty-claims");
}

export async function updateWarrantyClaimAction(
  _prevState: WarrantyFormState,
  fd: FormData,
): Promise<WarrantyFormState> {
  await requirePermission(PERMISSIONS.WARRANTY_SUBMIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 warranty claim id" };

  const payload = pickPayload(fd);
  const lines = parseLinesJson(fd.get("lines_json"));

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
  if (error) return mapDbError(error);

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
    if (linesErr) return mapDbError(linesErr);
  }

  revalidatePath("/admin/master-data/warranty-claims");
  revalidatePath(`/admin/master-data/warranty-claims/${id}`);
  redirect("/admin/master-data/warranty-claims");
}
