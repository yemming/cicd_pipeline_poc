import type { ReactNode } from "react";
import { hasPermission } from "@/lib/rbac/policies";
import type { PermissionCode } from "@/lib/rbac/permissions";

/**
 * Server component — 在頁面/區塊外包一層，沒權限就 render fallback。
 *
 * 用法：
 *   <PermissionGate require={PERMISSIONS.PO_APPROVE}>
 *     <ApproveButton />
 *   </PermissionGate>
 */
export async function PermissionGate({
  require,
  fallback = null,
  children,
}: {
  require: PermissionCode;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const ok = await hasPermission(require);
  return ok ? <>{children}</> : <>{fallback}</>;
}
