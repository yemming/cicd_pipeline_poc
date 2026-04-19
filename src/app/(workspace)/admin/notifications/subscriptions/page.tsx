import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { listAllSubscriptions } from "@/lib/notifications/repositories/subscription.repo";
import { listTargets } from "@/lib/notifications/repositories/target.repo";
import { listCodeTemplates } from "@/lib/notifications/templates";
import { NotificationsPageHeader } from "../_parts/page-header";
import { CreateSubscriptionForm } from "./_create-form";
import { SubscriptionRowActions } from "./_row-actions";

const EVENT_CODES = [
  "work_order.created",
  "work_order.status_changed",
  "service_request.created",
  "vehicle.pdi_completed",
  "customer.handover_scheduled",
  "feedback_ticket.created",
] as const;

export default async function SubscriptionsPage() {
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        無管理權限（登入為 {ctx.email ?? "unknown"}）
      </div>
    );
  }

  const supabase = createServiceClient();
  const [subs, targets] = await Promise.all([
    listAllSubscriptions(supabase),
    listTargets(supabase, { onlyActive: false }),
  ]);
  const templates = listCodeTemplates();

  // 建一個 target_id → target 的 map 方便列表顯示
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  return (
    <div className="min-h-screen bg-surface">
      <NotificationsPageHeader
        title="訂閱管理"
        subtitle="哪些事件要推到哪個 LINE 群組／Google Chat space"
        breadcrumb={[
          { label: "通知中心", href: "/admin/notifications" },
          { label: "訂閱管理" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
        <section>
          <h3 className="text-lg font-semibold mb-3">新增訂閱</h3>
          <CreateSubscriptionForm
            eventCodes={[...EVENT_CODES]}
            targets={targets.map((t) => ({
              id: t.id,
              channelCode: t.channel_code,
              displayName: t.display_name,
              targetRef: t.target_ref,
            }))}
            templateCodes={templates.map((t) => ({ code: t.code, eventCode: t.eventCode, channelCode: t.channelCode }))}
          />
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3">現有訂閱（{subs.length}）</h3>
          {subs.length === 0 ? (
            <div className="rounded-lg border border-outline-variant bg-surface-container p-6 text-center text-on-surface-variant">
              尚無訂閱。在上方新增一條。
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2 text-left">事件</th>
                    <th className="px-3 py-2 text-left">目標</th>
                    <th className="px-3 py-2 text-left">通路</th>
                    <th className="px-3 py-2 text-left">模板</th>
                    <th className="px-3 py-2 text-left">過濾規則</th>
                    <th className="px-3 py-2 text-left">啟用</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant bg-surface">
                  {subs.map((s) => {
                    const t = targetMap.get(s.target_id);
                    return (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-mono text-xs">{s.event_code}</td>
                        <td className="px-3 py-2">{t?.display_name ?? "—"}</td>
                        <td className="px-3 py-2">{t?.channel_code ?? "—"}</td>
                        <td className="px-3 py-2 text-on-surface-variant">
                          {s.template_code ?? <span className="italic">預設</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-on-surface-variant">
                          {Object.keys(s.filter_rules).length === 0
                            ? "—"
                            : JSON.stringify(s.filter_rules)}
                        </td>
                        <td className="px-3 py-2">
                          <SubscriptionRowActions
                            id={s.id}
                            isActive={s.is_active}
                            action="toggle"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <SubscriptionRowActions
                            id={s.id}
                            isActive={s.is_active}
                            action="delete"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
