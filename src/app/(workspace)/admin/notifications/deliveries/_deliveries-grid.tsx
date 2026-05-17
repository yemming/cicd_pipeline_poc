"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { ChannelCode, DeliveryStatus, EventCode } from "@/domain/notifications";
import { DeliveryStatusBadge } from "../_parts/delivery-status-badge";
import { RetryButton } from "./_retry-button";

export type DeliveryRow = {
  id: string;
  created_at: string;
  event_code: EventCode;
  channel_code: ChannelCode;
  target_ref: string;
  status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
};

const dateFmt = (d: string) =>
  new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) return `${ref.slice(0, 45)}…`;
  if (ref.length <= 18) return ref;
  return `${ref.slice(0, 12)}…${ref.slice(-4)}`;
}

export function DeliveriesGrid({ rows }: { rows: DeliveryRow[] }) {
  const columns: DataGridColumn<DeliveryRow>[] = [
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
      cell: (r) => <DeliveryStatusBadge status={r.status} />,
      exportValue: (r) => r.status,
    },
    {
      id: "attempts",
      header: "嘗試",
      width: 70,
      align: "right",
      cell: (r) => r.attempts,
      exportValue: (r) => r.attempts,
      sortValue: (r) => r.attempts,
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

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="admin/notifications/deliveries"
      exportFileName="notifications-deliveries"
      emptyMessage="沒有符合條件的記錄"
      rowActionsWidth={120}
      rowActions={(r) => (r.status !== "sent" ? <RetryButton deliveryId={r.id} /> : null)}
    />
  );
}
