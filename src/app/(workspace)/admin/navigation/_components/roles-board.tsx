"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createRoleAction, deleteRoleAction } from "@/lib/rbac/admin-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permission_count: number;
  user_count: number;
  created_at: string;
};

export function RolesBoard({ rows }: { rows: RoleRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const roleColumns: DataGridColumn<RoleRow>[] = [
    {
      id: "id",
      header: "Role ID",
      width: 140,
      hideable: false,
      cell: (r) => <span className="font-mono">{r.id}</span>,
      exportValue: (r) => r.id,
      sortValue: (r) => r.id,
    },
    {
      id: "name",
      header: "名稱",
      width: 160,
      cell: (r) => <span className="font-medium">{r.name}</span>,
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "description",
      header: "描述",
      width: 280,
      cell: (r) => (
        <span className="text-[#5A5955] truncate block max-w-[280px]" title={r.description ?? ""}>
          {r.description || "—"}
        </span>
      ),
      exportValue: (r) => r.description ?? "",
      sortValue: (r) => r.description ?? "",
    },
    {
      id: "is_system",
      header: "類型",
      width: 90,
      cell: (r) =>
        r.is_system ? (
          <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-medium">
            system
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] font-medium">
            custom
          </span>
        ),
      exportValue: (r) => (r.is_system ? "system" : "custom"),
      sortValue: (r) => (r.is_system ? 1 : 0),
    },
    {
      id: "permission_count",
      header: "權限數",
      width: 80,
      align: "right",
      cell: (r) => <span className="text-[#5A5955]">{r.permission_count}</span>,
      exportValue: (r) => r.permission_count,
      sortValue: (r) => r.permission_count,
    },
    {
      id: "user_count",
      header: "使用人數",
      width: 90,
      align: "right",
      cell: (r) => <span className="text-[#5A5955]">{r.user_count}</span>,
      exportValue: (r) => r.user_count,
      sortValue: (r) => r.user_count,
    },
  ];

  // 新增表單
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const filtered = keyword.trim()
    ? rows.filter(
        (r) =>
          r.id.toLowerCase().includes(keyword.toLowerCase()) ||
          r.name.toLowerCase().includes(keyword.toLowerCase()) ||
          (r.description ?? "").toLowerCase().includes(keyword.toLowerCase()),
      )
    : rows;

  const create = () => {
    if (!newId.trim() || !newName.trim()) {
      flash(false, "Role ID 與名稱皆必填");
      return;
    }
    startTransition(async () => {
      const res = await createRoleAction({
        id: newId,
        name: newName,
        description: newDesc || null,
      });
      if (!res.ok) {
        flash(false, `新增失敗：${res.error}`);
      } else {
        flash(true, "✓ 已建立");
        setShowCreate(false);
        setNewId("");
        setNewName("");
        setNewDesc("");
        router.push(`/admin/navigation/roles/${res.data.id}`);
      }
    });
  };

  const remove = (id: string, name: string) => {
    setConfirmDelete({ id, name });
  };
  const doRemove = () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    startTransition(async () => {
      const res = await deleteRoleAction(id);
      if (!res.ok) {
        flash(false, `刪除失敗：${res.error}`);
      } else {
        flash(true, "✓ 已刪除，重整中…");
        setTimeout(() => window.location.reload(), 600);
      }
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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="角色 id / 名稱 / 描述"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-[260px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setKeyword("")}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            >
              ＋ 新增角色
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個角色（顯示{" "}
          <b>{filtered.length}</b> 筆）
        </span>
      </div>

      <DataGrid<RoleRow>
        columns={roleColumns}
        data={filtered}
        rowKey={(r) => r.id}
        persistKey="admin/navigation/roles"
        exportFileName="roles"
        emptyMessage={rows.length === 0 ? "尚無任何角色" : "沒有符合關鍵字的角色"}
        disabled={pending}
        rowActions={(r) => (
          <>
            <button
              type="button"
              onClick={() => router.push(`/admin/navigation/roles/${r.id}`)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => remove(r.id, r.name)}
              disabled={r.is_system || pending}
              title={r.is_system ? "系統內建角色不可刪除" : ""}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              刪除
            </button>
          </>
        )}
        rowActionsWidth={150}
      />
      {confirmDelete && (
        <ConfirmDialog
          title="確定刪除角色？"
          message={`確定刪除角色「${confirmDelete.name}」？刪除前必須撤銷所有相關授權。`}
          confirmLabel="確認刪除"
          variant="danger"
          isPending={pending}
          onConfirm={doRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-[480px] max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">新增角色</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[#9A9890] hover:text-[#2C2C2A]"
              >
                ✕
              </button>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  Role ID <span className="text-[#CC0000]">*</span>
                </label>
                <input
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="例：sales_lead（小寫英數+底線）"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] font-mono"
                />
                <span className="text-[10.5px] text-[#9A9890]">
                  建立後不可修改；用於程式內部識別
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  名稱 <span className="text-[#CC0000]">*</span>
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例：業務主管"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">描述（選）</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="權責簡述"
                  rows={3}
                  className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] resize-none"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2 bg-[#FBFAF7]">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={create}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
