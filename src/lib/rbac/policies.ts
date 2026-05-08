import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { PERMISSIONS, type PermissionCode } from "./permissions";

/**
 * RBAC 中介層 — 在 roles/permissions/user_roles 三張表落地之前的 stub。
 *
 * 目前實作：
 *   1. App admin（app_admins 表）→ 自動擁有所有權限
 *   2. profile_brands.role 對應到 ROLE_PERMS 常數查表
 *
 * Wave 1 完成後：把 ROLE_PERMS 換成從 DB 讀 role_permissions table，介面不變。
 *
 * 用法：
 *   await requirePermission(PERMISSIONS.PO_CREATE);  // throw if 沒權限
 *   if (await hasPermission(PERMISSIONS.PO_APPROVE)) { ... }
 */

const ALL: PermissionCode[] = Object.values(PERMISSIONS);

// 角色 → 權限映射。Wave 1 之前的 hard-coded fallback。
// role 來自 profile_brands.role（單一 text 欄）。
const ROLE_PERMS: Record<string, PermissionCode[]> = {
  // 老闆 / 店長：全開
  owner: ALL,
  manager: ALL,

  // 採購主管
  purchaser: [
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.SUPPLIER_EDIT,
    PERMISSIONS.ITEM_VIEW,
    PERMISSIONS.PR_VIEW,
    PERMISSIONS.PR_CREATE,
    PERMISSIONS.PR_APPROVE,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.PO_CREATE,
    PERMISSIONS.PO_APPROVE,
    PERMISSIONS.PO_RETURN,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.ALERT_VIEW,
  ],

  // 倉管
  warehouse: [
    PERMISSIONS.ITEM_VIEW,
    PERMISSIONS.WAREHOUSE_VIEW,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.RECEIPT_CREATE,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.ISSUE_CREATE,
    PERMISSIONS.TRANSFER_VIEW,
    PERMISSIONS.TRANSFER_CREATE,
    PERMISSIONS.COUNT_VIEW,
    PERMISSIONS.COUNT_EXECUTE,
    PERMISSIONS.COUNT_ADJUST,
    PERMISSIONS.EXCEPTION_OPS,
    PERMISSIONS.CONSIGNMENT_OPS,
    PERMISSIONS.USEDPART_OPS,
    PERMISSIONS.ALERT_VIEW,
  ],

  // 服務顧問 SA
  service_advisor: [
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.CUSTOMER_EDIT,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.VEHICLE_EDIT,
    PERMISSIONS.APPOINTMENT_VIEW,
    PERMISSIONS.APPOINTMENT_EDIT,
    PERMISSIONS.PI_EXECUTE,
    PERMISSIONS.RO_VIEW,
    PERMISSIONS.RO_CREATE,
    PERMISSIONS.RO_DISPATCH,
    PERMISSIONS.RO_CLOSE,
    PERMISSIONS.WARRANTY_VIEW,
    PERMISSIONS.WARRANTY_SUBMIT,
  ],

  // 技師
  technician: [
    PERMISSIONS.RO_VIEW,
    PERMISSIONS.PI_EXECUTE,
    PERMISSIONS.PDI_EXECUTE,
    PERMISSIONS.ITEM_VIEW,
    PERMISSIONS.ISSUE_CREATE, // 領料
  ],

  // 預設只讀
  viewer: [
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.CUSTOMER_VIEW,
    PERMISSIONS.SUPPLIER_VIEW,
    PERMISSIONS.ITEM_VIEW,
    PERMISSIONS.ORG_VIEW,
    PERMISSIONS.WAREHOUSE_VIEW,
    PERMISSIONS.VEHICLE_VIEW,
    PERMISSIONS.RO_VIEW,
    PERMISSIONS.PR_VIEW,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.ISSUE_VIEW,
    PERMISSIONS.TRANSFER_VIEW,
    PERMISSIONS.COUNT_VIEW,
    PERMISSIONS.ALERT_VIEW,
    PERMISSIONS.WARRANTY_VIEW,
    PERMISSIONS.APPOINTMENT_VIEW,
  ],
};

export const getCurrentUserContext = cache(
  async (): Promise<{
    userId: string | null;
    email: string | null;
    isAdmin: boolean;
    roles: { brand_id: string; role: string }[];
  }> => {
    const base = await getCurrentUserAndAdmin();
    if (!base.userId) return { ...base, roles: [] };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profile_brands")
      .select("brand_id,role")
      .eq("user_id", base.userId);

    if (error) {
      console.error("[rbac] load profile_brands failed:", error.message);
      return { ...base, roles: [] };
    }
    return { ...base, roles: data ?? [] };
  },
);

/**
 * 計算使用者擁有的全部 permission code（聯集所有 brand 的 role）。
 * brand 隔離由 RLS 處理；這裡只算「有沒有權限這件事」。
 */
export const getUserPermissions = cache(async (): Promise<Set<PermissionCode>> => {
  const ctx = await getCurrentUserContext();
  if (ctx.isAdmin) return new Set(ALL);
  const out = new Set<PermissionCode>();
  for (const r of ctx.roles) {
    const grants = ROLE_PERMS[r.role] ?? [];
    for (const p of grants) out.add(p);
  }
  return out;
});

export async function hasPermission(code: PermissionCode): Promise<boolean> {
  const set = await getUserPermissions();
  return set.has(code);
}

export async function requirePermission(code: PermissionCode): Promise<void> {
  if (!(await hasPermission(code))) {
    throw new Error(`權限不足：需要 ${code}`);
  }
}
