"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { ChannelCode, DeliveryStatus, EventCode } from "@/domain/notifications";

type FailedRow = {
  id: string;
  created_at: string;
  event_code: EventCode;
  channel_code: ChannelCode;
  target_ref: string;
  last_error: string | null;
};

type RecentRow = {
  id: string;
  created_at: string;
  event_code: EventCode;
  channel_code: ChannelCode;
  target_ref: string;
  status: DeliveryStatus;
};

const dateFmt = (d: string) =>
  new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) return `${ref.slice(0, 45)}…`;
  if (ref.length <= 18) return ref;
  return `${ref.slice(0, 12)}…${ref.slice(-4)}`;
}

export function DashboardTables({
  recentFailed,
  recent,
  renderStatus,
}: {
  recentFailed: FailedRow[];
  recent: RecentRow[];
  renderStatus: (s: DeliveryStatus) => React.ReactNode;
}) {
  const failedColumns: DataGridColumn<FailedRow>[] = [
    {
      id: "created_at",
      header: "時間",
      width: 170,
      cell: (r) => <span className="text-[#5A5955] whitespace-nowrap">{dateFmt(r.created_at)}</span>,
      exportValue: (r) => dateFmt(r.created_at),
      sortValue: (r) => r.created_at,
    },
    {
      id: "event_code",
      header: "事件",
      width: 200,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.event_code}</span>,
      exportValue: (r) => r.event_code,
    },
    {
      id: "channel_code",
      header: "通路",
      width: 110,
      cell: (r) => r.channel_code,
      exportValue: (r) => r.channel_code,
    },
    {
      id: "target_ref",
      header: "目標",
      width: 200,
      cell: (r) => <span className="font-mono text-[11.5px]">{maskRef(r.target_ref)}</span>,
      exportValue: (r) => r.target_ref,
    },
    {
      id: "last_error",
      header: "錯誤",
      cell: (r) => (
        <span className="text-[#CC0000] truncate inline-block max-w-xs" title={r.last_error ?? ""}>
          {r.last_error?.slice(0, 80) ?? ""}
        </span>
      ),
      exportValue: (r) => r.last_error ?? "",
      sortable: false,
    },
  ];

  const recentColumns: DataGridColumn<RecentRow>[] = [
    {
      id: "created_at",
      header: "時間",
      width: 170,
      cell: (r) => <span className="text-[#5A5955] whitespace-nowrap">{dateFmt(r.created_at)}</span>,
      exportValue: (r) => dateFmt(r.created_at),
      sortValue: (r) => r.created_at,
    },
    {
      id: "event_code",
      header: "事件",
      width: 200,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.event_code}</span>,
      exportValue: (r) => r.event_code,
    },
    {
      id: "channel_code",
      header: "通路",
      width: 110,
      cell: (r) => r.channel_code,
      exportValue: (r) => r.channel_code,
    },
    {
      id: "target_ref",
      header: "目標",
      width: 200,
      cell: (r) => <span className="font-mono text-[11.5px]">{maskRef(r.target_ref)}</span>,
      exportValue: (r) => r.target_ref,
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => renderStatus(r.status),
      exportValue: (r) => r.status,
    },
  ];

  return (
    <>
      <section>
        <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">最近失敗</h3>
        <DataGrid
          columns={failedColumns}
          data={recentFailed}
          rowKey={(r) => r.id}
          persistKey="admin/notifications/dashboard-failed"
          exportFileName="notifications-recent-failed"
          emptyMessage="近期沒有失敗記錄"
        />
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-[#2C2C2A] mb-3">最近推送（全部狀態）</h3>
        <DataGrid
          columns={recentColumns}
          data={recent}
          rowKey={(r) => r.id}
          persistKey="admin/notifications/dashboard-recent"
          exportFileName="notifications-recent"
          emptyMessage="尚無記錄"
        />
      </section>
    </>
  );
}
