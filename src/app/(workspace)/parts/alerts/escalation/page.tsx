import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAlertEscalationPageData, type AlertEscalationConfig } from "@/domain/rules";

export const dynamic = "force-dynamic";

const RECIPIENT_LABEL: Record<string, string> = {
  sa: "SA 服務顧問",
  manager: "店長",
  purchaser: "採購主管",
  owner: "老闆",
  warehouse: "倉管",
};

export default async function AlertEscalationPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視告警階層的權限</p>
      </main>
    );
  }

  const { rules } = await getAlertEscalationPageData();

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">告警階層設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.5
        </span>
        <span className="text-[12px] text-[#9A9890]">告警未處理時自動升級的階層 / 通知對象</span>
      </header>

      <div className="space-y-2.5">
        {rules.length === 0 ? (
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890]">
            尚無告警階層設定
          </div>
        ) : (
          rules.map((rule, idx) => {
            const cfg = (rule.config ?? {}) as Partial<AlertEscalationConfig>;
            return (
              <section
                key={rule.id}
                className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-start gap-4 flex-wrap"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#1A3A5C] text-white flex items-center justify-center text-[18px] font-bold">
                  L{cfg.level ?? idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#2C2C2A]">{cfg.label ?? "—"}</div>
                  <div className="text-[12px] text-[#5A5955] mt-0.5">
                    觸發時機：建立後{" "}
                    <b className="font-mono">
                      {cfg.timeout_min === 0 ? "即時" : `${cfg.timeout_min} 分鐘`}
                    </b>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-[#9A9890]">通知對象：</span>
                    {(cfg.recipients ?? []).map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]"
                      >
                        {RECIPIENT_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-[#9A9890]">通知通道：</span>
                    {(cfg.channels ?? []).map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#E8F5F0] text-[#0F6E56]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
