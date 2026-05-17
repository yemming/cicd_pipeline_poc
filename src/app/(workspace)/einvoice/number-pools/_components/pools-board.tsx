"use client";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { NumberPoolRow } from "@/domain/einvoice";

export function PoolsBoard({ rows }: { rows: NumberPoolRow[] }) {
  const columns: DataGridColumn<NumberPoolRow>[] = [
    {
      id: "period",
      header: "期別",
      width: 90,
      hideable: false,
      cell: (r) => <span className="font-mono text-[#2C2C2A]">{r.period}</span>,
      exportValue: (r) => r.period,
      sortValue: (r) => r.period,
    },
    {
      id: "prefix",
      header: "字軌",
      width: 80,
      cell: (r) => <span className="font-mono text-[#2C2C2A]">{r.prefix}</span>,
      exportValue: (r) => r.prefix,
      sortValue: (r) => r.prefix,
    },
    {
      id: "start_no",
      header: "起號",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{r.start_no.toString().padStart(8, "0")}</span>
      ),
      exportValue: (r) => r.start_no.toString().padStart(8, "0"),
      sortValue: (r) => r.start_no,
    },
    {
      id: "end_no",
      header: "迄號",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{r.end_no.toString().padStart(8, "0")}</span>
      ),
      exportValue: (r) => r.end_no.toString().padStart(8, "0"),
      sortValue: (r) => r.end_no,
    },
    {
      id: "usage",
      header: "已用 / 總量",
      width: 180,
      align: "right",
      cell: (r) => {
        const total = r.end_no - r.start_no + 1;
        const pct = total > 0 ? Math.round((r.used_count / total) * 100) : 0;
        return (
          <span className="font-mono">
            <span
              className={
                pct > 90
                  ? "text-[#CC0000]"
                  : pct > 70
                    ? "text-[#854F0B]"
                    : "text-[#5A5955]"
              }
            >
              {r.used_count.toLocaleString()} / {total.toLocaleString()}
            </span>
            <span className="ml-1 text-[11px] text-[#9A9890]">({pct}%)</span>
          </span>
        );
      },
      exportValue: (r) => {
        const total = r.end_no - r.start_no + 1;
        return `${r.used_count} / ${total}`;
      },
      sortValue: (r) => {
        const total = r.end_no - r.start_no + 1;
        return total > 0 ? r.used_count / total : 0;
      },
    },
    {
      id: "is_active",
      header: "啟用",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "啟用中" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "啟用中" : "停用"),
      sortValue: (r) => r.is_active,
    },
    {
      id: "synced_at",
      header: "同步時間",
      width: 150,
      cell: (r) => (
        <span className="text-[#9A9890] text-[11.5px]">
          {r.synced_at
            ? new Date(r.synced_at).toLocaleString("zh-TW", { hour12: false })
            : "—"}
        </span>
      ),
      exportValue: (r) => r.synced_at ?? "",
      sortValue: (r) => r.synced_at ?? "",
    },
  ];

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      persistKey="einvoice/number-pools"
      exportFileName="einvoice-number-pools"
      emptyMessage="尚未同步字軌配號。請先在綠界商家後台確認配號或聯繫綠界客服。"
    />
  );
}
