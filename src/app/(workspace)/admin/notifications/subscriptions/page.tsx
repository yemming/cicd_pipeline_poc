import { redirect } from "next/navigation";
import { getNotificationSubscriptionsBoardData } from "@/domain/notifications";
import { NotificationsPageHeader } from "../_parts/page-header";
import { CreateSubscriptionForm } from "./_create-form";
import { SubscriptionsGrid, type SubscriptionRow } from "./_subscriptions-grid";

const EVENT_CODES = [
  "work_order.created",
  "work_order.status_changed",
  "service_request.created",
  "vehicle.pdi_completed",
  "customer.handover_scheduled",
  "feedback_ticket.created",
] as const;

export default async function SubscriptionsPage() {
  let data: Awaited<ReturnType<typeof getNotificationSubscriptionsBoardData>>;
  try {
    data = await getNotificationSubscriptionsBoardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) {
      return <div className="p-8 text-center text-[#5A5955]">無管理權限</div>;
    }
    throw err;
  }
  const { subscriptions: subs, targets, codeTemplates: templates } = data;

  const targetMap = new Map(targets.map((t) => [t.id, t]));

  const rows: SubscriptionRow[] = subs.map((s) => {
    const t = targetMap.get(s.target_id);
    return {
      id: s.id,
      event_code: s.event_code,
      template_code: s.template_code,
      filter_rules: s.filter_rules,
      is_active: s.is_active,
      target_display_name: t?.display_name ?? "—",
      target_channel_code: t?.channel_code ?? "—",
    };
  });

  return (
    <div className="min-h-screen bg-white">
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
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">新增訂閱</h3>
          <CreateSubscriptionForm
            eventCodes={[...EVENT_CODES]}
            targets={targets.map((t) => ({
              id: t.id,
              channelCode: t.channel_code,
              displayName: t.display_name,
              targetRef: t.target_ref,
            }))}
            templateCodes={templates.map((t) => ({
              code: t.code,
              eventCode: t.eventCode,
              channelCode: t.channelCode,
            }))}
          />
        </section>

        <section>
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">現有訂閱（{subs.length}）</h3>
          <SubscriptionsGrid rows={rows} />
        </section>
      </div>
    </div>
  );
}
