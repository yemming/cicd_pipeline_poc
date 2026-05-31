"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteBrandAction } from "@/lib/rbac/org-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Row = {
  id: string;
  name: string;
  manufacturer: string | null;
  created_at: string;
  group_ids: string[];
  store_count: number;
};
type Group = { id: string; name: string };

const brandColumns: DataGridColumn<Row>[] = [
  {
    id: "id",
    header: "Brand ID",
    width: 120,
    hideable: false,
    cell: (r) => (
      <Link
        href={`/admin/org/brands/${r.id}`}
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
    width: 160,
    cell: (r) => (
      <Link href={`/admin/org/brands/${r.id}`} className="font-medium text-[#185FA5] hover:underline">
        {r.name}
      </Link>
    ),
    exportValue: (r) => r.name,
    sortValue: (r) => r.name,
  },
  {
    id: "manufacturer",
    header: "原廠",
    width: 160,
    cell: (r) => <span className="text-[#5A5955]">{r.manufacturer || "—"}</span>,
    exportValue: (r) => r.manufacturer ?? "",
    sortValue: (r) => r.manufacturer ?? "",
  },
  {
    id: "group_ids",
    header: "代理集團",
    width: 260,
    sortable: false,
    cell: (r) =>
      r.group_ids.length === 0 ? (
        <span className="text-[#9A9890] italic">未指定</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {r.group_ids.map((gid) => (
            <span
              key={gid}
              className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[10.5px] font-mono"
            >
              {gid}
            </span>
          ))}
        </div>
      ),
    exportValue: (r) => r.group_ids.join(","),
  },
  {
    id: "store_count",
    header: "門店",
    width: 80,
    align: "right",
    cell: (r) => <span className="text-[#5A5955]">{r.store_count}</span>,
    exportValue: (r) => r.store_count,
    sortValue: (r) => r.store_count,
  },
];

export function BrandsBoard({ rows, groups }: { rows: Row[]; groups: Group[] }) {
  void groups;
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
      const res = await deleteBrandAction(row.id);
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
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個品牌
        </span>
        <button
          type="button"
          onClick={() => router.push("/admin/org/brands/new")}
          className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
        >
          ＋ 新增品牌
        </button>
      </div>

      <DataGrid<Row>
        columns={brandColumns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/org/brands"
        exportFileName="brands"
        emptyMessage="尚無任何品牌"
        disabled={pending}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/org/brands/${r.id}`)}
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
          title="確定刪除品牌？"
          message={`確定刪除品牌「${confirmDelete.name}」？`}
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
