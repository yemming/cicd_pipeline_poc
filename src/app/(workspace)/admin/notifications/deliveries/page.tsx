import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { listDeliveries } from "@/lib/notifications/repositories/delivery.repo";
import type { ChannelCode, DeliveryStatus, EventCode } from "@/lib/notifications";
import { NotificationsPageHeader } from "../_parts/page-header";
import { DeliveryStatusBadge } from "../_parts/delivery-status-badge";
import { RetryButton } from "./_retry-button";

interface SearchParams {
  event?: string;
  channel?: string;
  status?: string;
  limit?: string;
}

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        無管理權限（登入為 {ctx.email ?? "unknown"}）
      </div>
    );
  }

  const eventCode = (sp.event as EventCode | undefined) || undefined;
  const channelCode = (sp.channel as ChannelCode | undefined) || undefined;
  const status = (sp.status as DeliveryStatus | undefined) || undefined;
  const limit = Math.min(200, Number(sp.limit ?? 50));

  const supabase = createServiceClient();
  const rows = await listDeliveries(supabase, {
    eventCode,
    channelCode,
    status,
    limit,
  });

  return (
    <div className="min-h-screen bg-surface">
      <NotificationsPageHeader
        title="送達記錄"
        subtitle="每一筆推播的狀態與除錯資訊，可手動重送失敗項"
        breadcrumb={[
          { label: "通知中心", href: "/admin/notifications" },
          { label: "送達記錄" },
        ]}
      />

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
        {/* Filter bar */}
        <form className="flex flex-wrap gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">狀態</span>
            <select name="status" defaultValue={status ?? ""} className="form-input py-1">
              <option value="">全部</option>
              <option value="sent">已送達</option>
              <option value="failed">失敗</option>
              <option value="pending">排隊中</option>
              <option value="retrying">重試中</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">通路</span>
            <select name="channel" defaultValue={channelCode ?? ""} className="form-input py-1">
              <option value="">全部</option>
              <option value="line">LINE</option>
              <option value="google-chat">Google Chat</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">事件</span>
            <input
              name="event"
              defaultValue={eventCode ?? ""}
              placeholder="例：feedback_ticket.created"
              className="form-input py-1 font-mono text-xs w-64"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">筆數</span>
            <select name="limit" defaultValue={String(limit)} className="form-input py-1">
              <option>20</option>
              <option>50</option>
              <option>100</option>
              <option>200</option>
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#CC0000", color: "#FFFFFF" }}
          >
            套用
          </button>
          <Link
            href="/admin/notifications/deliveries"
            className="rounded-md px-3 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container"
          >
            清除
          </Link>
        </form>

        <div className="text-sm text-on-surface-variant">
          顯示 {rows.length} 筆（上限 {limit}）
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-outline-variant bg-surface-container p-8 text-center text-on-surface-variant">
            沒有符合條件的記錄
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-outline-variant">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 text-left">時間</th>
                  <th className="px-3 py-2 text-left">事件</th>
                  <th className="px-3 py-2 text-left">通路</th>
                  <th className="px-3 py-2 text-left">目標</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-3 py-2 text-left">嘗試</th>
                  <th className="px-3 py-2 text-left">錯誤</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant bg-surface">
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant">
                      {new Date(d.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{d.event_code}</td>
                    <td className="px-3 py-2">{d.channel_code}</td>
                    <td className="px-3 py-2 font-mono text-xs">{maskRef(d.target_ref)}</td>
                    <td className="px-3 py-2">
                      <DeliveryStatusBadge status={d.status} />
                    </td>
                    <td className="px-3 py-2 text-center">{d.attempts}</td>
                    <td
                      className="px-3 py-2 text-error max-w-xs truncate"
                      title={d.last_error ?? ""}
                    >
                      {d.last_error?.slice(0, 80) ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d.status !== "sent" && <RetryButton deliveryId={d.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) return `${ref.slice(0, 45)}…`;
  if (ref.length <= 18) return ref;
  return `${ref.slice(0, 12)}…${ref.slice(-4)}`;
}
