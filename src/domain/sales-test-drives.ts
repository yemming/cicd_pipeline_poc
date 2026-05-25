import "server-only";

/**
 * Domain Helper — Sales Test Drives（試駕記錄、GAP-03、P1-#12）
 *
 * UI 絕對禁止 import @/lib/supabase；一律透過此 helper 讀寫。
 * 跟既有 /sales/testdrive（A11-v1 wizard）並存：
 *   - wizard：一次性試駕流程 UI（不存 DB）
 *   - 本表：試駕記錄查詢 / 排程 / 完成回填的單一事實來源
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

// 純展示型常數 / type 從 client-safe 的 .constants 重新導出
import {
  TEST_DRIVE_STATUS_LABELS,
  TEST_DRIVE_STATUS_CHIP,
  TEST_DRIVES_PAGE_SIZE_DEFAULT,
} from "./sales-test-drives.constants";
import type {
  TestDriveStatus,
  TestDriveRow,
  ListTestDrivesFilter,
  CreateTestDriveInput,
  UpdateTestDriveInput,
  CompleteTestDriveInput,
  TestDriveStats,
  Result,
  TestDriveLookups,
  StartWithSignatureInput,
  TestDriveSignature,
} from "./sales-test-drives.constants";

export {
  TEST_DRIVE_STATUS_LABELS,
  TEST_DRIVE_STATUS_CHIP,
  TEST_DRIVES_PAGE_SIZE_DEFAULT,
};
export type {
  TestDriveStatus,
  TestDriveRow,
  ListTestDrivesFilter,
  CreateTestDriveInput,
  UpdateTestDriveInput,
  CompleteTestDriveInput,
  TestDriveStats,
  Result,
  TestDriveLookups,
  StartWithSignatureInput,
  TestDriveSignature,
};

export async function getTestDriveLookups(): Promise<TestDriveLookups> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [custRes, mdlRes, empRes, leadRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("vehicle_models")
      .select("id, model_name")
      .eq("brand_id", scope.brand_id)
      .order("model_name")
      .limit(500),
    supabase
      .from("employees")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("sales_leads")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .limit(500),
  ]);

  return {
    customers: (custRes.data ?? []) as Array<{ id: string; name: string }>,
    models: ((mdlRes.data ?? []) as Array<{ id: string; model_name: string }>).map(
      (r) => ({ id: r.id, name: r.model_name }),
    ),
    consultants: (empRes.data ?? []) as Array<{ id: string; name: string }>,
    leads: (leadRes.data ?? []) as Array<{ id: string }>,
  };
}

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

type RawListRow = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  vehicle_model_id: string | null;
  lead_id: string | null;
  handcard_id: string | null;
  sales_consultant_id: string | null;
  scheduled_at: string;
  completed_at: string | null;
  status: string;
  notes: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  customer: { name: string | null } | null;
  vehicle_model: { model_name: string | null } | null;
  consultant: { name: string | null } | null;
};

function shapeRow(r: RawListRow): TestDriveRow {
  return {
    id: r.id,
    brand_id: r.brand_id,
    customer_id: r.customer_id,
    vehicle_model_id: r.vehicle_model_id,
    lead_id: r.lead_id,
    handcard_id: r.handcard_id,
    sales_consultant_id: r.sales_consultant_id,
    scheduled_at: r.scheduled_at,
    completed_at: r.completed_at,
    status: r.status as TestDriveStatus,
    notes: r.notes,
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_at: r.created_at,
    updated_at: r.updated_at,
    customer_name: r.customer?.name ?? null,
    vehicle_model_name: r.vehicle_model?.model_name ?? null,
    consultant_name: r.consultant?.name ?? null,
  };
}

const SELECT_FIELDS =
  "id, brand_id, customer_id, vehicle_model_id, lead_id, handcard_id, sales_consultant_id, scheduled_at, completed_at, status, notes, metadata, created_at, updated_at, customer:customers!sales_test_drives_customer_id_fkey ( name ), vehicle_model:vehicle_models!sales_test_drives_vehicle_model_id_fkey ( model_name ), consultant:employees!sales_test_drives_sales_consultant_id_fkey ( name )";

export async function listTestDrives(
  filter: ListTestDrivesFilter = {},
): Promise<{ rows: TestDriveRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? TEST_DRIVES_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("sales_test_drives")
    .select(SELECT_FIELDS, { count: "exact" })
    .eq("brand_id", scope.brand_id)
    .order("scheduled_at", { ascending: false })
    .range(from, to);

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.sales_consultant_id)
    q = q.eq("sales_consultant_id", filter.sales_consultant_id);
  if (filter.date_from)
    q = q.gte("scheduled_at", `${filter.date_from}T00:00:00`);
  if (filter.date_to) q = q.lte("scheduled_at", `${filter.date_to}T23:59:59`);
  if (filter.q) {
    const t = filter.q.trim().replace(/[%,]/g, "");
    if (t) q = q.ilike("notes", `%${t}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const rows = ((data ?? []) as unknown as RawListRow[]).map(shapeRow);
  return { rows, totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
// Stats（KPI 4 顆：今日試駕 / 本週完成 / 平均評分 / 待安排）
// ─────────────────────────────────────────────────────────────

export async function getTestDriveStats(): Promise<TestDriveStats> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈當前 brand 全量 minimal 欄位，在 JS 端算 KPI（量級小、不需獨立 RPC）
  const { data, error } = await supabase
    .from("sales_test_drives")
    .select("status, scheduled_at, completed_at, metadata")
    .eq("brand_id", scope.brand_id);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    status: string;
    scheduled_at: string;
    completed_at: string | null;
    metadata: unknown;
  }>;

  // 以 Asia/Taipei 當地日界判斷「今日」「本週」
  const tz = "Asia/Taipei";
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD

  // 本週一 00:00（台北）— 用當地日期算週一
  const now = new Date();
  const localNow = new Date(
    now.toLocaleString("en-US", { timeZone: tz }),
  );
  const dow = (localNow.getDay() + 6) % 7; // 週一=0
  const weekStartLocal = new Date(localNow);
  weekStartLocal.setDate(localNow.getDate() - dow);
  weekStartLocal.setHours(0, 0, 0, 0);

  let todayCount = 0;
  let weekCompleted = 0;
  let scheduledCount = 0;
  const ratings: number[] = [];

  for (const r of rows) {
    const localDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.scheduled_at));
    if (localDateStr === todayStr) todayCount += 1;
    if (r.status === "scheduled") scheduledCount += 1;
    if (r.status === "completed" && r.completed_at) {
      const c = new Date(r.completed_at);
      if (c >= weekStartLocal) weekCompleted += 1;
    }
    const meta =
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {};
    const rating = meta.rating;
    if (typeof rating === "number") ratings.push(rating);
    else if (typeof rating === "string" && rating.trim() !== "") {
      const n = Number(rating);
      if (!Number.isNaN(n)) ratings.push(n);
    }
  }

  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;

  return { todayCount, weekCompleted, avgRating, scheduledCount };
}

// ─────────────────────────────────────────────────────────────
// Get by id
// ─────────────────────────────────────────────────────────────

export async function getTestDriveById(
  id: string,
): Promise<TestDriveRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_test_drives")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return shapeRow(data as unknown as RawListRow);
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createTestDrive(
  input: CreateTestDriveInput,
): Promise<Result<{ id: string }>> {
  if (!input.scheduled_at) {
    return { ok: false, error: "預約日期時間必填" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("sales_test_drives")
    .insert({
      brand_id: scope.brand_id,
      customer_id: input.customer_id ?? null,
      vehicle_model_id: input.vehicle_model_id ?? null,
      lead_id: input.lead_id ?? null,
      sales_consultant_id: input.sales_consultant_id ?? null,
      scheduled_at: input.scheduled_at,
      status: input.status ?? "scheduled",
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateTestDrive(
  id: string,
  patch: UpdateTestDriveInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const updates: Record<string, unknown> = {};
  if (patch.customer_id !== undefined) updates.customer_id = patch.customer_id;
  if (patch.vehicle_model_id !== undefined)
    updates.vehicle_model_id = patch.vehicle_model_id;
  if (patch.lead_id !== undefined) updates.lead_id = patch.lead_id;
  if (patch.sales_consultant_id !== undefined)
    updates.sales_consultant_id = patch.sales_consultant_id;
  if (patch.scheduled_at !== undefined)
    updates.scheduled_at = patch.scheduled_at;
  if (patch.completed_at !== undefined)
    updates.completed_at = patch.completed_at;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.metadata !== undefined) updates.metadata = patch.metadata;

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { id } };
  }

  const { error } = await supabase
    .from("sales_test_drives")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteTestDrive(
  id: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { error } = await supabase
    .from("sales_test_drives")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Complete（試駕完成回填 — 寫 rating / feedback / 里程 / 路線到 metadata）
// ─────────────────────────────────────────────────────────────

export async function completeTestDrive(
  id: string,
  payload: CompleteTestDriveInput,
): Promise<Result<{ id: string; handcard_id: string | null }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 讀現有 metadata 合併
  const { data: existing, error: rErr } = await supabase
    .from("sales_test_drives")
    .select("id, handcard_id, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!existing) return { ok: false, error: "找不到試駕記錄" };

  const prevMeta =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const meta: Record<string, unknown> = {
    ...prevMeta,
    rating: payload.rating ?? null,
    feedback: payload.feedback ?? null,
    mileage_before: payload.mileage_before ?? null,
    mileage_after: payload.mileage_after ?? null,
    route_taken: payload.route_taken ?? null,
  };

  const { error } = await supabase
    .from("sales_test_drives")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      notes: payload.notes ?? null,
      metadata: meta,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: { id, handcard_id: existing.handcard_id ?? null },
  };
}

// ─────────────────────────────────────────────────────────────
// Start with signature（出車前簽試乘同意條款 → 寫 metadata.signature + 切 in_progress）
// 不污染 completeTestDrive；沿用 read-merge-write metadata 寫法。
// ─────────────────────────────────────────────────────────────

export async function startTestDriveWithSignature(
  id: string,
  sig: StartWithSignatureInput,
): Promise<Result<{ id: string }>> {
  if (!sig.dataUrl || !sig.dataUrl.startsWith("data:image/")) {
    return { ok: false, error: "缺少有效的簽名圖" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 讀現有 metadata 合併（避免覆蓋既有 started_at / 其他鍵）
  const { data: existing, error: rErr } = await supabase
    .from("sales_test_drives")
    .select("id, status, metadata")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!existing) return { ok: false, error: "找不到試駕記錄" };
  if (existing.status !== "scheduled") {
    return { ok: false, error: "只有「已排程」的試駕可以簽名出車" };
  }

  const prevMeta =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const signature: TestDriveSignature = {
    data_url: sig.dataUrl,
    signed_at: new Date().toISOString(),
    consent_version: sig.consentVersion ?? "test-drive-v1",
    ...(sig.signerName ? { signer_name: sig.signerName } : {}),
  };

  const meta: Record<string, unknown> = {
    ...prevMeta,
    started_at: new Date().toISOString(),
    signature,
  };

  const { error } = await supabase
    .from("sales_test_drives")
    .update({ status: "in_progress", metadata: meta })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Link to handcard — 試駕完成後綁定接待手卡
// ─────────────────────────────────────────────────────────────

export async function linkToHandcard(
  testRideId: string,
  handcardId: string,
): Promise<Result<{ id: string }>> {
  if (!testRideId) return { ok: false, error: "缺少試駕 id" };
  if (!handcardId) return { ok: false, error: "缺少手卡 id" };
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("sales_test_drives")
    .update({ handcard_id: handcardId })
    .eq("id", testRideId)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: testRideId } };
}
