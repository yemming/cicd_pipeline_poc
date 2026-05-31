"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  updateEmployeeRoleAction,
  deactivateEmployeeRoleAction,
} from "@/lib/master-data/employee-role-actions";
import type { EmployeeRoleType } from "@/domain/employee-roles.constants";

type Banner = { ok: boolean; msg: string } | null;

export function EmployeeRolesBoard({
  rows,
  canEdit,
}: {
  rows: EmployeeRoleType[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showInactive, setShowInactive] = useState<boolean>(true);

  function flash(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function toggleActive(r: EmployeeRoleType) {
    if (!canEdit || isPending) return;
    if (r.is_active) {
      if (
        !confirm(
          `確定停用角色「${r.name_zh}」？\n停用後此角色不會出現在員工角色多選下拉。`,
        )
      )
        return;
    }
    startTransition(async () => {
      if (r.is_active) {
        const res = await deactivateEmployeeRoleAction(r.code);
        if (res.ok) {
          flash({ ok: true, msg: `✓ 已停用「${r.name_zh}」` });
          router.refresh();
        } else flash({ ok: false, msg: res.error });
      } else {
        const res = await updateEmployeeRoleAction(r.code, { is_active: true });
        if (res.ok) {
          flash({ ok: true, msg: `✓ 已啟用「${r.name_zh}」` });
          router.refresh();
        } else flash({ ok: false, msg: res.error });
      }
    });
  }

  const filteredRows = showInactive ? rows : rows.filter((r) => r.is_active);

  const columns: DataGridColumn<EmployeeRoleType>[] = [
    {
      id: "code",
      header: "代碼",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/admin/master-data/employee-roles/${r.code}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name_zh",
      header: "顯示名稱",
      cell: (r) => (
        <Link
          href={`/admin/master-data/employee-roles/${r.code}`}
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: r.color }}
          />
          <span className="font-medium text-[12.5px] text-[#185FA5]">{r.name_zh}</span>
          {r.is_system ? (
            <span className="text-[10px] text-[#9A9890] ml-1">系統</span>
          ) : null}
        </Link>
      ),
      exportValue: (r) => r.name_zh,
      sortValue: (r) => r.name_zh,
    },
    {
      id: "name_en",
      header: "英文",
      width: 140,
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.name_en ?? "—"}</span>,
      exportValue: (r) => r.name_en ?? "",
    },
    {
      id: "suggested_rbac_role_id",
      header: "建議 RBAC role",
      width: 150,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.suggested_rbac_role_id ?? "—"}
        </span>
      ),
      exportValue: (r) => r.suggested_rbac_role_id ?? "",
    },
    {
      id: "sort_order",
      header: "排序",
      width: 70,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{r.sort_order}</span>,
      exportValue: (r) => r.sort_order,
      sortValue: (r) => r.sort_order,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
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
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">員工角色主檔</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          第十四輪
        </span>
        <span className="text-[12px] text-[#9A9890]">
          後台維護員工角色清單（給員工主檔 / 派工看板過濾用）
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-[#5A5955]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            顯示已停用
          </label>
          <div className="flex gap-2 ml-auto">
            {canEdit ? (
              <button
                type="button"
                onClick={() =>
                  router.push("/admin/master-data/employee-roles/new")
                }
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增角色
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{filteredRows.length}</b> 個角色
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={filteredRows}
        rowKey={(r) => r.code}
        persistKey="admin/master-data/employee-roles"
        exportFileName="employee-roles"
        emptyMessage="尚無角色"
        disabled={isPending}
        rowActionsWidth={canEdit ? 210 : 0}
        rowActions={
          canEdit
            ? (r) => (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/admin/master-data/employee-roles/${r.code}`,
                      )
                    }
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(r)}
                    disabled={isPending || (r.is_system && r.is_active)}
                    title={r.is_system && r.is_active ? "系統內建角色不可停用" : ""}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    {r.is_active ? "停用" : "啟用"}
                  </button>
                </div>
              )
            : undefined
        }
      />

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
