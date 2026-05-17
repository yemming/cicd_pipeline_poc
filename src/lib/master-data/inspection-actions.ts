"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  InspectionFieldKey,
  InspectionFindingDraft,
} from "./inspection-form-types";

const KINDS = ["PI", "PDI"] as const;
type Kind = (typeof KINDS)[number];

const OVERALL_STATUSES = ["pending", "pass", "fail", "conditional"] as const;
type OverallStatus = (typeof OVERALL_STATUSES)[number];

const FINDING_STATUSES = ["ok", "needs_attention", "critical", "na"] as const;

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<InspectionFieldKey, string>> };

export type InspectionInput = {
  kind?: Kind | null;
  vehicle_id: string;
  work_order_id?: string | null;
  appointment_id?: string | null;
  inspector_id?: string | null;
  inspected_at?: string | null; // local 'YYYY-MM-DDTHH:mm' (Asia/Taipei)
  mileage_at_inspection?: number | null;
  overall_status?: OverallStatus | null;
  customer_signature_url?: string | null;
  notes?: string | null;
  findings?: InspectionFindingDraft[];
};

function pickKind(raw: string | null | undefined): Kind {
  const v = String(raw ?? "PI");
  return (KINDS as readonly string[]).includes(v) ? (v as Kind) : "PI";
}

function pickOverall(raw: string | null | undefined): OverallStatus {
  const v = String(raw ?? "pending");
  return (OVERALL_STATUSES as readonly string[]).includes(v)
    ? (v as OverallStatus)
    : "pending";
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function mapDbError(error: { code?: string; message: string }): {
  error: string;
  fieldErrors?: Partial<Record<InspectionFieldKey, string>>;
} {
  if (error.code === "23503") {
    if (error.message.includes("vehicle_id")) {
      return { error: "車輛不存在", fieldErrors: { vehicle_id: "請重新選擇" } };
    }
    if (error.message.includes("work_order_id")) {
      return { error: "工單不存在", fieldErrors: { work_order_id: "請重新選擇" } };
    }
    if (error.message.includes("appointment_id")) {
      return { error: "預約不存在", fieldErrors: { appointment_id: "請重新選擇" } };
    }
    if (error.message.includes("inspector_id")) {
      return { error: "檢驗員不存在", fieldErrors: { inspector_id: "請重新選擇" } };
    }
  }
  return { error: `儲存失敗：${error.message}` };
}

function sanitizeFindings(raw: InspectionFindingDraft[] | undefined): InspectionFindingDraft[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((f): InspectionFindingDraft | null => {
      if (!f || typeof f !== "object") return null;
      const category = String(f.category ?? "").trim();
      const itemLabel = String(f.item_label ?? "").trim();
      if (!category || !itemLabel) return null;
      const statusStr = String(f.status ?? "ok");
      const status = (FINDING_STATUSES as readonly string[]).includes(statusStr)
        ? (statusStr as InspectionFindingDraft["status"])
        : "ok";
      return {
        id: f.id ? String(f.id) : null,
        category,
        item_label: itemLabel,
        status,
        measurement: f.measurement ? String(f.measurement).trim() || null : null,
        notes: f.notes ? String(f.notes).trim() || null : null,
        photo_url: f.photo_url ? String(f.photo_url).trim() || null : null,
      };
    })
    .filter((x): x is InspectionFindingDraft => x !== null);
}

function buildPayload(input: InspectionInput) {
  const inspectedAtLocal = trim(input.inspected_at ?? null);
  const inspectedAt = inspectedAtLocal
    ? new Date(`${inspectedAtLocal}:00+08:00`).toISOString()
    : null;
  return {
    kind: pickKind(input.kind),
    vehicle_id: (input.vehicle_id ?? "").trim(),
    work_order_id: trim(input.work_order_id ?? null),
    appointment_id: trim(input.appointment_id ?? null),
    inspector_id: trim(input.inspector_id ?? null),
    inspected_at: inspectedAt,
    mileage_at_inspection: input.mileage_at_inspection ?? null,
    overall_status: pickOverall(input.overall_status),
    customer_signature_url: trim(input.customer_signature_url ?? null),
    notes: trim(input.notes ?? null),
  };
}

export async function createInspectionAction(
  input: InspectionInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) return { ok: false, error: "未登入" };

  const payload = buildPayload(input);
  const findings = sanitizeFindings(input.findings);

  const fieldErrors: Partial<Record<InspectionFieldKey, string>> = {};
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const insertData: Record<string, unknown> = {
    brand_id: (await getActiveScope()).brand_id,
    ...payload,
    created_by: ctx.userId,
  };
  if (!payload.inspected_at) delete insertData.inspected_at;

  const { data: rec, error } = await supabase
    .from("inspection_records")
    .insert(insertData)
    .select("id")
    .single();
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  if (findings.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = findings.map((f) => ({
      brand_id: _brandId,
      inspection_id: rec.id,
      category: f.category,
      item_label: f.item_label,
      status: f.status,
      measurement: f.measurement,
      notes: f.notes,
      photo_url: f.photo_url,
    }));
    const { error: findErr } = await supabase
      .from("inspection_findings")
      .insert(rows);
    if (findErr) {
      await supabase.from("inspection_records").delete().eq("id", rec.id);
      const mapped = mapDbError(findErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/inspections");
  return { ok: true, data: { id: rec.id } };
}

export async function updateInspectionAction(
  id: string,
  input: InspectionInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  if (!id) return { ok: false, error: "缺少 inspection id" };

  const payload = buildPayload(input);
  const findings = sanitizeFindings(input.findings);

  const fieldErrors: Partial<Record<InspectionFieldKey, string>> = {};
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const updateData: Record<string, unknown> = { ...payload };
  if (!payload.inspected_at) delete updateData.inspected_at;

  const { error } = await supabase
    .from("inspection_records")
    .update(updateData)
    .eq("id", id);
  if (error) {
    const mapped = mapDbError(error);
    return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
  }

  // Findings 走「全刪重建」（與 work_order_items 同策略；CASCADE 不會觸發）
  await supabase.from("inspection_findings").delete().eq("inspection_id", id);

  if (findings.length > 0) {
    const _brandId = (await getActiveScope()).brand_id;
    const rows = findings.map((f) => ({
      brand_id: _brandId,
      inspection_id: id,
      category: f.category,
      item_label: f.item_label,
      status: f.status,
      measurement: f.measurement,
      notes: f.notes,
      photo_url: f.photo_url,
    }));
    const { error: findErr } = await supabase
      .from("inspection_findings")
      .insert(rows);
    if (findErr) {
      const mapped = mapDbError(findErr);
      return { ok: false, error: mapped.error, fieldErrors: mapped.fieldErrors };
    }
  }

  revalidatePath("/admin/master-data/inspections");
  revalidatePath(`/admin/master-data/inspections/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteInspectionAction(
  id: string,
): Promise<ActionResult<null>> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  if (!id) return { ok: false, error: "缺少 inspection id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_records")
    .delete()
    .eq("id", id);
  if (error) {
    return { ok: false, error: `刪除失敗：${error.message}` };
  }
  revalidatePath("/admin/master-data/inspections");
  return { ok: true, data: null };
}
