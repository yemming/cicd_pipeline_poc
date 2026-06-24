import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listBackupApprovers, listEmployeesForBrand } from "@/domain/discount-approvals";
import { BackupApproversView } from "./_components/backup-approvers-view";

/**
 * /sales/manager/discount-approvers — RS_M3 代理審核人設定
 *
 * 撈：discount_approval_backups（目前啟用設定）+ employees（供下拉選取）
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

  const [backups, employees] = await Promise.all([
    listBackupApprovers(),
    listEmployeesForBrand(),
  ]);

  return (
    <BackupApproversView
      backups={backups}
      employees={employees}
      canEdit={canEdit}
    />
  );
}
