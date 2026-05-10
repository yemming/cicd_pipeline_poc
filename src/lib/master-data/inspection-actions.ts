"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import type {
  InspectionFindingDraft,
  InspectionFormState,
} from "./inspection-form-types";

const KINDS = ["PI", "PDI"] as const;
type Kind = (typeof KINDS)[number];

const OVERALL_STATUSES = ["pending", "pass", "fail", "conditional"] as const;
type OverallStatus = (typeof OVERALL_STATUSES)[number];

const FINDING_STATUSES = ["ok", "needs_attention", "critical", "na"] as const;

function pickKind(raw: FormDataEntryValue | null): Kind {
  const v = String(raw ?? "PI");
  return (KINDS as readonly string[]).includes(v) ? (v as Kind) : "PI";
}

function pickOverall(raw: FormDataEntryValue | null): OverallStatus {
  const v = String(raw ?? "pending");
  return (OVERALL_STATUSES as readonly string[]).includes(v)
    ? (v as OverallStatus)
    : "pending";
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

function mapDbError(error: { code?: string; message: string }): InspectionFormState {
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

function parseFindingsJson(raw: FormDataEntryValue | null): InspectionFindingDraft[] {
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
    .map((raw): InspectionFindingDraft | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const category = String(r.category ?? "").trim();
      const itemLabel = String(r.item_label ?? "").trim();
      if (!category || !itemLabel) return null;
      const statusStr = String(r.status ?? "ok");
      const status = (FINDING_STATUSES as readonly string[]).includes(statusStr)
        ? (statusStr as InspectionFindingDraft["status"])
        : "ok";
      return {
        id: r.id ? String(r.id) : null,
        category,
        item_label: itemLabel,
        status,
        measurement: r.measurement ? String(r.measurement).trim() || null : null,
        notes: r.notes ? String(r.notes).trim() || null : null,
        photo_url: r.photo_url ? String(r.photo_url).trim() || null : null,
      };
    })
    .filter((x): x is InspectionFindingDraft => x !== null);
}

function pickPayload(fd: FormData) {
  const inspectedAtLocal = strOrNull(fd.get("inspected_at"));
  const inspectedAt = inspectedAtLocal
    ? new Date(`${inspectedAtLocal}:00+08:00`).toISOString()
    : null;
  return {
    kind: pickKind(fd.get("kind")),
    vehicle_id: String(fd.get("vehicle_id") ?? "").trim(),
    work_order_id: strOrNull(fd.get("work_order_id")),
    appointment_id: strOrNull(fd.get("appointment_id")),
    inspector_id: strOrNull(fd.get("inspector_id")),
    inspected_at: inspectedAt,
    mileage_at_inspection: numOrNull(fd.get("mileage_at_inspection")),
    overall_status: pickOverall(fd.get("overall_status")),
    customer_signature_url: strOrNull(fd.get("customer_signature_url")),
    notes: strOrNull(fd.get("notes")),
  };
}

export async function createInspectionAction(
  _prevState: InspectionFormState,
  fd: FormData,
): Promise<InspectionFormState> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);
  const ctx = await getCurrentUserContext();
  if (!ctx.userId) redirect("/login");

  const payload = pickPayload(fd);
  const findings = parseFindingsJson(fd.get("findings_json"));

  const fieldErrors: InspectionFormState["fieldErrors"] = {};
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
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
  if (error) return mapDbError(error);

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
      return mapDbError(findErr);
    }
  }

  revalidatePath("/admin/master-data/inspections");
  redirect("/admin/master-data/inspections");
}

export async function updateInspectionAction(
  _prevState: InspectionFormState,
  fd: FormData,
): Promise<InspectionFormState> {
  await requirePermission(PERMISSIONS.INSPECTION_EDIT);

  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "缺少 inspection id" };

  const payload = pickPayload(fd);
  const findings = parseFindingsJson(fd.get("findings_json"));

  const fieldErrors: InspectionFormState["fieldErrors"] = {};
  if (!payload.vehicle_id) fieldErrors.vehicle_id = "必選";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "請補齊必填欄位", fieldErrors };
  }

  const supabase = await createClient();
  const updateData: Record<string, unknown> = { ...payload };
  if (!payload.inspected_at) delete updateData.inspected_at;

  const { error } = await supabase
    .from("inspection_records")
    .update(updateData)
    .eq("id", id);
  if (error) return mapDbError(error);

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
    if (findErr) return mapDbError(findErr);
  }

  revalidatePath("/admin/master-data/inspections");
  revalidatePath(`/admin/master-data/inspections/${id}`);
  redirect("/admin/master-data/inspections");
}
