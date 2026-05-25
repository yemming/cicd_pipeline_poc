"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  createEmployeeRoleAction,
  updateEmployeeRoleAction,
  deactivateEmployeeRoleAction,
} from "@/lib/master-data/employee-role-actions";
import type {
  EmployeeRoleType,
  EmployeeRoleInput,
} from "@/domain/employee-roles.constants";

type FormMode = "create" | "edit" | null;
type Banner = { ok: boolean; msg: string } | null;

const COLOR_PALETTE = [
  "#0F6E56", "#185FA5", "#854F0B", "#CC0000", "#0F2A45",
  "#5A5955", "#3B6D11", "#1A3A5C", "#534AB7",
];

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
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editing, setEditing] = useState<EmployeeRoleType | null>(null);
  const [showInactive, setShowInactive] = useState<boolean>(true);

  function flash(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function openCreate() {
    setEditing(null);
    setFormMode("create");
  }
  function openEdit(r: EmployeeRoleType) {
    setEditing(r);
    setFormMode("edit");
  }
  function close() {
    setFormMode(null);
    setEditing(null);
  }

  function submit(input: EmployeeRoleInput) {
    startTransition(async () => {
      if (formMode === "create") {
        const res = await createEmployeeRoleAction(input);
        if (res.ok) {
          flash({ ok: true, msg: `✓ 已建立角色「${input.name_zh}」` });
          close();
          router.refresh();
        } else flash({ ok: false, msg: res.error });
      } else if (formMode === "edit" && editing) {
        const res = await updateEmployeeRoleAction(editing.code, {
          name_zh: input.name_zh,
          name_en: input.name_en,
          description: input.description,
          color: input.color,
          icon: input.icon,
          sort_order: input.sort_order,
          suggested_rbac_role_id: input.suggested_rbac_role_id,
        });
        if (res.ok) {
          flash({ ok: true, msg: `✓ 已更新角色「${input.name_zh}」` });
          close();
          router.refresh();
        } else flash({ ok: false, msg: res.error });
      }
    });
  }

  function toggleActive(r: EmployeeRoleType) {
    if (!canEdit || isPending) return;
    if (r.is_active) {
      if (!confirm(`確定停用角色「${r.name_zh}」？\n停用後此角色不會出現在員工角色多選下拉。`)) return;
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
      cell: (r) => <span className="font-mono text-[12.5px] text-[#1A3A5C]">{r.code}</span>,
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name_zh",
      header: "顯示名稱",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: r.color }}
          />
          <span className="font-medium text-[12.5px] text-[#2C2C2A]">{r.name_zh}</span>
          {r.is_system ? (
            <span className="text-[10px] text-[#9A9890] ml-1">系統</span>
          ) : null}
        </span>
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
                onClick={openCreate}
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
                    onClick={() => openEdit(r)}
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

      {formMode ? (
        <RoleFormModal
          mode={formMode}
          editing={editing}
          isPending={isPending}
          onClose={close}
          onSubmit={submit}
        />
      ) : null}

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

function RoleFormModal({
  mode,
  editing,
  isPending,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  editing: EmployeeRoleType | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: EmployeeRoleInput) => void;
}) {
  const [code, setCode] = useState(editing?.code ?? "");
  const [nameZh, setNameZh] = useState(editing?.name_zh ?? "");
  const [nameEn, setNameEn] = useState(editing?.name_en ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [color, setColor] = useState(editing?.color ?? "#185FA5");
  const [icon, setIcon] = useState(editing?.icon ?? "");
  const [sortOrder, setSortOrder] = useState<number>(editing?.sort_order ?? 100);
  const [rbacRoleId, setRbacRoleId] = useState(editing?.suggested_rbac_role_id ?? "");

  const isSystem = editing?.is_system ?? false;
  const isEdit = mode === "edit";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      code: code.trim(),
      name_zh: nameZh.trim(),
      name_en: nameEn.trim() || null,
      description: description.trim() || null,
      color,
      icon: icon.trim() || null,
      sort_order: sortOrder,
      suggested_rbac_role_id: rbacRoleId.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-[520px]"
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
            {isEdit ? `編輯角色 — ${editing?.name_zh}` : "新增員工角色"}
          </h3>
          {isSystem ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5]">
              系統內建
            </span>
          ) : null}
        </header>
        <div className="px-4 py-3 space-y-3">
          <Field label="角色代碼（程式用 *）">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isEdit || isPending}
              placeholder="technician / sa / parts_manager"
              required
              pattern="[a-z][a-z0-9_]*"
              title="小寫英文 + 數字 + 底線、字母開頭"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
            <span className="text-[11px] text-[#9A9890]">建立後不可改、只能停用</span>
          </Field>
          <Field label="顯示名稱 *">
            <input
              value={nameZh}
              onChange={(e) => setNameZh(e.target.value)}
              disabled={isPending}
              required
              placeholder="技師 / 服務顧問 / 外包技師"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="英文名稱（可選）">
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                disabled={isPending}
                placeholder="Technician"
                className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              />
            </Field>
            <Field label="排序（小→前）">
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                disabled={isPending}
                className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5]"
              />
            </Field>
          </div>
          <Field label="顏色（chip 顯示）">
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={isPending}
                  className={`w-7 h-7 rounded-full border-2 ${
                    color === c ? "border-[#2C2C2A]" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={isPending}
                placeholder="#185FA5"
                className="h-[28px] w-[100px] border border-[#D5D3CB] rounded px-2 text-[11.5px] font-mono focus:border-[#185FA5]"
              />
            </div>
          </Field>
          <Field label="Material Symbol icon name（可選）">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              disabled={isPending}
              placeholder="engineering / badge / support_agent"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5]"
            />
          </Field>
          <Field label="建議綁定的 RBAC role id（可選）">
            <input
              value={rbacRoleId}
              onChange={(e) => setRbacRoleId(e.target.value)}
              disabled={isPending}
              placeholder="technician / service_advisor / warehouse"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] font-mono focus:border-[#185FA5]"
            />
            <span className="text-[11px] text-[#9A9890]">
              人事系統將來可參考此值自動配 RBAC role；POC 階段純供提示
            </span>
          </Field>
          <Field label="說明（可選）">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              placeholder="用途說明（給後台維護者看）"
              className="w-full min-h-[60px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5]"
            />
          </Field>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? (isEdit ? "儲存中⋯" : "建立中⋯") : isEdit ? "儲存變更" : "建立"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
