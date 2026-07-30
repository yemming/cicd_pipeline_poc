"use server";

/**
 * Domain Helper — 員工個人 LINE 綁定 + 角色驅動通知路由
 *
 * Russell 2026-07-28 第二版指令核心邏輯：
 *   事件發生 → 查這個事件要通知哪個職位（notification_subscriptions.target_role）
 *   → 找有這個職位的在職員工（employees.role_codes @> [role]）
 *   → 發給他的個人 LINE（employees.metadata.line_user_id）
 *
 * 職位代碼統一吃現有的 employee_role_types 主檔（不是另外造一份角色清單）——
 * 這個系統本來就有「店長/區經理」= 'manager'、「售後主管」= 'aftersales_lead' 等既有代碼，
 * 不是 Russell 指令文件裡假設的 'store_manager'（那個代碼在這個系統裡從來不存在）。
 *
 * 天條：UI 永遠走本 helper，不准直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requireNotificationAdmin } from "@/lib/notifications";

export type LineBindStatus = {
  employeeId: string | null;
  employeeName: string | null;
  bound: boolean;
  lineUserId: string | null;
  boundAt: string | null;
  notifyEnabled: boolean;
};

export type EmployeeBindRow = {
  id: string;
  name: string;
  roleCodes: string[];
  roleLabels: string[];
  bound: boolean;
  boundAt: string | null;
  notifyEnabled: boolean;
};

export type RoleOption = { code: string; label: string };

function randomBindCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易混淆的 I/O/0/1
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `BIND-${s}`;
}

/** 給下拉選單用的職位清單（吃 employee_role_types 主檔，不是寫死陣列） */
export async function listRoleOptions(): Promise<RoleOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_role_types")
    .select("code, name_zh")
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  if (error) throw new Error(`listRoleOptions 失敗：${error.message}`);
  return (data ?? []).map((r) => ({ code: r.code as string, label: r.name_zh as string }));
}

// ───────────────────────── 自助綁定（/me/profile） ─────────────────────────

async function getMyEmployeeRow(): Promise<{ id: string; brand_id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("employees")
    .select("id, brand_id")
    .eq("user_id", user.id)
    .eq("brand_id", brand)
    .maybeSingle();
  return (data as { id: string; brand_id: string } | null) ?? null;
}

export async function getMyLineBindStatus(): Promise<LineBindStatus> {
  const supabase = await createClient();
  const emp = await getMyEmployeeRow();
  if (!emp) {
    return {
      employeeId: null,
      employeeName: null,
      bound: false,
      lineUserId: null,
      boundAt: null,
      notifyEnabled: false,
    };
  }
  const { data } = await supabase
    .from("employees")
    .select("name, metadata")
    .eq("id", emp.id)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  return {
    employeeId: emp.id,
    employeeName: (data?.name as string) ?? null,
    bound: Boolean(meta.line_user_id),
    lineUserId: (meta.line_user_id as string) ?? null,
    boundAt: (meta.line_bound_at as string) ?? null,
    notifyEnabled: meta.line_notify_enabled !== false,
  };
}

/**
 * 產生一次性綁定碼（10 分鐘有效）。同員工重複點擊會讓舊碼失效、只留最新一組。
 *
 * 這裡改用 service client 寫入：授權已經由 getMyEmployeeRow() 做完（只會拿到
 * 「這個 employees row 的 user_id 等於目前登入者」那一筆），line_bind_codes
 * 開了 RLS 但刻意沒有任何 policy（只給 service role 用），一般登入使用者對這張
 * 表沒有任何權限，用一般 client 寫入必定被 RLS 擋下（"new row violates
 * row-level security policy"）。employees.metadata 的自助寫入同理。
 */
export async function generateMyLineBindCode(): Promise<
  { ok: true; code: string; expiresAt: string } | { ok: false; error: string }
> {
  const emp = await getMyEmployeeRow();
  if (!emp) return { ok: false, error: "此帳號未對應到任何員工資料，無法綁定 LINE 通知" };

  const supabase = createServiceClient();
  // 舊碼（未用完的）先作廢，避免混淆
  await supabase
    .from("line_bind_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("employee_id", emp.id)
    .is("used_at", null);

  const code = randomBindCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase.from("line_bind_codes").insert({
    code,
    employee_id: emp.id,
    brand_id: emp.brand_id,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: `產生綁定碼失敗：${error.message}` };
  return { ok: true, code, expiresAt };
}

export async function unbindMyLine(): Promise<{ ok: true } | { ok: false; error: string }> {
  const emp = await getMyEmployeeRow();
  if (!emp) return { ok: false, error: "此帳號未對應到任何員工資料" };
  const supabase = createServiceClient();
  const { data } = await supabase.from("employees").select("metadata").eq("id", emp.id).maybeSingle();
  const meta = { ...((data?.metadata ?? {}) as Record<string, unknown>) };
  delete meta.line_user_id;
  delete meta.line_bound_at;
  delete meta.line_notify_enabled;
  const { error } = await supabase.from("employees").update({ metadata: meta }).eq("id", emp.id);
  if (error) return { ok: false, error: `解除綁定失敗：${error.message}` };
  return { ok: true };
}

export async function setMyLineNotifyEnabled(
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const emp = await getMyEmployeeRow();
  if (!emp) return { ok: false, error: "此帳號未對應到任何員工資料" };
  const supabase = createServiceClient();
  const { data } = await supabase.from("employees").select("metadata").eq("id", emp.id).maybeSingle();
  const meta = { ...((data?.metadata ?? {}) as Record<string, unknown>), line_notify_enabled: enabled };
  const { error } = await supabase.from("employees").update({ metadata: meta }).eq("id", emp.id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  return { ok: true };
}

// ───────────────────────── Webhook 端：兌換綁定碼 ─────────────────────────

/**
 * LINE webhook 收到「BIND-XXXXXXXX」訊息時呼叫。用 service role（webhook 沒有
 * 使用者 session，signature 驗證已在呼叫端把關），驗證碼未過期、未使用過，
 * 成功後把 lineUserId 寫進該員工 metadata，回傳員工名稱供 webhook 回覆訊息用。
 */
export async function consumeLineBindCode(
  code: string,
  lineUserId: string,
): Promise<{ ok: true; employeeName: string } | { ok: false; reason: "not_found" | "expired" | "used" }> {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("line_bind_codes")
    .select("id, employee_id, expires_at, used_at")
    .eq("code", code.trim())
    .maybeSingle();

  if (!row) return { ok: false, reason: "not_found" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at as string).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, metadata")
    .eq("id", row.employee_id as string)
    .maybeSingle();
  if (!emp) return { ok: false, reason: "not_found" };

  const meta = {
    ...((emp.metadata ?? {}) as Record<string, unknown>),
    line_user_id: lineUserId,
    line_bound_at: new Date().toISOString(),
    line_notify_enabled: true,
  };

  await supabase.from("employees").update({ metadata: meta }).eq("id", emp.id as string);
  await supabase
    .from("line_bind_codes")
    .update({ used_at: new Date().toISOString(), used_by_line_user_id: lineUserId })
    .eq("id", row.id as string);

  return { ok: true, employeeName: (emp.name as string) ?? "員工" };
}

// ───────────────────────── 角色路由：dispatch 用 ─────────────────────────

export type RoleRoutedRecipient = { employeeId: string; name: string; lineUserId: string };

/**
 * 找「這個品牌下、有此職位代碼、在職、已綁 LINE、且沒關閉通知」的員工。
 * dispatch resolver 呼叫這支決定角色路由的實際收件人。用 service role
 * （dispatch 多半在背景 after() / cron 裡跑，沒有使用者 session）。
 */
export async function listActiveEmployeesByRole(
  brandId: string,
  roleCode: string,
): Promise<RoleRoutedRecipient[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, metadata")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .contains("role_codes", [roleCode]);
  if (error) throw new Error(`listActiveEmployeesByRole 失敗：${error.message}`);

  return ((data ?? []) as Array<{ id: string; name: string; metadata: Record<string, unknown> | null }>)
    .filter((e) => e.metadata?.line_user_id && e.metadata?.line_notify_enabled !== false)
    .map((e) => ({
      employeeId: e.id,
      name: e.name,
      lineUserId: e.metadata!.line_user_id as string,
    }));
}

/**
 * 找「這個品牌下、有此職位代碼、在職」的員工 user_id（不要求已綁 LINE）。
 * 給「角色路由找不到已綁定 LINE 的人」時，站內通知提醒管理員用——這條路走
 * user_notifications（站內通知），不是 LINE，所以不用篩 line_user_id。
 */
export async function listEmployeeUserIdsByRole(brandId: string, roleCode: string): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("user_id")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .contains("role_codes", [roleCode])
    .not("user_id", "is", null);
  if (error) throw new Error(`listEmployeeUserIdsByRole 失敗：${error.message}`);
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

// ───────────────────────── 管理端：Tab 二 綁定總覽 ─────────────────────────

export async function listEmployeesLineBindStatus(): Promise<EmployeeBindRow[]> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  const brand = (await getActiveScope()).brand_id;

  const [{ data: emps, error }, { data: roleTypes }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, role_codes, metadata")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("name"),
    supabase.from("employee_role_types").select("code, name_zh"),
  ]);
  if (error) throw new Error(`listEmployeesLineBindStatus 失敗：${error.message}`);

  const roleLabelMap = new Map((roleTypes ?? []).map((r) => [r.code as string, r.name_zh as string]));

  const rows: EmployeeBindRow[] = ((emps ?? []) as Array<{
    id: string;
    name: string;
    role_codes: string[] | null;
    metadata: Record<string, unknown> | null;
  }>).map((e) => {
    const codes = e.role_codes ?? [];
    const meta = e.metadata ?? {};
    return {
      id: e.id,
      name: e.name,
      roleCodes: codes,
      roleLabels: codes.map((c) => roleLabelMap.get(c) ?? c),
      bound: Boolean(meta.line_user_id),
      boundAt: (meta.line_bound_at as string) ?? null,
      notifyEnabled: meta.line_notify_enabled !== false,
    };
  });

  // 未綁定排前面，提醒管理員注意
  rows.sort((a, b) => {
    if (a.bound === b.bound) return a.name.localeCompare(b.name, "zh-TW");
    return a.bound ? 1 : -1;
  });
  return rows;
}
