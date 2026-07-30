import { redirect } from "next/navigation";
import {
  getNotificationSubscriptionsBoardData,
  getNotificationTargetsBoardData,
} from "@/domain/notifications";
import { listRoleOptions, listEmployeesLineBindStatus } from "@/domain/line-binding";
import { SettingsNotificationsView } from "./_components/settings-notifications-view";

export default async function SettingsNotificationsPage() {
  let targetsData: Awaited<ReturnType<typeof getNotificationTargetsBoardData>>;
  let subsData: Awaited<ReturnType<typeof getNotificationSubscriptionsBoardData>>;
  let roleOptions: Awaited<ReturnType<typeof listRoleOptions>>;
  let employees: Awaited<ReturnType<typeof listEmployeesLineBindStatus>>;
  try {
    [targetsData, subsData, roleOptions, employees] = await Promise.all([
      getNotificationTargetsBoardData(),
      getNotificationSubscriptionsBoardData(),
      listRoleOptions(),
      listEmployeesLineBindStatus(),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // getNotificationTargetsBoardData / getNotificationSubscriptionsBoardData 走
    // domain/notifications.ts 的 ensureNotificationAdmin()，throw "UNAUTHENTICATED" /
    // "FORBIDDEN_..."；listEmployeesLineBindStatus 走 @/lib/notifications 的
    // requireNotificationAdmin()，throw 的中文字串不同（"未登入" / "無 Notification 管理權限"）—
    // 兩種 sentinel 都要接住，否則其中一支權限被擋時會直接噴 500 而不是導去登入頁 / 顯示無權限訊息。
    if (msg === "UNAUTHENTICATED" || msg === "未登入") redirect("/login");
    if (msg.startsWith("FORBIDDEN") || msg === "無 Notification 管理權限") {
      return (
        <div className="p-8 text-center text-[12.5px] text-[#5A5955]">
          無管理權限，請聯絡系統管理員開通「通知管理」權限。
        </div>
      );
    }
    throw err;
  }

  const { channels, targets, candidates } = targetsData;
  // subsData.targets 已經是「目前品牌的 target ∪ 訂閱有引用但跨品牌」的完整集合
  // （見 getNotificationSubscriptionsBoardData），事件分頁要用這份才能正確解析
  // 每個訂閱底下的收件人名稱，不然跨品牌借用的 target 會被誤判成「已刪除」。
  const { subscriptions, targets: eventTargets } = subsData;

  return (
    <SettingsNotificationsView
      channels={channels.map((c) => ({ id: c.id, code: c.code, displayName: c.display_name }))}
      targets={targets.map((t) => ({
        id: t.id,
        channel_code: t.channel_code,
        target_type: t.target_type,
        display_name: t.display_name,
        target_ref: t.target_ref,
        is_active: t.is_active,
      }))}
      eventTargets={eventTargets.map((t) => ({
        id: t.id,
        channel_code: t.channel_code,
        display_name: t.display_name,
        is_active: t.is_active,
      }))}
      candidates={candidates.map((c) => ({
        id: c.id,
        channel_code: c.channel_code,
        target_type: c.target_type,
        target_ref: c.target_ref,
        discovered_via: c.discovered_via,
        display_name: c.display_name,
        source_user_id: c.source_user_id,
        last_message_text: c.last_message_text,
        last_seen_at: c.last_seen_at,
        message_count: c.message_count,
      }))}
      subscriptions={subscriptions.map((s) => ({
        id: s.id,
        event_code: s.event_code,
        target_id: s.target_id,
        target_role: s.target_role,
        is_active: s.is_active,
      }))}
      roleOptions={roleOptions}
      employees={employees}
    />
  );
}
