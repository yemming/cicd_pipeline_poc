import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listBackupApprovers,
  listEmployeesForBrand,
  getDiscountAuthoritySettings,
} from "@/domain/discount-approvals";
import { BackupApproversView } from "./_components/backup-approvers-view";

/**
 * /sales/manager/discount-approvers — RS_M3 折扣門檻設定 + 代理審核人設定
 *
 * 撈：business_rules.discount_authority（折扣門檻）
 *   + discount_approval_backups（目前啟用的代理審核人設定）+ employees（供下拉選取）
 *
 * 折扣門檻設定僅開放給 canEdit（SALES_ORDER_APPROVE，即店長/主管）編輯；
 * 一般業務員只能看到頁面殼與代理審核人清單（不含門檻設定表單）。
 */
export default async function BackupApproversPage() {
  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">沒有檢視此頁面的權限</div>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_APPROVE);

  const [backups, employees, discountSettings] = await Promise.all([
    listBackupApprovers(),
    listEmployeesForBrand(),
    getDiscountAuthoritySettings(),
  ]);

  return (
    <BackupApproversView
      backups={backups}
      employees={employees}
      canEdit={canEdit}
      discountSettings={discountSettings}
    />
  );
}
