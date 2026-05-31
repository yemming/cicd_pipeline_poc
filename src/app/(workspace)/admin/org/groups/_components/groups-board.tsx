"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteGroupAction } from "@/lib/rbac/org-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Row = {
  id: string;
  name: string;
  short_name: string | null;
  created_at: string;
  org_count: number;
  brand_count: number;
};

const groupColumns: DataGridColumn<Row>[] = [
  {
    id: "id",
    header: "Group ID",
    width: 140,
    hideable: false,
    cell: (r) => (
      <Link
        href={`/admin/org/groups/${r.id}`}
        className="font-mono font-semibold text-[#1A3A5C] hover:underline"
      >
        {r.id}
      </Link>
    ),
    exportValue: (r) => r.id,
    sortValue: (r) => r.id,
  },
  {
    id: "name",
    header: "名稱",
    width: 200,
    cell: (r) => (
      <Link href={`/admin/org/groups/${r.id}`} className="font-medium text-[#185FA5] hover:underline">
        {r.name}
      </Link>
    ),
    exportValue: (r) => r.name,
    sortValue: (r) => r.name,
  },
  {
    id: "short_name",
    header: "簡稱",
    width: 140,
    cell: (r) => <span className="text-[#5A5955]">{r.short_name || "—"}</span>,
    exportValue: (r) => r.short_name ?? "",
    sortValue: (r) => r.short_name ?? "",
  },
  {
    id: "brand_count",
    header: "代理品牌",
    width: 100,
    align: "right",
    cell: (r) => <span className="text-[#5A5955]">{r.brand_count}</span>,
    exportValue: (r) => r.brand_count,
    sortValue: (r) => r.brand_count,
  },
  {
    id: "org_count",
    header: "門店",
    width: 100,
    align: "right",
    cell: (r) => <span className="text-[#5A5955]">{r.org_count}</span>,
    exportValue: (r) => r.org_count,
    sortValue: (r) => r.org_count,
  },
];

export function GroupsBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const remove = (row: Row) => {
    setConfirmDelete(row);
  };
  const doRemove = () => {
    if (!confirmDelete) return;
    const row = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteGroupAction(row.id);
      if (!res.ok) return flash(false, res.error);
      flash(true, "✓ 已刪除");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
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
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個集團
        </span>
        <button
          type="button"
          onClick={() => router.push("/admin/org/groups/new")}
          className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
        >
          ＋ 新增集團
        </button>
      </div>

      <DataGrid<Row>
        columns={groupColumns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/org/groups"
        exportFileName="groups"
        emptyMessage="尚無任何集團"
        disabled={pending}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/org/groups/${r.id}`)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => remove(r)}
              disabled={pending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
        rowActionsWidth={150}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="確定刪除集團？"
          message={`確定刪除集團「${confirmDelete.name}」？依賴的門店 / 品牌代理 / 授權需先清除。`}
          confirmLabel="確認刪除"
          variant="danger"
          isPending={pending}
          onConfirm={doRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
