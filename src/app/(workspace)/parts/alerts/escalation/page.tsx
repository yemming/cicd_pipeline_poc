import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAlertTypes,
  listEscalations,
  simulateEscalation,
} from "@/domain/parts-alerts-escalation";

import { AlertEscalationBoard } from "./_components/alert-escalation-board";

export const dynamic = "force-dynamic";

export default async function AlertEscalationPage({
  searchParams,
}: {
  searchParams?: Promise<{ alert_type?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視告警階層的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  const sp = (await searchParams) ?? {};

  const alertTypes = await listAlertTypes();
  const activeType = sp.alert_type && alertTypes.some((t) => t.alert_type === sp.alert_type)
    ? sp.alert_type
    : alertTypes[0]?.alert_type;

  const [rows, simulation] = activeType
    ? await Promise.all([
        listEscalations({ alert_type: activeType }),
        simulateEscalation(activeType),
      ])
    : [[], { alert_label: "", trigger_desc: null, steps: [] }];

  return (
    <AlertEscalationBoard
      canEdit={canEdit}
      alertTypes={alertTypes}
      activeType={activeType ?? ""}
      rows={rows}
      simulation={simulation}
    />
  );
}
