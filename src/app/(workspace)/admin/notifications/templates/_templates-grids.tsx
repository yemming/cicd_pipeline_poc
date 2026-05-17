"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

export type CodeTemplateRow = {
  code: string;
  eventCode: string;
  channelCode: string;
  format: string;
  description: string | null;
  hasOverride: boolean;
};

export type DbTemplateRow = {
  id: string;
  code: string;
  event_code: string;
  channel_code: string;
  format: string;
  is_active: boolean;
  updated_at: string;
};

const dateFmt = (d: string) =>
  new Date(d).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

export function CodeTemplatesGrid({ rows }: { rows: CodeTemplateRow[] }) {
  const columns: DataGridColumn<CodeTemplateRow>[] = [
    {
      id: "eventCode",
      header: "事件",
      width: 220,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.eventCode}</span>,
      exportValue: (r) => r.eventCode,
    },
    {
      id: "channelCode",
      header: "通路",
      width: 130,
      cell: (r) => r.channelCode,
      exportValue: (r) => r.channelCode,
    },
    {
      id: "format",
      header: "格式",
      width: 100,
      cell: (r) => (
        <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] bg-[#EAF4FB] text-[#185FA5]">
          {r.format}
        </span>
      ),
      exportValue: (r) => r.format,
    },
    {
      id: "code",
      header: "Code",
      width: 200,
      hideable: false,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.code}</span>,
      exportValue: (r) => r.code,
    },
    {
      id: "description",
      header: "描述",
      cell: (r) => <span className="text-[#5A5955]">{r.description ?? "—"}</span>,
      exportValue: (r) => r.description ?? "",
      sortable: false,
    },
    {
      id: "hasOverride",
      header: "DB 覆寫",
      width: 110,
      cell: (r) =>
        r.hasOverride ? (
          <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            已覆寫
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.hasOverride ? "已覆寫" : ""),
      sortValue: (r) => (r.hasOverride ? 1 : 0),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.code}
      persistKey="admin/notifications/templates-code"
      exportFileName="notifications-templates-code"
      emptyMessage="尚無程式碼模板"
    />
  );
}

export function DbTemplatesGrid({ rows }: { rows: DbTemplateRow[] }) {
  const columns: DataGridColumn<DbTemplateRow>[] = [
    {
      id: "code",
      header: "Code",
      width: 200,
      hideable: false,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.code}</span>,
      exportValue: (r) => r.code,
    },
    {
      id: "event_code",
      header: "事件",
      width: 220,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.event_code}</span>,
      exportValue: (r) => r.event_code,
    },
    {
      id: "channel_code",
      header: "通路",
      width: 130,
      cell: (r) => r.channel_code,
      exportValue: (r) => r.channel_code,
    },
    {
      id: "format",
      header: "格式",
      width: 100,
      cell: (r) => (
        <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] bg-[#EAF4FB] text-[#185FA5]">
          {r.format}
        </span>
      ),
      exportValue: (r) => r.format,
    },
    {
      id: "is_active",
      header: "啟用",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
            ✓
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : ""),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    {
      id: "updated_at",
      header: "更新時間",
      width: 180,
      cell: (r) => <span className="text-[#5A5955] whitespace-nowrap">{dateFmt(r.updated_at)}</span>,
      exportValue: (r) => dateFmt(r.updated_at),
      sortValue: (r) => r.updated_at,
    },
  ];

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="admin/notifications/templates-db"
      exportFileName="notifications-templates-db"
      emptyMessage="尚無 DB 覆寫模板"
    />
  );
}
