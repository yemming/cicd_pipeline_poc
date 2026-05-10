"use client";

import { useState, useTransition } from "react";

import {
  setBrandModuleEnabledAction,
  createUserAssignmentAction,
  deleteUserAssignmentAction,
} from "@/lib/rbac/admin-actions";

type Brand = { id: string; name: string };
type ModuleEntry = { key: string; name: string };
type BrandModuleRow = { brand_id: string; module_key: string; enabled: boolean };
type Role = { id: string; name: string; description: string | null };
type Assignment = {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: string;
  scope_id: string;
  granted_at: string;
  expires_at: string | null;
  notes: string | null;
  email: string | null;
};
type Group = { id: string; name: string };
type Store = { id: string; name: string; brand_id: string; group_id: string | null };

export function RbacAdminBoard({
  brands,
  allModules,
  brandModules,
  roles,
  assignments,
  groups,
  stores,
}: {
  brands: Brand[];
  allModules: ModuleEntry[];
  brandModules: BrandModuleRow[];
  roles: Role[];
  assignments: Assignment[];
  groups: Group[];
  stores: Store[];
  userMap: Record<string, string>;
}) {
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // brand_modules 矩陣 in-memory 狀態，optimistic update
  const [matrix, setMatrix] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const r of brandModules) out[`${r.brand_id}::${r.module_key}`] = r.enabled;
    return out;
  });

  const isEnabled = (b: string, m: string) => {
    const k = `${b}::${m}`;
    return matrix[k] ?? true; // 預設 enabled
  };

  const toggle = (b: string, m: string) => {
    const next = !isEnabled(b, m);
    setMatrix((prev) => ({ ...prev, [`${b}::${m}`]: next }));
    startTransition(async () => {
      const res = await setBrandModuleEnabledAction(b, m, next);
      if (!res.ok) {
        setMatrix((prev) => ({ ...prev, [`${b}::${m}`]: !next })); // rollback
        setBanner({ ok: false, msg: `儲存失敗：${res.error}` });
      } else {
        setBanner({ ok: true, msg: `✓ ${b}/${m} → ${next ? "開啟" : "關閉"}` });
        setTimeout(() => setBanner(null), 2200);
      }
    });
  };

  // 新增 assignment 表單
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState(roles[0]?.id ?? "viewer");
  const [newScopeType, setNewScopeType] = useState<"group" | "brand" | "store">("brand");
  const [newScopeId, setNewScopeId] = useState(brands[0]?.id ?? "");
  const [newNotes, setNewNotes] = useState("");

  const scopeOptions =
    newScopeType === "group"
      ? groups.map((g) => ({ value: g.id, label: `${g.id} — ${g.name}` }))
      : newScopeType === "brand"
        ? brands.map((b) => ({ value: b.id, label: `${b.id} — ${b.name}` }))
        : stores.map((s) => ({ value: s.id, label: `${s.name} (${s.brand_id})` }));

  const grant = () => {
    if (!newUserId.trim()) {
      setBanner({ ok: false, msg: "請填 user_id" });
      return;
    }
    if (!newScopeId) {
      setBanner({ ok: false, msg: "請選 scope 對象" });
      return;
    }
    startTransition(async () => {
      const res = await createUserAssignmentAction({
        user_id: newUserId.trim(),
        role_id: newRole,
        scope_type: newScopeType,
        scope_id: newScopeId,
        notes: newNotes.trim() || null,
      });
      if (!res.ok) {
        setBanner({ ok: false, msg: `新增失敗：${res.error}` });
      } else {
        setBanner({ ok: true, msg: "✓ 已新增授權，重整中…" });
        setNewUserId("");
        setNewNotes("");
        setTimeout(() => window.location.reload(), 600);
      }
    });
  };

  const revoke = (id: string) => {
    if (!confirm("確定撤銷這筆授權？")) return;
    startTransition(async () => {
      const res = await deleteUserAssignmentAction(id);
      if (!res.ok) {
        setBanner({ ok: false, msg: `撤銷失敗：${res.error}` });
      } else {
        setBanner({ ok: true, msg: "✓ 已撤銷，重整中…" });
        setTimeout(() => window.location.reload(), 600);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
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

      {/* ========================== 模組授權矩陣 ========================== */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 品牌可用模組</span>
          <span className="text-[11.5px] text-[#9A9890]">
            勾選 = 該品牌使用者進站可看到該模組（nav 自動剃掉關閉的）
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
              <tr>
                <th className="text-left font-medium py-2 px-3 sticky left-0 bg-[#FBFAF7] z-10">
                  模組 \ 品牌
                </th>
                {brands.map((b) => (
                  <th key={b.id} className="text-center font-medium py-2 px-3 whitespace-nowrap">
                    {b.name}
                    <div className="text-[10px] text-[#9A9890] font-normal font-mono">{b.id}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allModules.map((m) => (
                <tr key={m.key} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-medium sticky left-0 bg-white z-10">
                    <div>{m.name}</div>
                    <div className="text-[10px] text-[#9A9890] font-mono">{m.key}</div>
                  </td>
                  {brands.map((b) => {
                    const on = isEnabled(b.id, m.key);
                    return (
                      <td key={b.id} className="text-center py-2 px-3">
                        <button
                          type="button"
                          onClick={() => toggle(b.id, m.key)}
                          disabled={pending}
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            on ? "bg-[#0F6E56]" : "bg-[#D5D3CB]"
                          } disabled:opacity-60`}
                          title={on ? "已開啟（點擊關閉）" : "已關閉（點擊開啟）"}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                              on ? "left-[18px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================== 使用者授權 ========================== */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 使用者授權</span>
        </header>

        {/* 新增表單 */}
        <div className="px-4 py-3 border-b border-[#EEECE6] bg-[#FBFAF7]">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">User ID (UUID)</label>
              <input
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="auth.users.id"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-[280px] font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">Scope 類型</label>
              <select
                value={newScopeType}
                onChange={(e) => {
                  const next = e.target.value as "group" | "brand" | "store";
                  setNewScopeType(next);
                  setNewScopeId(
                    next === "group"
                      ? groups[0]?.id ?? ""
                      : next === "brand"
                        ? brands[0]?.id ?? ""
                        : stores[0]?.id ?? "",
                  );
                }}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="group">集團</option>
                <option value="brand">品牌</option>
                <option value="store">店</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">Scope 對象</label>
              <select
                value={newScopeId}
                onChange={(e) => setNewScopeId(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] min-w-[200px]"
              >
                {scopeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[#9A9890] font-medium">備註（選）</label>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="授權原因 / 期限"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </div>
            <button
              type="button"
              onClick={grant}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {pending ? "新增中⋯" : "＋ 新增授權"}
            </button>
          </div>
        </div>

        {/* 列表 */}
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">使用者</th>
              <th className="text-left font-medium py-2 px-3">Role</th>
              <th className="text-left font-medium py-2 px-3">Scope</th>
              <th className="text-left font-medium py-2 px-3">授權於</th>
              <th className="text-left font-medium py-2 px-3">到期</th>
              <th className="text-left font-medium py-2 px-3">備註</th>
              <th className="text-right font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[#9A9890] italic">
                  尚無任何授權
                </td>
              </tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3">
                    <div className="font-medium">{a.email ?? "(unknown)"}</div>
                    <div className="text-[10px] text-[#9A9890] font-mono">{a.user_id}</div>
                  </td>
                  <td className="py-2 px-3 font-mono">{a.role_id}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11px] font-medium mr-1">
                      {a.scope_type}
                    </span>
                    <span className="font-mono text-[11px]">{a.scope_id}</span>
                  </td>
                  <td className="py-2 px-3 text-[#5A5955]">
                    {new Date(a.granted_at).toLocaleDateString("zh-TW")}
                  </td>
                  <td className="py-2 px-3 text-[#5A5955]">
                    {a.expires_at
                      ? new Date(a.expires_at).toLocaleDateString("zh-TW")
                      : "—"}
                  </td>
                  <td className="py-2 px-3 text-[#5A5955]">{a.notes ?? "—"}</td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => revoke(a.id)}
                      disabled={pending}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      撤銷
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
