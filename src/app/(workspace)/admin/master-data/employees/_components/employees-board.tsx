"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteEmployeeAction } from "@/lib/master-data/employee-actions";
import type { Employee } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, string> = {
  active: "在職",
  on_leave: "留停",
  terminated: "離職",
  retired: "退休",
};

type DeptLite = { id: string; name: string };

export function EmployeesBoard({
  rows,
  canEdit,
  departments,
}: {
  rows: Employee[];
  canEdit: boolean;
  departments: DeptLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const deptById = new Map(departments.map((d) => [d.id, d]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const removeRow = (e: Employee) => {
    if (!confirm(`確定刪除員工「${e.emp_code} ${e.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteEmployeeAction(e.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<Employee>[] = [
    {
      id: "emp_code",
      header: "代碼",
      width: 140,
      hideable: false,
      cell: (e) => (
        <Link
          href={`/admin/master-data/employees/${e.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {e.emp_code}
        </Link>
      ),
      exportValue: (e) => e.emp_code ?? "",
      sortValue: (e) => e.emp_code ?? "",
    },
    {
      id: "name",
      header: "姓名",
      width: 140,
      cell: (e) => e.name,
      exportValue: (e) => e.name,
      sortValue: (e) => e.name,
    },
    {
      id: "dept",
      header: "部門",
      width: 130,
      cell: (e) => (e.dept_id ? deptById.get(e.dept_id)?.name ?? "—" : "—"),
      exportValue: (e) => (e.dept_id ? deptById.get(e.dept_id)?.name ?? "" : ""),
      sortValue: (e) => (e.dept_id ? deptById.get(e.dept_id)?.name ?? "" : ""),
    },
    {
      id: "position",
      header: "職稱",
      width: 140,
      cell: (e) => e.position ?? "—",
      exportValue: (e) => e.position ?? "",
      sortValue: (e) => e.position ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 140,
      cell: (e) => e.phone ?? "—",
      exportValue: (e) => e.phone ?? "",
      sortValue: (e) => e.phone ?? "",
    },
    {
      id: "email",
      header: "Email",
      cell: (e) => e.email ?? "—",
      exportValue: (e) => e.email ?? "",
      sortValue: (e) => e.email ?? "",
    },
    {
      id: "status",
      header: "在職",
      width: 80,
      cell: (e) => {
        const label = STATUS_LABEL[e.employment_status] ?? e.employment_status;
        const color =
          e.employment_status === "active"
            ? "bg-[#EAF3DE] text-[#3B6D11]"
            : e.employment_status === "on_leave"
              ? "bg-[#FDF3E3] text-[#854F0B]"
              : "bg-[#FDECEA] text-[#CC0000]";
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${color}`}
          >
            {label}
          </span>
        );
      },
      exportValue: (e) => STATUS_LABEL[e.employment_status] ?? e.employment_status,
      sortValue: (e) => e.employment_status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">員工主檔</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          全站 advisor / technician / sales 都吃此處 employee_id
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/employees/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增員工
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
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆員工 ・ 部門 <b className="text-[#2C2C2A]">{departments.length}</b> 個
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(e) => e.id}
        persistKey="admin/master-data/employees"
        exportFileName="employees"
        emptyMessage="尚未建立任何員工 — 點右上角「新增員工」開始"
        disabled={isPending}
        rowActions={(e) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/employees/${e.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(e)}
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
