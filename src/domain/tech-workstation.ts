"use server";

/**
 * Domain Helper — Tech 技師工作台（執行端）
 *
 * 第十一輪 C4b 落地。proposal：docs/proposals/feature-tech-workstation-phase1.md
 *
 * 對應頁面：/tech（技師本人視角的即時工作主控台）
 * 跟 /service/workshop（派工方=工頭/SA）不同：本檔是「執行方」—— 技師看指派給我的單、
 * 接單、勾工項、計工時、標完成、追加項目、轉派。
 *
 * 操作對象：repair_orders（+ repair_order_lines / repair_order_addons / labor_time_sessions），
 * 不碰 work_orders（proposal §1.2 一整排證據）。
 *
 * 天條：UI 永遠走本 helper、禁止直連 supabase；helper 內部 import supabase 是它的工作。
 *
 * 注意：本檔多為「讀」函式（server component 撈資料用）。「寫」動作的權限檢查 + Result 型別
 * 集中在 src/lib/aftersales/tech-workstation-actions.ts（client 自控導航），本檔的寫函式被
 * action 包一層、不重複做權限。
 */

import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { reserve, getAvailableQty } from "@/domain/inventory-reservations";
import { markWaitingParts } from "@/domain/parts-waiting";

// ─────────────────────────────────────────────────────────────
// 共用型別
// ─────────────────────────────────────────────────────────────

/**
 * RO 狀態（依 repair_orders.status 中文 enum）
 * ⚠️ 不可 export：本檔有頂層 "use server"，"use server" 模組只能 export async function，
 * export 非 async 值（const 物件）會在 /tech 首次 render 觸發 500
 * （'A "use server" file can only export async functions, found object'）。
 * 本常數僅檔內使用，改為 module-local const。（第十一輪 Phase 2 SA-03 修）
 */
const RO_STATUS = {
  ASSIGNED_PENDING: "進行中", // 已派未接（或初始受理）
  IN_REPAIR: "維修中", // 技師已接單、施工中
  AWAITING_CHECKOUT: "待結帳", // 完工待結帳
  CLOSED: "已關單",
  CANCELLED: "已取消",
} as const;

/** Tab 分類 */
export type TechTab = "pending" | "in_progress" | "done_today";

export type TechnicianRow = {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  grade: string | null;
  avatar_color: string | null;
  status: string;
  is_active: boolean;
};

export type WorkItemRow = {
  id: string;
  line_no: number;
  kind: "labor" | "part" | string;
  /** labor → labor_name；part → part_name */
  name: string;
  labor_units: number | null;
  qty: number | null;
  unit_price: number;
  amount: number;
  done: boolean;
  done_at: string | null;
};

export type TimerState = {
  isRunning: boolean;
  /** 本單累計工時（秒）— 已結束 session 的 duration_seconds 加總 + 進行中 session 的即時推算 */
  accumulatedSeconds: number;
  /** 進行中 session（status='active'）的 id；無則 null */
  activeSessionId: string | null;
  /** 進行中 session 的 started_at（client 拿來 tick）；無則 null */
  activeStartedAt: string | null;
};

export type AddonRow = {
  id: string;
  addon_no: number;
  name: string;
  addon_type: string;
  safety_level: string;
  tech_reason: string | null;
  estimated_fee: number;
  customer_decision: string;
  reserved_at: string | null;
  created_at: string | null;
};

export type AssignedOrderCard = {
  id: string;
  ro_code: string;
  status: string;
  /** 進行中=已派未接（待接單）/ 維修中=施工中 / 待結帳=完工 */
  customer_name: string | null;
  customer_phone: string | null;
  vehicle_license_plate: string | null;
  vehicle_model_name: string | null;
  sa_name: string | null;
  issue_date: string;
  opened_at: string | null;
  estimated_labor_units: number | null;
  /** accepted_at 從 metadata 帶出（接單時間） */
  accepted_at: string | null;
  workItems: WorkItemRow[];
  addons: AddonRow[];
  timer: TimerState;
};

export type TechWorkstationKpi = {
  pendingCount: number;
  inProgressCount: number;
  doneToday: number;
  todayWorkedMinutes: number;
};

export type OtherTechnicianOption = {
  id: string;
  code: string;
  name: string;
};

function todayTaipeiIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 台北今日 00:00 的 UTC ISO（用來篩「今日完成 / 今日工時」） */
function startOfTaipeiTodayIso(): string {
  const today = todayTaipeiIsoDate(); // YYYY-MM-DD（台北）
  // 台北 = UTC+8，台北今日 00:00 = 前一日 UTC 16:00
  return new Date(`${today}T00:00:00+08:00`).toISOString();
}

// ─────────────────────────────────────────────────────────────
// 讀：當前技師
// ─────────────────────────────────────────────────────────────

/**
 * 由當前登入 user → aftersales_technicians row（同 brand）。
 * 沒對映 / 非啟用 → 回 null（頁面顯示「您的帳號未綁定技師」友善提示，非報錯）。
 */
export async function getCurrentTechnician(): Promise<TechnicianRow | null> {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) return null;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("aftersales_technicians")
    .select("id, brand_id, code, name, grade, avatar_color, status, is_active")
    .eq("user_id", userId)
    .eq("brand_id", brand)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as TechnicianRow;
}

// ─────────────────────────────────────────────────────────────
// 讀：指派給我的工單（含工項 / 追加 / 工時）
// ─────────────────────────────────────────────────────────────

/**
 * 指派給我的 RO 卡片清單（lead_technician_id = techId）。
 * tab：
 *   pending     → status='進行中'（已派未接，待接單）
 *   in_progress → status IN ('維修中')（已接、施工中）
 *   done_today  → status IN ('待結帳','已關單') 且 今日完成（metadata.completed_at 或 closed_at 落在台北今日）
 * 不傳 tab → 回全部「未關單以外 + 今日完成」的 active 工單（pending + in_progress）。
 */
export async function listMyAssignedOrders(
  techId: string,
  tab?: TechTab,
): Promise<AssignedOrderCard[]> {
  if (!techId) return [];
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let query = supabase
    .from("repair_orders")
    .select(
      "id, ro_code, status, customer_id, vehicle_id, sa_id, issue_date, opened_at, estimated_labor_units, metadata, closed_at",
    )
    .eq("brand_id", brand)
    .eq("lead_technician_id", techId)
    .order("issue_date", { ascending: false })
    .order("sequence_no", { ascending: false })
    .limit(200);

  if (tab === "pending") {
    query = query.eq("status", RO_STATUS.ASSIGNED_PENDING);
  } else if (tab === "in_progress") {
    query = query.eq("status", RO_STATUS.IN_REPAIR);
  } else if (tab === "done_today") {
    query = query
      .in("status", [RO_STATUS.AWAITING_CHECKOUT, RO_STATUS.CLOSED])
      .gte("closed_at", startOfTaipeiTodayIso());
  } else {
    // 預設：進行中 + 維修中（active 工作面板）
    query = query.in("status", [RO_STATUS.ASSIGNED_PENDING, RO_STATUS.IN_REPAIR]);
  }

  const { data, error } = await query;
  if (error) throw error;

  type RoRaw = {
    id: string;
    ro_code: string;
    status: string;
    customer_id: string | null;
    vehicle_id: string | null;
    sa_id: string | null;
    issue_date: string;
    opened_at: string | null;
    estimated_labor_units: number | null;
    metadata: Record<string, unknown> | null;
    closed_at: string | null;
  };
  let rows = (data ?? []) as unknown as RoRaw[];

  // done_today 額外用 metadata.completed_at 補（待結帳沒寫 closed_at 的情況）
  if (tab === "done_today") {
    const todayStart = startOfTaipeiTodayIso();
    rows = rows.filter((r) => {
      if (r.closed_at && r.closed_at >= todayStart) return true;
      const ca = (r.metadata as { completed_at?: string } | null)?.completed_at;
      return Boolean(ca && ca >= todayStart);
    });
  }

  if (rows.length === 0) return [];

  const roIds = rows.map((r) => r.id);
  const customerIds = Array.from(
    new Set(rows.map((r) => r.customer_id).filter((v): v is string => Boolean(v))),
  );
  const vehicleIds = Array.from(
    new Set(rows.map((r) => r.vehicle_id).filter((v): v is string => Boolean(v))),
  );
  const saIds = Array.from(
    new Set(rows.map((r) => r.sa_id).filter((v): v is string => Boolean(v))),
  );

  const [custRes, vehRes, saRes, linesRes, addonRes, sessRes] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, phone").eq("brand_id", brand).in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
    vehicleIds.length
      ? supabase
          .from("customer_vehicles")
          .select("id, license_plate, vehicle_models(display_name)")
          .in("id", vehicleIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            license_plate: string | null;
            vehicle_models: { display_name?: string } | { display_name?: string }[] | null;
          }[],
        }),
    saIds.length
      ? supabase.from("employees").select("id, name").in("id", saIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from("repair_order_lines")
      .select(
        "id, repair_order_id, line_no, kind, labor_name, labor_units, part_name, qty, unit_price, amount, done, done_at",
      )
      .in("repair_order_id", roIds)
      .order("line_no", { ascending: true }),
    supabase
      .from("repair_order_addons")
      .select(
        "id, ro_id, addon_no, name, addon_type, safety_level, tech_reason, estimated_fee, customer_decision, reserved_at, created_at",
      )
      .eq("brand_id", brand)
      .in("ro_id", roIds)
      .order("addon_no", { ascending: true }),
    supabase
      .from("labor_time_sessions")
      .select("id, repair_order_id, technician_id, started_at, ended_at, status, duration_seconds")
      .eq("brand_id", brand)
      .eq("technician_id", techId)
      .in("repair_order_id", roIds),
  ]);

  const custMap = new Map(
    ((custRes.data ?? []) as { id: string; name: string; phone: string | null }[]).map((c) => [c.id, c]),
  );
  const vehMap = new Map(
    ((vehRes.data ?? []) as Array<{
      id: string;
      license_plate: string | null;
      vehicle_models: { display_name?: string } | { display_name?: string }[] | null;
    }>).map((v) => {
      const m = Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models;
      return [v.id, { license_plate: v.license_plate, model_name: m?.display_name ?? null }] as const;
    }),
  );
  const saMap = new Map(
    ((saRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );

  type LineRaw = {
    id: string;
    repair_order_id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    labor_units: number | null;
    part_name: string | null;
    qty: number | null;
    unit_price: number;
    amount: number;
    done: boolean;
    done_at: string | null;
  };
  const linesByRo = new Map<string, WorkItemRow[]>();
  for (const l of (linesRes.data ?? []) as unknown as LineRaw[]) {
    const arr = linesByRo.get(l.repair_order_id) ?? [];
    arr.push({
      id: l.id,
      line_no: l.line_no,
      kind: l.kind,
      name: (l.kind === "labor" ? l.labor_name : l.part_name) ?? "—",
      labor_units: l.labor_units == null ? null : Number(l.labor_units),
      qty: l.qty == null ? null : Number(l.qty),
      unit_price: Number(l.unit_price),
      amount: Number(l.amount),
      done: l.done === true,
      done_at: l.done_at,
    });
    linesByRo.set(l.repair_order_id, arr);
  }

  type AddonRaw = {
    id: string;
    ro_id: string;
    addon_no: number;
    name: string;
    addon_type: string;
    safety_level: string;
    tech_reason: string | null;
    estimated_fee: number | string;
    customer_decision: string;
    reserved_at: string | null;
    created_at: string | null;
  };
  const addonsByRo = new Map<string, AddonRow[]>();
  for (const a of (addonRes.data ?? []) as unknown as AddonRaw[]) {
    const arr = addonsByRo.get(a.ro_id) ?? [];
    arr.push({
      id: a.id,
      addon_no: a.addon_no,
      name: a.name,
      addon_type: a.addon_type,
      safety_level: a.safety_level,
      tech_reason: a.tech_reason,
      estimated_fee: Number(a.estimated_fee),
      customer_decision: a.customer_decision,
      reserved_at: a.reserved_at,
      created_at: a.created_at,
    });
    addonsByRo.set(a.ro_id, arr);
  }

  type SessRaw = {
    id: string;
    repair_order_id: string;
    started_at: string;
    ended_at: string | null;
    status: string;
    duration_seconds: number | null;
  };
  const sessByRo = new Map<string, SessRaw[]>();
  for (const s of (sessRes.data ?? []) as unknown as SessRaw[]) {
    const arr = sessByRo.get(s.repair_order_id) ?? [];
    arr.push(s);
    sessByRo.set(s.repair_order_id, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    ro_code: r.ro_code,
    status: r.status,
    customer_name: r.customer_id ? custMap.get(r.customer_id)?.name ?? null : null,
    customer_phone: r.customer_id ? custMap.get(r.customer_id)?.phone ?? null : null,
    vehicle_license_plate: r.vehicle_id ? vehMap.get(r.vehicle_id)?.license_plate ?? null : null,
    vehicle_model_name: r.vehicle_id ? vehMap.get(r.vehicle_id)?.model_name ?? null : null,
    sa_name: r.sa_id ? saMap.get(r.sa_id) ?? null : null,
    issue_date: r.issue_date,
    opened_at: r.opened_at,
    estimated_labor_units: r.estimated_labor_units,
    accepted_at:
      typeof (r.metadata as { accepted_at?: string } | null)?.accepted_at === "string"
        ? ((r.metadata as { accepted_at?: string }).accepted_at as string)
        : null,
    workItems: linesByRo.get(r.id) ?? [],
    addons: addonsByRo.get(r.id) ?? [],
    timer: computeTimerState(sessByRo.get(r.id) ?? []),
  }));
}

/** 由某 RO 的 session 列表算出 timer 狀態（client 之後用 activeStartedAt tick 疊加） */
function computeTimerState(
  sessions: { started_at: string; ended_at: string | null; status: string; duration_seconds: number | null }[],
): TimerState {
  let accumulated = 0;
  let activeStartedAt: string | null = null;
  for (const s of sessions) {
    if (s.ended_at) {
      accumulated += Number(s.duration_seconds ?? 0);
    } else if (s.status === "active") {
      activeStartedAt = s.started_at;
      // 進行中 session 的即時秒數：now − started_at
      accumulated += Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
    }
  }
  return {
    isRunning: activeStartedAt != null,
    accumulatedSeconds: accumulated,
    activeSessionId: null, // 卡片不需要 sessionId；pause 用 roId 找 active session
    activeStartedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// 讀：KPI / 轉派候選
// ─────────────────────────────────────────────────────────────

export async function getMyWorkstationKpi(techId: string): Promise<TechWorkstationKpi> {
  if (!techId) {
    return { pendingCount: 0, inProgressCount: 0, doneToday: 0, todayWorkedMinutes: 0 };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const todayStart = startOfTaipeiTodayIso();

  const [pendingRes, inProgRes, doneRes, sessRes] = await Promise.all([
    supabase
      .from("repair_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("lead_technician_id", techId)
      .eq("status", RO_STATUS.ASSIGNED_PENDING),
    supabase
      .from("repair_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("lead_technician_id", techId)
      .eq("status", RO_STATUS.IN_REPAIR),
    supabase
      .from("repair_orders")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("lead_technician_id", techId)
      .in("status", [RO_STATUS.AWAITING_CHECKOUT, RO_STATUS.CLOSED])
      .gte("closed_at", todayStart),
    supabase
      .from("labor_time_sessions")
      .select("duration_seconds, started_at, ended_at, status")
      .eq("brand_id", brand)
      .eq("technician_id", techId)
      .gte("started_at", todayStart),
  ]);

  let workedSeconds = 0;
  for (const s of (sessRes.data ?? []) as {
    duration_seconds: number | null;
    started_at: string;
    ended_at: string | null;
    status: string;
  }[]) {
    if (s.ended_at) workedSeconds += Number(s.duration_seconds ?? 0);
    else if (s.status === "active")
      workedSeconds += Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
  }

  return {
    pendingCount: pendingRes.count ?? 0,
    inProgressCount: inProgRes.count ?? 0,
    doneToday: doneRes.count ?? 0,
    todayWorkedMinutes: Math.round(workedSeconds / 60),
  };
}

/** 轉派候選：同 brand 其他啟用技師（排除自己） */
export async function listOtherTechnicians(excludeTechId: string): Promise<OtherTechnicianOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("aftersales_technicians")
    .select("id, code, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .neq("id", excludeTechId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OtherTechnicianOption[];
}

// ─────────────────────────────────────────────────────────────
// 寫：被 server action 包一層（權限檢查在 action 層）
// 這些函式內部用 active scope brand 鎖定 + 驗 RO/line 屬於同 brand。
// ─────────────────────────────────────────────────────────────

type WriteResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** 取得當前 auth user id（寫 done_by / accepted_by 用） */
async function currentUserId(): Promise<string | null> {
  const { userId } = await getCurrentUserAndAdmin();
  return userId;
}

/**
 * 接單：進行中 → 維修中 + metadata.accepted_at / accepted_by。
 * delta（C4a）：派工只設 technician(status 維持進行中=已派未接)、技師主動接單才切維修中。
 * 守門：只有 status='進行中' 才能接；其他狀態回友善錯誤。
 */
export async function acceptOrder(roId: string): Promise<WriteResult<{ id: string; status: string }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, status, metadata")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr) return { ok: false, error: `工單載入失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };
  if (ro.status !== RO_STATUS.ASSIGNED_PENDING) {
    return { ok: false, error: `工單目前為「${ro.status}」，無法接單（只能接「進行中」的單）` };
  }

  const meta = ((ro.metadata ?? {}) as Record<string, unknown>) || {};
  meta.accepted_at = new Date().toISOString();
  meta.accepted_by = (await currentUserId()) ?? null;

  const { error } = await supabase
    .from("repair_orders")
    .update({ status: RO_STATUS.IN_REPAIR, metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", roId)
    .eq("brand_id", brand)
    .eq("status", RO_STATUS.ASSIGNED_PENDING); // 樂觀鎖：避免並發
  if (error) return { ok: false, error: `接單失敗：${error.message}` };
  return { ok: true, data: { id: roId, status: RO_STATUS.IN_REPAIR } };
}

/** 勾 / 取消工項完成（只對 labor line 有意義，但 helper 不強擋 kind） */
export async function toggleWorkItem(
  lineId: string,
  done: boolean,
): Promise<WriteResult<{ id: string; done: boolean }>> {
  if (!lineId) return { ok: false, error: "缺少工項 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗 line 屬於同 brand 的 RO（repair_order_lines 沒 brand_id → 透過 RO join 驗）
  const { data: line, error: lineErr } = await supabase
    .from("repair_order_lines")
    .select("id, repair_order_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lineErr) return { ok: false, error: `工項載入失敗：${lineErr.message}` };
  if (!line) return { ok: false, error: "找不到工項" };

  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("id", line.repair_order_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!ro) return { ok: false, error: "工項所屬工單不在當前品牌範圍" };

  const { error } = await supabase
    .from("repair_order_lines")
    .update({
      done,
      done_at: done ? new Date().toISOString() : null,
      done_by: done ? await resolveTechnicianIdForCurrentUser(brand) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId);
  if (error) return { ok: false, error: `更新工項失敗：${error.message}` };
  return { ok: true, data: { id: lineId, done } };
}

/** 內部：當前 user → technician id（done_by FK aftersales_technicians），無則 null */
async function resolveTechnicianIdForCurrentUser(brand: string): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("aftersales_technicians")
    .select("id")
    .eq("user_id", userId)
    .eq("brand_id", brand)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/**
 * 標記完成：
 *   1) 停掉本單所有 active timer（status='ended'）
 *   2) repair_orders.status → 待結帳 + metadata.completed_at
 *   3) 回寫 aftersales_technicians 人效（actual_minutes / sold_minutes / jobs_done）
 * Q3b：軟性 —— 不強制所有 labor 工項已勾完（UI 端跳確認）。
 */
export async function markOrderComplete(roId: string): Promise<WriteResult<{ id: string }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, status, lead_technician_id, metadata")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr) return { ok: false, error: `工單載入失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };
  if (ro.status !== RO_STATUS.IN_REPAIR) {
    return { ok: false, error: `工單目前為「${ro.status}」，只能對「維修中」的單標記完成` };
  }
  const techId = ro.lead_technician_id as string | null;

  // 1) 停掉本單該技師所有 active timer
  const nowIso = new Date().toISOString();
  if (techId) {
    await supabase
      .from("labor_time_sessions")
      .update({ ended_at: nowIso, status: "ended" })
      .eq("brand_id", brand)
      .eq("repair_order_id", roId)
      .eq("technician_id", techId)
      .is("ended_at", null);
  }

  // 2) 切待結帳 + metadata.completed_at
  const meta = ((ro.metadata ?? {}) as Record<string, unknown>) || {};
  meta.completed_at = nowIso;
  const { error: updErr } = await supabase
    .from("repair_orders")
    .update({ status: RO_STATUS.AWAITING_CHECKOUT, metadata: meta, updated_at: nowIso })
    .eq("id", roId)
    .eq("brand_id", brand)
    .eq("status", RO_STATUS.IN_REPAIR);
  if (updErr) return { ok: false, error: `標記完成失敗：${updErr.message}` };

  // 3) 回寫人效（best-effort，失敗不致命）
  if (techId) {
    await writebackTechnicianPerformance(brand, roId, techId);
  }

  return { ok: true, data: { id: roId } };
}

/** 完成回寫人效（§1.8）：actual_minutes += 本單工時、sold_minutes += Σ(LU×標準分鐘)、jobs_done += 1 */
const MINUTES_PER_LU = 60; // demo 常數：1 LU = 60 分鐘標準工時
async function writebackTechnicianPerformance(
  brand: string,
  roId: string,
  techId: string,
): Promise<void> {
  const supabase = await createClient();

  // 本單該技師實際工時（已結束 session 加總）
  const { data: sess } = await supabase
    .from("labor_time_sessions")
    .select("duration_seconds")
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .eq("technician_id", techId)
    .not("ended_at", "is", null);
  const actualSeconds = (sess ?? []).reduce(
    (s, r) => s + Number((r as { duration_seconds: number | null }).duration_seconds ?? 0),
    0,
  );
  const actualMinutes = Math.round(actualSeconds / 60);

  // 賣出工時：本單 labor line 的 labor_units 加總 × MINUTES_PER_LU
  const { data: lines } = await supabase
    .from("repair_order_lines")
    .select("labor_units, kind")
    .eq("repair_order_id", roId)
    .eq("kind", "labor");
  const totalLu = (lines ?? []).reduce(
    (s, r) => s + Number((r as { labor_units: number | null }).labor_units ?? 0),
    0,
  );
  const soldMinutes = Math.round(totalLu * MINUTES_PER_LU);

  // 取現值 + 累加（POC：讀-改-寫，非原子；單人作業可接受）
  const { data: tech } = await supabase
    .from("aftersales_technicians")
    .select("actual_minutes, sold_minutes, jobs_done")
    .eq("id", techId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!tech) return;

  await supabase
    .from("aftersales_technicians")
    .update({
      actual_minutes: Number(tech.actual_minutes ?? 0) + actualMinutes,
      sold_minutes: Number(tech.sold_minutes ?? 0) + soldMinutes,
      jobs_done: Number(tech.jobs_done ?? 0) + 1,
      current_ro_code: null,
      status: "idle",
      started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", techId)
    .eq("brand_id", brand);
}

export type AddonInput = {
  name: string;
  addon_type: "labor" | "parts" | "labor_and_parts";
  safety_level: "normal" | "safety_related" | "safety_critical";
  tech_reason?: string | null;
  estimated_fee?: number;
  /** 接 B3 預留用（追加為零件時帶；不帶就不預留） */
  reserve_item?: { item_id: string; warehouse_id: string; qty: number } | null;
};

/**
 * 追加項目：INSERT repair_order_addons (customer_decision='pending', proposed_by=techId)。
 * addon_no 取同 RO 內 max+1。
 * 成功後若帶 reserve_item → 呼叫 B3 reserve()（source_type='repair_order_addon'，串 hook #4）。
 */
export async function addAddon(
  roId: string,
  payload: AddonInput,
): Promise<WriteResult<{ id: string; reserved: boolean }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  if (!payload.name?.trim()) return { ok: false, error: "追加項目名稱不可為空" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗 RO 屬於同 brand
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!ro) return { ok: false, error: "找不到工單" };

  const techId = await resolveTechnicianIdForCurrentUser(brand);

  // addon_no = 同 RO max + 1
  const { data: maxRow } = await supabase
    .from("repair_order_addons")
    .select("addon_no")
    .eq("brand_id", brand)
    .eq("ro_id", roId)
    .order("addon_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNo = Number((maxRow as { addon_no?: number } | null)?.addon_no ?? 0) + 1;

  const { data: row, error } = await supabase
    .from("repair_order_addons")
    .insert({
      brand_id: brand,
      ro_id: roId,
      addon_no: nextNo,
      name: payload.name.trim(),
      addon_type: payload.addon_type,
      safety_level: payload.safety_level,
      tech_reason: payload.tech_reason?.trim() || null,
      estimated_fee: payload.estimated_fee ?? 0,
      customer_decision: "pending",
      proposed_by: techId,
      proposed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `追加項目失敗：${error.message}` };

  // 串 B3 預留（hook #4）：追加為零件且帶了 item → 預留庫存。
  // 缺料判定（CROSS-02）：先算可用量 → 只預留「能滿足的量」、缺口標待料（不讓主流程失敗）。
  // reserve() 內部冪等防重 + 回寫 reserved_at；失敗不回滾 addon（addon 已成立、預留可重試）。
  let reserved = false;
  if (payload.reserve_item && payload.reserve_item.item_id && payload.reserve_item.qty > 0) {
    const { item_id, warehouse_id, qty: needed } = payload.reserve_item;

    // reserve 前算可用量（reserve 後本次需求會被算進 reserved、可用量會被自己扣掉，故先算）
    const availableBefore = await getAvailableQty(item_id, warehouse_id);
    const reserveQty = Math.max(0, Math.min(needed, availableBefore));

    if (reserveQty > 0) {
      const res = await reserve({
        item_id,
        warehouse_id,
        qty: reserveQty,
        source_type: "repair_order_addon",
        source_id: row.id,
        ro_id: roId,
        note: `追加項目 #${nextNo}：${payload.name.trim()}`,
      });
      reserved = res.ok;
    }

    // 缺料（可用量 < 需求）→ after() 標 RO 待料 + 建缺料告警。
    // markWaitingParts 內部算 needed − 剩餘 active 預留，shortage > 0 才標；副作用失敗不影響本次追加。
    if (needed > availableBefore) {
      after(async () => {
        try {
          await markWaitingParts({
            ro_id: roId,
            item_id,
            warehouse_id,
            needed,
            item_name: payload.name.trim(),
          });
        } catch (e) {
          console.error("[hook#4] 標待料失敗（不影響本次追加）", e);
        }
      });
    }
  }

  return { ok: true, data: { id: row.id, reserved } };
}

/**
 * 開始計時：INSERT labor_time_sessions (status='active', ended_at=null)。
 * 全域約束（C4a unique index）：同技師同時只能一個 active timer。
 * 守門：start 前先查該技師有無 active timer，有則回友善錯誤（不靠 DB 23505 報錯）。
 */
export async function startLaborTimer(
  roId: string,
  lineId?: string | null,
): Promise<WriteResult<{ id: string }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const techId = await resolveTechnicianIdForCurrentUser(brand);
  if (!techId) return { ok: false, error: "您的帳號未綁定技師，無法計時" };

  // 驗 RO 屬於同 brand
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id, ro_code")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!ro) return { ok: false, error: "找不到工單" };

  // 守門：該技師已有 active timer（全域唯一）
  const { data: active } = await supabase
    .from("labor_time_sessions")
    .select("id, repair_order_id")
    .eq("brand_id", brand)
    .eq("technician_id", techId)
    .is("ended_at", null)
    .maybeSingle();
  if (active) {
    return {
      ok: false,
      error:
        active.repair_order_id === roId
          ? "此工單已在計時中"
          : "您已有另一張工單正在計時，請先暫停後再開始",
    };
  }

  const { data: row, error } = await supabase
    .from("labor_time_sessions")
    .insert({
      brand_id: brand,
      repair_order_id: roId,
      repair_order_line_id: lineId ?? null,
      technician_id: techId,
      started_at: new Date().toISOString(),
      status: "active",
    })
    .select("id")
    .single();
  if (error) {
    // 並發撞 unique index → 友善訊息
    if (error.message.includes("one_active_timer") || error.message.includes("duplicate")) {
      return { ok: false, error: "您已有另一張工單正在計時，請先暫停後再開始" };
    }
    return { ok: false, error: `開始計時失敗：${error.message}` };
  }

  // 順手把技師狀態標 busy + current_ro_code（看板顯示用，best-effort）
  await supabase
    .from("aftersales_technicians")
    .update({ status: "busy", current_ro_code: ro.ro_code, started_at: new Date().toISOString() })
    .eq("id", techId)
    .eq("brand_id", brand);

  return { ok: true, data: { id: row.id } };
}

/**
 * 暫停計時：UPDATE 該技師在此 RO 的 active session → ended_at=now, status='paused'。
 * 續跑 = 再 startLaborTimer 開新 row。
 */
export async function pauseLaborTimer(roId: string): Promise<WriteResult<{ id: string }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const techId = await resolveTechnicianIdForCurrentUser(brand);
  if (!techId) return { ok: false, error: "您的帳號未綁定技師，無法操作計時" };

  const { data: row, error } = await supabase
    .from("labor_time_sessions")
    .update({ ended_at: new Date().toISOString(), status: "paused" })
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .eq("technician_id", techId)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: `暫停計時失敗：${error.message}` };
  if (!row) return { ok: false, error: "此工單目前沒有進行中的計時" };

  // 技師狀態回 idle（best-effort）
  await supabase
    .from("aftersales_technicians")
    .update({ status: "idle", current_ro_code: null })
    .eq("id", techId)
    .eq("brand_id", brand);

  return { ok: true, data: { id: row.id } };
}

/** 取得某 RO 當前 timer 狀態（單卡刷新用） */
export async function getTimerState(roId: string): Promise<TimerState> {
  if (!roId) return { isRunning: false, accumulatedSeconds: 0, activeSessionId: null, activeStartedAt: null };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const techId = await resolveTechnicianIdForCurrentUser(brand);
  if (!techId) return { isRunning: false, accumulatedSeconds: 0, activeSessionId: null, activeStartedAt: null };

  const { data } = await supabase
    .from("labor_time_sessions")
    .select("id, started_at, ended_at, status, duration_seconds")
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .eq("technician_id", techId);
  return computeTimerState((data ?? []) as { started_at: string; ended_at: string | null; status: string; duration_seconds: number | null }[]);
}

/**
 * 轉派：改 lead_technician_id 到另一技師 + append metadata.dispatch_history[]。
 * 內部不 reuse setLeadTechnicianAction（那支會「進行中→維修中」順手切，違反 C4a 接單語意）；
 * 這裡只改 technician + 記歷史，status 不動。
 */
export async function reassignOrder(
  roId: string,
  toTechId: string,
): Promise<WriteResult<{ id: string; technician_id: string }>> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  if (!toTechId) return { ok: false, error: "請選擇轉派對象" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗目標技師同 brand + active
  const { data: toTech } = await supabase
    .from("aftersales_technicians")
    .select("id, brand_id, is_active")
    .eq("id", toTechId)
    .maybeSingle();
  if (!toTech) return { ok: false, error: "找不到轉派對象" };
  if (toTech.brand_id !== brand) return { ok: false, error: "轉派對象不屬於當前品牌" };
  if (!toTech.is_active) return { ok: false, error: "轉派對象非啟用中" };

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, lead_technician_id, metadata, status")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr) return { ok: false, error: `工單載入失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };
  const fromTech = ro.lead_technician_id as string | null;
  if (fromTech === toTechId) return { ok: false, error: "轉派對象與目前技師相同" };

  const meta = ((ro.metadata ?? {}) as Record<string, unknown>) || {};
  const history = Array.isArray((meta as { dispatch_history?: unknown[] }).dispatch_history)
    ? ((meta as { dispatch_history: unknown[] }).dispatch_history as unknown[])
    : [];
  history.push({
    from: fromTech,
    to: toTechId,
    at: new Date().toISOString(),
    by: (await currentUserId()) ?? null,
  });
  meta.dispatch_history = history;

  const { error } = await supabase
    .from("repair_orders")
    .update({ lead_technician_id: toTechId, metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", roId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `轉派失敗：${error.message}` };
  return { ok: true, data: { id: roId, technician_id: toTechId } };
}
