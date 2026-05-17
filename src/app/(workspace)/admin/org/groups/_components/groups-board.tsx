"use client";

import { useState, useTransition } from "react";

import {
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
} from "@/lib/rbac/org-actions";
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
    cell: (r) => <span className="font-mono">{r.id}</span>,
    exportValue: (r) => r.id,
    sortValue: (r) => r.id,
  },
  {
    id: "name",
    header: "名稱",
    width: 200,
    cell: (r) => <span className="font-medium">{r.name}</span>,
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
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showForm, setShowForm] = useState<{ mode: "create" } | { mode: "edit"; row: Row } | null>(null);

  const [fId, setFId] = useState("");
  const [fName, setFName] = useState("");
  const [fShort, setFShort] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const open = (mode: "create" | "edit", row?: Row) => {
    if (mode === "create") {
      setFId("");
      setFName("");
      setFShort("");
      setShowForm({ mode: "create" });
    } else if (row) {
      setFId(row.id);
      setFName(row.name);
      setFShort(row.short_name ?? "");
      setShowForm({ mode: "edit", row });
    }
  };

  const submit = () => {
    startTransition(async () => {
      if (showForm?.mode === "create") {
        const res = await createGroupAction({ id: fId, name: fName, short_name: fShort });
        if (!res.ok) return flash(false, res.error);
        flash(true, "✓ 已建立");
      } else if (showForm?.mode === "edit") {
        const res = await updateGroupAction(showForm.row.id, { name: fName, short_name: fShort });
        if (!res.ok) return flash(false, res.error);
        flash(true, "✓ 已更新");
      }
      setShowForm(null);
      setTimeout(() => window.location.reload(), 600);
    });
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
      setTimeout(() => window.location.reload(), 600);
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
          onClick={() => open("create")}
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
              onClick={() => open("edit", r)}
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

      {showForm && (
        <Modal
          title={showForm.mode === "create" ? "新增集團" : `編輯集團 — ${showForm.row.id}`}
          onClose={() => setShowForm(null)}
        >
          <div className="space-y-3 px-4 py-4">
            <Field label="Group ID" required>
              <input
                value={fId}
                disabled={showForm.mode === "edit"}
                onChange={(e) => setFId(e.target.value)}
                placeholder="例：fanho（小寫英數+底線/連字號）"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full font-mono disabled:bg-[#F8F7F4] disabled:text-[#9A9890]"
              />
              {showForm.mode === "edit" && (
                <span className="text-[10.5px] text-[#9A9890]">建立後不可修改</span>
              )}
            </Field>
            <Field label="集團名稱" required>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="例：汎德永業"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
            <Field label="簡稱">
              <input
                value={fShort}
                onChange={(e) => setFShort(e.target.value)}
                placeholder="例：汎德"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
          </div>
          <ModalFooter
            pending={pending}
            onCancel={() => setShowForm(null)}
            onSubmit={submit}
            submitLabel={showForm.mode === "create" ? "建立" : "儲存變更"}
          />
        </Modal>
      )}
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

// 小元件
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-[480px] max-w-full" onClick={(e) => e.stopPropagation()}>
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button type="button" onClick={onClose} className="text-[#9A9890] hover:text-[#2C2C2A]">✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ pending, onCancel, onSubmit, submitLabel }: { pending: boolean; onCancel: () => void; onSubmit: () => void; submitLabel: string }) {
  return (
    <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2 bg-[#FBFAF7]">
      <button type="button" onClick={onCancel} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">取消</button>
      <button type="button" onClick={onSubmit} disabled={pending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50">{pending ? "儲存中⋯" : submitLabel}</button>
    </footer>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}
