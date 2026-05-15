/**
 * Domain — Aftersales Permission Matrix constants（client + server 共用）
 *
 * 職級權限對照矩陣的「列」分組與顯示。
 * 不能放在 src/domain/aftersales-permissions.ts，因為該檔是 "use server"。
 */

/**
 * 售後職級 = 直接吃 RBAC roles 表，限制只渲染這幾個與售後相關的 role.id。
 * 這些 role 的存在與標籤由 `roles` 表本身保證；本常數只是「售後對照矩陣要顯示哪幾個」。
 */
export const AFTERSALES_ROLE_CODES = [
  "manager",         // 售後主管 / 店長（沒有獨立 aftersales_manager role，沿用 manager）
  "service_advisor", // 售後接待 SA
  "technician",      // 車間技師
  "warehouse",       // 零件主管 / 零件專員（warehouse 是泛備料，未拆兩級）
] as const;
export type AftersalesRoleCode = (typeof AFTERSALES_ROLE_CODES)[number];

/**
 * 矩陣的「功能列」分組 — 把 service.* permissions 收成業務語意 group。
 * 顯示 codes 順序就是表內列順序；group 順序就是 group 出現順序。
 *
 * 不在這裡的 service.* permission（例如本頁自己的 view/edit）不渲染進矩陣。
 */
export type AftersalesPermissionGroup = {
  key: string;
  title: string;
  codes: readonly string[];
};

export const AFTERSALES_PERMISSION_GROUPS: readonly AftersalesPermissionGroup[] = [
  {
    key: "appointment",
    title: "預約 / 預檢",
    codes: [
      "service.appointment.view",
      "service.appointment.edit",
      "service.pi.execute",
      "service.pdi.execute",
      "service.inspection.view",
      "service.inspection.edit",
    ],
  },
  {
    key: "ro",
    title: "正式工單（RO）",
    codes: [
      "service.ro.view",
      "service.ro.create",
      "service.ro.dispatch",
      "service.ro.close",
      "service.ro.approve",
    ],
  },
  {
    key: "warranty",
    title: "保固索賠",
    codes: ["service.warranty.view", "service.warranty.submit"],
  },
  {
    key: "settings",
    title: "管理設定（主管工作檯）",
    codes: [
      "service.aftersales_discount.view",
      "service.aftersales_discount.edit",
      "service.aftersales_permission.view",
      "service.aftersales_permission.edit",
    ],
  },
] as const;

/** 全部進矩陣的 permission codes（給 helper 撈 grant 矩陣用） */
export const AFTERSALES_MATRIX_CODES: readonly string[] =
  AFTERSALES_PERMISSION_GROUPS.flatMap((g) => g.codes);
