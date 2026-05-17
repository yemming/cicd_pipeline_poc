"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { TargetRowActions } from "./_row-actions";

export type TargetRow = {
  id: string;
  channel_code: string;
  target_type: string;
  display_name: string;
  target_ref: string;
  is_active: boolean;
};

function maskRef(ref: string): string {
  if (ref.startsWith("https://chat.googleapis.com/")) {
    return `${ref.slice(0, 45)}…（已遮罩）`;
  }
  return ref;
}

export function TargetsGrid({ rows }: { rows: TargetRow[] }) {
  const columns: DataGridColumn<TargetRow>[] = [
    {
      id: "channel_code",
      header: "通路",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.channel_code}</span>,
      exportValue: (r) => r.channel_code,
    },
    {
      id: "target_type",
      header: "類型",
      width: 110,
      cell: (r) => r.target_type,
      exportValue: (r) => r.target_type,
    },
    {
      id: "display_name",
      header: "名稱",
      width: 220,
      cell: (r) => r.display_name,
      exportValue: (r) => r.display_name,
    },
    {
      id: "target_ref",
      header: "Target ref",
      cell: (r) => (
        <span
          className="font-mono text-[11.5px] text-[#5A5955] inline-block max-w-[320px] truncate"
          title={r.target_ref}
        >
          {maskRef(r.target_ref)}
        </span>
      ),
      exportValue: (r) => r.target_ref,
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
      persistKey="admin/notifications/targets"
      exportFileName="notifications-targets"
      emptyMessage="尚無目標。"
      rowActionsWidth={160}
      rowActions={(r) => (
        <div className="flex gap-1.5 justify-end">
          <TargetRowActions id={r.id} isActive={r.is_active} action="toggle" />
          <TargetRowActions id={r.id} isActive={r.is_active} action="delete" />
        </div>
      )}
    />
  );
}
