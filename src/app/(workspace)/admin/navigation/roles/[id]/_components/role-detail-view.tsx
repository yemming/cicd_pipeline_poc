"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateRoleAction, deleteRoleAction } from "@/lib/rbac/admin-actions";

type Role = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string | null;
};

type GrantedPerm = { code: string; label: string; module: string };
type RecentAssignment = {
  id: string;
  email: string | null;
  user_id: string;
  scope_type: string;
  scope_id: string;
  granted_at: string;
};

const LIST_HREF = "/admin/navigation?tab=roles";
const PERM_HREF = "/admin/navigation?tab=permissions";

export function RoleDetailView({
  role,
  grantedPerms,
  assignmentCount,
  recentAssignments,
}: {
  role: Role;
  grantedPerms: GrantedPerm[];
  assignmentCount: number;
  recentAssignments: RecentAssignment[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // 編輯欄位 in-memory 狀態
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? "");

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!name.trim()) {
      flash(false, "角色名稱不可空");
      return;
    }
    startTransition(async () => {
      const res = await updateRoleAction(role.id, { name, description: desc });
      if (!res.ok) {
        flash(false, `儲存失敗：${res.error}`);
      } else {
        flash(true, "✓ 已儲存");
        setMode("view");
        router.refresh();
      }
    });
  };

  const cancelEdit = () => {
    setName(role.name);
    setDesc(role.description ?? "");
    setMode("view");
  };

  const remove = () => {
    if (role.is_system) {
      flash(false, "系統內建角色不可刪除");
      return;
    }
    if (!confirm(`確定刪除角色「${role.name}」？\n如有授權使用此角色，刪除會被拒絕。`)) return;
    startTransition(async () => {
      const res = await deleteRoleAction(role.id);
      if (!res.ok) {
        flash(false, `刪除失敗：${res.error}`);
      } else {
        flash(true, "✓ 已刪除，返回列表中…");
        setTimeout(() => router.push(LIST_HREF), 600);
      }
    });
  };

  // 按 module 分群權限
  const byModule = new Map<string, GrantedPerm[]>();
  for (const p of grantedPerms) {
    const list = byModule.get(p.module) ?? [];
    list.push(p);
    byModule.set(p.module, list);
  }
  const moduleKeys = Array.from(byModule.keys()).sort();

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

      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_HREF} className="hover:text-[#185FA5]">
            角色管理
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{role.id}</span>
          {mode === "edit" && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10.5px] bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <>
              <Link
                href={LIST_HREF}
                className="h-[30px] px-4 rounded-full text-[12px] flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={() => setMode("edit")}
                disabled={role.is_system}
                title={role.is_system ? "系統內建角色不可改名" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                修改
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={role.is_system || pending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                刪除
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">ROLE</div>
              {mode === "view" ? (
                <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                  {role.name}
                </h1>
              ) : (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[16px] font-semibold text-[#2C2C2A] focus:border-[#185FA5] w-[320px]"
                />
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{role.id}</span>
                {role.is_system ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-medium">
                    system
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] font-medium">
                    custom
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px] font-medium">
                  {grantedPerms.length} 項權限
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px] font-medium">
                  {assignmentCount} 個授權
                </span>
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <Link
              href={`${PERM_HREF}&role=${role.id}`}
              className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              到「權限」tab 編輯此角色
            </Link>
          </div>
        </div>
      </header>

      {/* 3. 基本資料 / 描述 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="Role ID" value={role.id} mono />
          <Kv label="類型" value={role.is_system ? "系統內建（system）" : "客製（custom）"} />
          <Kv
            label="建立時間"
            value={new Date(role.created_at).toLocaleString("zh-TW")}
            small
          />
          <div className="md:col-span-3">
            <label className="text-[11px] text-[#9A9890] font-medium">描述</label>
            {mode === "view" ? (
              <div className="text-[12.5px] text-[#2C2C2A] mt-1 whitespace-pre-wrap">
                {role.description || "—"}
              </div>
            ) : (
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="mt-1 w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] resize-none"
                placeholder="權責簡述"
              />
            )}
          </div>
        </div>
      </section>

      {/* 4. 已授予的權限 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 已授予權限（{grantedPerms.length}）
          </span>
          <Link
            href={`${PERM_HREF}&role=${role.id}`}
            className="ml-auto text-[11.5px] text-[#185FA5] hover:underline"
          >
            到「權限」tab 編輯 →
          </Link>
        </header>
        <div className="px-4 py-3">
          {grantedPerms.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] italic">尚未授予任何 permission</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {moduleKeys.map((mod) => (
                <div key={mod}>
                  <div className="text-[11px] font-semibold text-[#185FA5] mb-1">{mod}</div>
                  <ul className="text-[12px] space-y-0.5">
                    {byModule.get(mod)!.map((p) => (
                      <li
                        key={p.code}
                        className="flex items-center gap-2 py-0.5 text-[#5A5955]"
                      >
                        <span className="text-[#0F6E56]">✓</span>
                        <span>{p.label}</span>
                        <span className="font-mono text-[10px] text-[#9A9890]">{p.code}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. 使用此角色的人 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 使用此角色的授權（{assignmentCount}{assignmentCount > 10 ? "，顯示前 10 筆" : ""}）
          </span>
          <Link
            href="/admin/navigation?tab=users"
            className="ml-auto text-[11.5px] text-[#185FA5] hover:underline"
          >
            到「使用者授權」tab →
          </Link>
        </header>
        {recentAssignments.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-[#9A9890] italic">無人使用此角色</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
              <tr>
                <th className="text-left font-medium py-2 px-3">使用者</th>
                <th className="text-left font-medium py-2 px-3">作用域</th>
                <th className="text-left font-medium py-2 px-3">授權於</th>
              </tr>
            </thead>
            <tbody>
              {recentAssignments.map((a) => (
                <tr key={a.id} className="border-t border-[#F8F7F4]">
                  <td className="py-2 px-3">
                    <div>{a.email ?? "(unknown)"}</div>
                    <div className="text-[10px] text-[#9A9890] font-mono">{a.user_id}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-medium mr-1">
                      {a.scope_type}
                    </span>
                    <span className="font-mono text-[11px]">{a.scope_id}</span>
                  </td>
                  <td className="py-2 px-3 text-[#5A5955]">
                    {new Date(a.granted_at).toLocaleDateString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Kv({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <div
        className={`${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}
