"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { SubscriptionRowActions } from "./_row-actions";

export type SubscriptionRow = {
  id: string;
  event_code: string;
  template_code: string | null;
  filter_rules: Record<string, unknown>;
  is_active: boolean;
  target_display_name: string;
  target_channel_code: string;
};

export function SubscriptionsGrid({ rows }: { rows: SubscriptionRow[] }) {
  const columns: DataGridColumn<SubscriptionRow>[] = [
    {
      id: "event_code",
      header: "事件",
      width: 220,
      hideable: false,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.event_code}</span>,
      exportValue: (r) => r.event_code,
    },
    {
      id: "target",
      header: "目標",
      width: 200,
      cell: (r) => r.target_display_name || "—",
      exportValue: (r) => r.target_display_name || "",
      sortValue: (r) => r.target_display_name,
    },
    {
      id: "channel",
      header: "通路",
      width: 120,
      cell: (r) => r.target_channel_code || "—",
      exportValue: (r) => r.target_channel_code || "",
    },
    {
      id: "template",
      header: "模板",
      width: 200,
      cell: (r) =>
        r.template_code ? (
          <span className="font-mono text-[11.5px]">{r.template_code}</span>
        ) : (
          <span className="italic text-[#9A9890]">預設</span>
        ),
      exportValue: (r) => r.template_code ?? "預設",
    },
    {
      id: "filter_rules",
      header: "過濾規則",
      cell: (r) => (
        <span className="font-mono text-[11px] text-[#5A5955]">
          {Object.keys(r.filter_rules).length === 0 ? "—" : JSON.stringify(r.filter_rules)}
        </span>
      ),
      exportValue: (r) =>
        Object.keys(r.filter_rules).length === 0 ? "" : JSON.stringify(r.filter_rules),
      sortable: false,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 90,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="admin/notifications/subscriptions"
      exportFileName="notifications-subscriptions"
      emptyMessage="尚無訂閱。在上方新增一條。"
      rowActionsWidth={160}
      rowActions={(r) => (
        <div className="flex gap-1.5 justify-end">
          <SubscriptionRowActions id={r.id} isActive={r.is_active} action="toggle" />
          <SubscriptionRowActions id={r.id} isActive={r.is_active} action="delete" />
        </div>
      )}
    />
  );
}
