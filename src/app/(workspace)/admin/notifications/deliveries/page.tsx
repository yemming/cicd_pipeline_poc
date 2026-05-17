import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listNotificationDeliveriesForAdmin,
  type ChannelCode,
  type DeliveryStatus,
  type EventCode,
} from "@/domain/notifications";
import { NotificationsPageHeader } from "../_parts/page-header";
import { DeliveriesGrid, type DeliveryRow } from "./_deliveries-grid";

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

  const eventCode = (sp.event as EventCode | undefined) || undefined;
  const channelCode = (sp.channel as ChannelCode | undefined) || undefined;
  const status = (sp.status as DeliveryStatus | undefined) || undefined;
  const limit = Math.min(200, Number(sp.limit ?? 50));

  let rows: Awaited<ReturnType<typeof listNotificationDeliveriesForAdmin>>;
  try {
    rows = await listNotificationDeliveriesForAdmin({
      eventCode,
      channelCode,
      status,
      limit,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) {
      return <div className="p-8 text-center text-[#5A5955]">無管理權限</div>;
    }
    throw err;
  }

  const gridRows: DeliveryRow[] = rows.map((d) => ({
    id: d.id,
    created_at: d.created_at,
    event_code: d.event_code,
    channel_code: d.channel_code,
    target_ref: d.target_ref,
    status: d.status,
    attempts: d.attempts,
    last_error: d.last_error,
  }));

  return (
    <div className="min-h-screen bg-white">
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
        <form className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
              <select
                name="status"
                defaultValue={status ?? ""}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              >
                <option value="">全部</option>
                <option value="sent">已送達</option>
                <option value="failed">失敗</option>
                <option value="pending">排隊中</option>
                <option value="retrying">重試中</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">通路</label>
              <select
                name="channel"
                defaultValue={channelCode ?? ""}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              >
                <option value="">全部</option>
                <option value="line">LINE</option>
                <option value="google-chat">Google Chat</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">事件</label>
              <input
                name="event"
                defaultValue={eventCode ?? ""}
                placeholder="例：feedback_ticket.created"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono w-64 focus:border-[#185FA5] outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">筆數</label>
              <select
                name="limit"
                defaultValue={String(limit)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              >
                <option>20</option>
                <option>50</option>
                <option>100</option>
                <option>200</option>
              </select>
            </div>

            <div className="flex gap-2 ml-auto">
              <button
                type="submit"
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
              >
                查詢
              </button>
              <Link
                href="/admin/notifications/deliveries"
                className="h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                重置
              </Link>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆（上限 {limit}）
          </span>
        </div>

        <DeliveriesGrid rows={gridRows} />
      </div>
    </div>
  );
}
