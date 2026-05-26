"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Row = {
  entityType: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  table: string;
  searchFields: string[];
  sortColumn: string;
  entryHref: string;
};

export function SearchRegistryBoard({ rows }: { rows: Row[] }) {
  const totalFields = rows.reduce((acc, r) => acc + r.searchFields.length, 0);

  const columns: DataGridColumn<Row>[] = [
    {
      id: "entity",
      header: "Entity",
      width: 200,
      hideable: false,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: r.color }}
          >
            {r.icon}
          </span>
          <span className="font-semibold text-[#2C2C2A]">{r.label}</span>
        </span>
      ),
      exportValue: (r) => r.label,
      sortValue: (r) => r.label,
    },
    {
      id: "entityType",
      header: "entity_type",
      width: 170,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.entityType}
        </span>
      ),
      exportValue: (r) => r.entityType,
      sortValue: (r) => r.entityType,
    },
    {
      id: "table",
      header: "DB Table",
      width: 170,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#1A3A5C]">
          {r.table}
        </span>
      ),
      exportValue: (r) => r.table,
      sortValue: (r) => r.table,
    },
    {
      id: "description",
      header: "搜得到什麼",
      width: 220,
      cell: (r) => <span className="text-[12px]">{r.description}</span>,
      exportValue: (r) => r.description,
      sortValue: (r) => r.description,
    },
    {
      id: "searchFields",
      header: "實際搜尋欄位 (ilike %q%)",
      width: 340,
      sortable: false,
      cell: (r) => (
        <span className="inline-flex items-center gap-1 flex-wrap">
          {r.searchFields.map((f) => (
            <span
              key={f}
              className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#F8F7F4] border border-[#EEECE6] font-mono text-[11px] text-[#5A5955]"
            >
              {f}
            </span>
          ))}
        </span>
      ),
      exportValue: (r) => r.searchFields.join(", "),
    },
    {
      id: "sortColumn",
      header: "排序欄",
      width: 110,
      cell: (r) => (
        <span className="font-mono text-[11px] text-[#9A9890]">
          {r.sortColumn}
        </span>
      ),
      exportValue: (r) => r.sortColumn,
      sortValue: (r) => r.sortColumn,
      defaultHidden: true,
    },
    {
      id: "entryHref",
      header: "入口頁面",
      width: 240,
      cell: (r) => (
        <Link
          href={r.entryHref}
          className="font-mono text-[11.5px] text-[#185FA5] hover:underline"
        >
          {r.entryHref}
        </Link>
      ),
      exportValue: (r) => r.entryHref,
      sortValue: (r) => r.entryHref,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          Global Search 搜尋欄位對照表
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          系統設定
        </span>
        <span className="text-[12px] text-[#9A9890]">
          ⌘K / 頂部搜尋列吃這份 registry — 看不到的欄位代表 Global Search 不會搜
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890] font-medium">
            涵蓋 Entity
          </span>
          <b className="text-[15px] text-[#2C2C2A]">{rows.length}</b>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890] font-medium">
            可搜尋欄位總數
          </span>
          <b className="text-[15px] text-[#2C2C2A]">{totalFields}</b>
        </div>
        <div className="ml-auto text-[11.5px] text-[#5A5955] max-w-[640px]">
          要加新 entity 或補欄位 → 改{" "}
          <code className="font-mono text-[11px] bg-[#F8F7F4] px-1.5 py-0.5 rounded border border-[#EEECE6]">
            src/lib/search/global-search-registry.ts
          </code>{" "}
          的 <code className="font-mono text-[11px]">SEARCH_REGISTRY</code>{" "}
          — 這頁 / API / ⌘K / 頂部搜尋列會一起吃到。
        </div>
      </section>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.entityType}
        persistKey="admin/global-search/registry"
        exportFileName="global-search-registry"
        emptyMessage="尚未設定任何搜尋來源"
      />
    </main>
  );
}
