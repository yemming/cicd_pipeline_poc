/**
 * 員工角色主檔常數 — 給「use server」domain helper 拆出來的常數檔，
 * 避免 Next 16 的「'use server' 檔不能 export 非 async 值」runtime error。
 */

export type EmployeeRoleType = {
  code: string;
  name_zh: string;
  name_en: string | null;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  suggested_rbac_role_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EmployeeRoleInput = {
  code: string;
  name_zh: string;
  name_en?: string | null;
  description?: string | null;
  color?: string;
  icon?: string | null;
  sort_order?: number;
  suggested_rbac_role_id?: string | null;
};

export type EmployeeRoleUpdateInput = Partial<
  Omit<EmployeeRoleInput, "code"> & { is_active: boolean }
>;

/** Domain Result pattern（跟 round-12 item-actions.ts 對齊）*/
export type RoleActionResult<T = { code: string }> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Chip 預設色 — 給新建角色時的預設值 */
export const ROLE_DEFAULT_COLOR = "#185FA5";

/** is_system=true 的角色不可被 deactivate（防誤刪核心 UI 流程依賴）*/
export const SYSTEM_ROLE_DELETE_MSG =
  "系統內建角色不可停用（可改顯示名 / 顏色 / 排序）";
