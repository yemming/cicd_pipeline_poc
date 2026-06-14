"use server";

/**
 * Server actions — pre_inspections
 *
 * Spec：DUCATI 售後預檢單 v2（5-step wizard）
 *  - createBlankAction：直接開新單（無預約 / 客到場）
 *  - createFromAppointmentAction：從預約建立預檢
 *  - updateMetadataAction：通用 patch（wizard 任一步驟）
 *  - updateChecksAction / updatePurposesAction / updateAsksAction
 *  - updateTechRowsAction / updateSaItemsAction
 *  - signAction（SA + 客戶簽名）
 *  - transferToRoAction（轉成正式工單，創建 RO 並把 sa_items + tech.agree 帶過去）
 *  - cancelAction
 *  - deleteAction
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
// RP2：簽名上傳 Storage
import { uploadSignatureDataUrl, isStorageUrl } from "@/lib/aftersales/signature-upload";

import {
  computeQuote,
  type CheckRow,
  type PreInspectionMode,
  type SaQuoteItem,
  type Signature,
  type TechRow,
} from "@/domain/pre-inspections.constants";
import type { PreInspectionMetadata } from "@/domain/pre-inspections";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const PAGE = "/parts/aftersales/pre-inspections";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function todayInTaipei(): { yymmdd: string; iso: string } {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = pad(tz.getMonth() + 1);
  const day = pad(tz.getDate());
  return { yymmdd: `${String(y).slice(2)}${m}${day}`, iso: `${y}-${m}-${day}` };
}

async function nextSequenceFor(brand: string, yymmdd: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pre_inspections")
    .select("pi_no")
    .eq("brand_id", brand)
    .like("pi_no", `PI-${yymmdd}-%`);
  if (error) throw error;
  const max = ((data ?? []) as { pi_no: string }[])
    .map((r) => parseInt(r.pi_no.split("-").pop() ?? "0", 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return max + 1;
}

async function loadById(id: string) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("pre_inspections")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "找不到預檢單" };
  return { ok: true as const, brand, row: data };
}

function isLockedByStatus(status: string): boolean {
  return status === "transferred" || status === "cancelled";
}

export async function createBlankAction(payload: {
  customer_name?: string;
  customer_phone?: string;
  vehicle_license_plate?: string;
  vehicle_model_name?: string;
  mileage_in?: number | null;
  sa_name?: string;
  mode?: PreInspectionMode;
}): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { yymmdd } = todayInTaipei();
  const seq = await nextSequenceFor(brand, yymmdd);
  const pi_no = `PI-${yymmdd}-${String(seq).padStart(3, "0")}`;

  const { data, error } = await supabase
    .from("pre_inspections")
    .insert({
      brand_id: brand,
      pi_no,
      status: "in_progress",
      mode: payload.mode ?? "full",
      customer_name: payload.customer_name ?? null,
      customer_phone: payload.customer_phone ?? null,
      vehicle_license_plate: payload.vehicle_license_plate ?? null,
      vehicle_model_name: payload.vehicle_model_name ?? null,
      mileage_in: payload.mileage_in ?? null,
      sa_name: payload.sa_name ?? null,
      metadata: {
        checks: [],
        purposes: [],
        customer_words: "",
        asks: {},
        sa_remark: "",
        tech_rows: [],
        sa_items: [],
      },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "建立失敗" };

  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

export async function createFromAppointmentAction(
  appointment_id: string,
  mode: PreInspectionMode = "full",
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: appt, error: aErr } = await supabase
    .from("service_appointments")
    .select("id, brand_id, appt_no, customer_id, vehicle_id, mileage_at_appointment, advisor_id")
    .eq("id", appointment_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (aErr || !appt) return { ok: false, error: "找不到預約" };

  const { data: existed } = await supabase
    .from("pre_inspections")
    .select("id")
    .eq("appointment_id", appointment_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existed) return { ok: false, error: "此預約已建立預檢，請直接開啟" };

  // 撈 customer / vehicle snapshot
  let customer_name: string | null = null;
  let customer_phone: string | null = null;
  if (appt.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", appt.customer_id)
      .eq("brand_id", brand)
      .maybeSingle();
    if (c) {
      customer_name = c.name;
      customer_phone = c.phone;
    }
  }
  let vehicle_license_plate: string | null = null;
  let vehicle_model_name: string | null = null;
  if (appt.vehicle_id) {
    const { data: v } = await supabase
      .from("customer_vehicles")
      .select("license_plate, vehicle_models(display_name, model_name)")
      .eq("id", appt.vehicle_id)
      .maybeSingle();
    if (v) {
      vehicle_license_plate = v.license_plate;
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      vehicle_model_name = (m?.display_name ?? m?.model_name) ?? null;
    }
  }
  let sa_name: string | null = null;
  if (appt.advisor_id) {
    const { data: e } = await supabase
      .from("employees")
      .select("name")
      .eq("id", appt.advisor_id)
      .maybeSingle();
    sa_name = e?.name ?? null;
  }

  const { yymmdd } = todayInTaipei();
  const seq = await nextSequenceFor(brand, yymmdd);
  const pi_no = `PI-${yymmdd}-${String(seq).padStart(3, "0")}`;

  const { data, error } = await supabase
    .from("pre_inspections")
    .insert({
      brand_id: brand,
      pi_no,
      status: "in_progress",
      mode,
      appointment_id,
      customer_id: appt.customer_id,
      vehicle_id: appt.vehicle_id,
      customer_name,
      customer_phone,
      vehicle_license_plate,
      vehicle_model_name,
      mileage_in: appt.mileage_at_appointment ?? null,
      sa_id: appt.advisor_id ?? null,
      sa_name,
      metadata: {
        checks: [],
        purposes: [],
        customer_words: "",
        asks: {},
        sa_remark: "",
        tech_rows: [],
        sa_items: [],
      },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "建立失敗" };

  revalidatePath(PAGE);
  return { ok: true, data: { id: data.id } };
}

async function patchMetadata(
  id: string,
  patch: Partial<PreInspectionMetadata>,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (isLockedByStatus(ctx.row.status)) {
    return { ok: false, error: `狀態為「${ctx.row.status}」，無法修改` };
  }
  const supabase = await createClient();
  const next = { ...(ctx.row.metadata ?? {}), ...patch };
  const update: Record<string, unknown> = { metadata: next };

  // 同步 typed core 欄位（estimated_subtotal / estimated_labor_units）
  if ("sa_items" in patch || "tech_rows" in patch) {
    const sa = (next.sa_items ?? []) as SaQuoteItem[];
    const tech = (next.tech_rows ?? []) as TechRow[];
    const q = computeQuote(sa, tech);
    update.estimated_subtotal = q.total;
    update.estimated_labor_units = q.agreedLu;
  }

  const { error } = await supabase.from("pre_inspections").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function updateChecksAction(
  id: string,
  checks: CheckRow[],
  sa_remark?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  return patchMetadata(id, {
    checks,
    sa_remark: sa_remark ?? undefined,
  });
}

export async function updatePurposesAction(
  id: string,
  payload: { purposes: number[]; customer_words?: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  return patchMetadata(id, {
    purposes: payload.purposes,
    customer_words: payload.customer_words ?? "",
  });
}

export async function updateAsksAction(
  id: string,
  asks: Record<string, "yes" | "no" | "na">,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  return patchMetadata(id, { asks });
}

export async function updateTechRowsAction(
  id: string,
  tech_rows: TechRow[],
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  return patchMetadata(id, { tech_rows });
}

export async function updateSaItemsAction(
  id: string,
  sa_items: SaQuoteItem[],
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  return patchMetadata(id, { sa_items });
}

export async function setModeAction(
  id: string,
  mode: PreInspectionMode,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (isLockedByStatus(ctx.row.status)) {
    return { ok: false, error: `狀態為「${ctx.row.status}」，無法切換模式` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("pre_inspections")
    .update({ mode })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function updateBasicInfoAction(
  id: string,
  patch: {
    customer_name?: string;
    customer_phone?: string;
    vehicle_license_plate?: string;
    vehicle_model_name?: string;
    mileage_in?: number | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (isLockedByStatus(ctx.row.status)) {
    return { ok: false, error: `狀態為「${ctx.row.status}」，無法修改` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("pre_inspections")
    .update({
      customer_name: patch.customer_name ?? ctx.row.customer_name,
      customer_phone: patch.customer_phone ?? ctx.row.customer_phone,
      vehicle_license_plate: patch.vehicle_license_plate ?? ctx.row.vehicle_license_plate,
      vehicle_model_name: patch.vehicle_model_name ?? ctx.row.vehicle_model_name,
      mileage_in: patch.mileage_in ?? ctx.row.mileage_in,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function signAction(
  id: string,
  payload: {
    sa_text?: string;
    customer_text?: string;
    /** RP2：前端傳 JPEG base64 dataURL 或已上傳的 Storage URL */
    sa_screenshot_url?: string | null;
    customer_screenshot_url?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (isLockedByStatus(ctx.row.status)) {
    return { ok: false, error: `狀態為「${ctx.row.status}」，無法簽名` };
  }
  const meta = (ctx.row.metadata ?? {}) as PreInspectionMetadata;
  const now = new Date().toISOString();

  // RP2：若是 dataURL（base64），上傳 Storage 取得公開 URL；若已是 URL 則直接用
  let saImgUrl: string | null = meta.sig_sa?.screenshot_url ?? null;
  if (payload.sa_screenshot_url) {
    if (isStorageUrl(payload.sa_screenshot_url)) {
      saImgUrl = payload.sa_screenshot_url;
    } else {
      saImgUrl = await uploadSignatureDataUrl(
        payload.sa_screenshot_url,
        ctx.brand,
        "pre-inspection",
        id,
        "sa",
      ) ?? meta.sig_sa?.screenshot_url ?? null;
    }
  }
  let custImgUrl: string | null = meta.sig_customer?.screenshot_url ?? null;
  if (payload.customer_screenshot_url) {
    if (isStorageUrl(payload.customer_screenshot_url)) {
      custImgUrl = payload.customer_screenshot_url;
    } else {
      custImgUrl = await uploadSignatureDataUrl(
        payload.customer_screenshot_url,
        ctx.brand,
        "pre-inspection",
        id,
        "customer",
      ) ?? meta.sig_customer?.screenshot_url ?? null;
    }
  }

  const sig_sa: Signature = payload.sa_text
    ? {
        text: payload.sa_text,
        signed_at: now,
        screenshot_url: saImgUrl,
      }
    : saImgUrl
      ? {
          text: meta.sig_sa?.text ?? null,
          signed_at: meta.sig_sa?.signed_at ?? now,
          screenshot_url: saImgUrl,
        }
      : (meta.sig_sa ?? { text: null, signed_at: null });
  const sig_customer: Signature = payload.customer_text
    ? {
        text: payload.customer_text,
        signed_at: now,
        screenshot_url: custImgUrl,
      }
    : custImgUrl
      ? {
          text: meta.sig_customer?.text ?? null,
          signed_at: meta.sig_customer?.signed_at ?? now,
          screenshot_url: custImgUrl,
        }
      : (meta.sig_customer ?? { text: null, signed_at: null });
  const supabase = await createClient();
  const both = !!(sig_sa.text && sig_customer.text);
  const { error } = await supabase
    .from("pre_inspections")
    .update({
      metadata: {
        ...meta,
        sig_sa,
        sig_customer,
        // RP2 鎖定標記：雙簽後把環檢 / 基本資料欄位設唯讀，
        // UI 讀 metadata.sig_locked = true 時禁止修改
        sig_locked: both || (meta.sig_locked ?? false),
      },
      signed_at: both ? now : ctx.row.signed_at,
      status: both ? "signed" : ctx.row.status === "in_progress" ? "quoting" : ctx.row.status,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function transferToRoAction(id: string): Promise<ActionResult<{ id: string; ro_id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "signed") {
    return { ok: false, error: "尚未完成簽名，無法轉工單" };
  }
  if (ctx.row.repair_order_id) {
    return { ok: true, data: { id, ro_id: ctx.row.repair_order_id } };
  }
  // 不在這個 SOP 範圍直接展開 RO 全流程；這裡只做最小 RO row（後續走 RO 自己的流程）
  const supabase = await createClient();
  const { yymmdd } = todayInTaipei();
  // 走 WC-WR (Workshop Centre - Walk-in Repair) 預設 prefix
  const { data: roSeq } = await supabase
    .from("repair_orders")
    .select("sequence_no")
    .eq("brand_id", ctx.brand)
    .eq("issue_date", `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`);
  const max = ((roSeq ?? []) as { sequence_no: number }[])
    .map((r) => r.sequence_no ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  const ro_code = `WC-WR-${yymmdd}-${String(max + 1).padStart(3, "0")}`;
  const today = new Date();
  const issue_date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .insert({
      brand_id: ctx.brand,
      ro_code,
      prefix_p1: "WC",
      prefix_p2: "WR",
      issue_date,
      sequence_no: max + 1,
      pre_inspection_id: id,
      appointment_id: ctx.row.appointment_id,
      customer_id: ctx.row.customer_id,
      vehicle_id: ctx.row.vehicle_id,
      mileage_in: ctx.row.mileage_in,
      sa_id: ctx.row.sa_id,
      status: "未開始",
      estimated_subtotal: ctx.row.estimated_subtotal,
      estimated_labor_units: ctx.row.estimated_labor_units,
      metadata: { from_pre_inspection: id },
    })
    .select("id")
    .single();
  if (roErr || !ro) return { ok: false, error: roErr?.message ?? "建立工單失敗" };

  const { error: pErr } = await supabase
    .from("pre_inspections")
    .update({
      status: "transferred",
      repair_order_id: ro.id,
      transferred_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (pErr) return { ok: false, error: pErr.message };

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/repair-orders");
  return { ok: true, data: { id, ro_id: ro.id } };
}

export async function cancelAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status === "transferred") {
    return { ok: false, error: "已轉工單，無法取消" };
  }
  const supabase = await createClient();
  const meta = (ctx.row.metadata ?? {}) as PreInspectionMetadata;
  const { error } = await supabase
    .from("pre_inspections")
    .update({
      status: "cancelled",
      metadata: reason ? { ...meta, cancel_reason: reason } : meta,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function deleteAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status === "transferred") {
    return { ok: false, error: "已轉工單，無法刪除" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("pre_inspections").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}
