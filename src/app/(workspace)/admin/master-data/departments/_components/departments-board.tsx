"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteDepartmentAction } from "@/lib/master-data/department-actions";
import type { Department } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

type EmployeeLite = { id: string; name: string; emp_code: string | null };

export function DepartmentsBoard({
  rows,
  canEdit,
  employees,
}: {
  rows: Department[];
  canEdit: boolean;
  employees: EmployeeLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const deptById = new Map(rows.map((d) => [d.id, d]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const removeRow = (d: Department) => {
    if (!confirm(`確定刪除部門「${d.code} ${d.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteDepartmentAction(d.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<Department>[] = [
    {
      id: "code",
      header: "代碼",
      width: 120,
      hideable: false,
      cell: (d) => (
        <Link
          href={`/admin/master-data/departments/${d.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {d.code}
        </Link>
      ),
      exportValue: (d) => d.code,
      sortValue: (d) => d.code,
    },
    {
      id: "name",
      header: "部門名稱",
      cell: (d) => <span className="font-medium">{d.name}</span>,
      exportValue: (d) => d.name,
      sortValue: (d) => d.name,
    },
    {
      id: "parent",
      header: "上層部門",
      width: 160,
      cell: (d) =>
        d.parent_id ? (
          deptById.get(d.parent_id)?.name ?? "—"
        ) : (
          <span className="text-[#6B778C]">頂層</span>
        ),
      exportValue: (d) =>
        d.parent_id ? deptById.get(d.parent_id)?.name ?? "" : "頂層",
      sortValue: (d) =>
        d.parent_id ? deptById.get(d.parent_id)?.name ?? "" : "",
    },
    {
      id: "manager",
      header: "主管",
      width: 180,
      cell: (d) =>
        d.manager_employee_id ? (
          <span>
            {empById.get(d.manager_employee_id)?.name ?? "(查無)"}
            <span className="ml-1 text-[#6B778C] text-[12px]">
              {empById.get(d.manager_employee_id)?.emp_code}
            </span>
          </span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (d) =>
        d.manager_employee_id ? empById.get(d.manager_employee_id)?.name ?? "" : "",
    },
    {
      id: "active",
      header: "狀態",
      width: 80,
      cell: (d) =>
        d.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            營運中
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (d) => (d.is_active ? "營運中" : "停用"),
      sortValue: (d) => d.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">部門組織</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          員工主檔 dept_id 吃此處
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/departments/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增部門
          </button>
        )}
      </header>

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆部門
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(d) => d.id}
        persistKey="admin/master-data/departments"
        exportFileName="departments"
        emptyMessage="尚無部門資料 — 點右上角「新增部門」開始建立"
        disabled={isPending}
        rowActions={(d) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/departments/${d.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(d)}
              disabled={isPending || !canEdit}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
