"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { setRolePermissionAction } from "@/lib/rbac/admin-actions";

type Role = { id: string; name: string; description: string | null; is_system: boolean };
type Permission = { code: string; label: string; module: string; category: string | null };
type RolePermission = { role_id: string; permission_code: string };

export function PermissionsBoard({
  roles,
  permissions,
  rolePermissions,
}: {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // 從 URL 讀目前選中的 role；沒選 → 預設第一個
  const selectedRole = useMemo(() => {
    const fromUrl = sp.get("role");
    if (fromUrl && roles.some((r) => r.id === fromUrl)) return fromUrl;
    return roles[0]?.id ?? null;
  }, [sp, roles]);

  // matrix in-memory（optimistic）
  const [matrix, setMatrix] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const r of rolePermissions) out[`${r.role_id}::${r.permission_code}`] = true;
    return out;
  });

  const has = (role: string, perm: string) => matrix[`${role}::${perm}`] ?? false;

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 1800);
  };

  const toggle = (role: string, perm: string) => {
    const next = !has(role, perm);
    setMatrix((prev) => ({ ...prev, [`${role}::${perm}`]: next }));
    startTransition(async () => {
      const res = await setRolePermissionAction(role, perm, next);
      if (!res.ok) {
        setMatrix((prev) => ({ ...prev, [`${role}::${perm}`]: !next }));
        flash(false, `儲存失敗：${res.error}`);
      } else {
        flash(true, `✓ ${role} / ${perm} → ${next ? "授予" : "撤回"}`);
      }
    });
  };

  const switchRole = (id: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "permissions");
    params.set("role", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const bulkToggleModule = (role: string, mod: string, enable: boolean) => {
    const perms = permissions.filter((p) => p.module === mod);
    const updates: Record<string, boolean> = {};
    for (const p of perms) updates[`${role}::${p.code}`] = enable;
    setMatrix((prev) => ({ ...prev, ...updates }));
    startTransition(async () => {
      const results = await Promise.all(
        perms.map((p) => setRolePermissionAction(role, p.code, enable)),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        flash(false, `${failed.length} 項儲存失敗，請刷新`);
      } else {
        flash(true, `✓ ${mod} 模組 → ${enable ? "全部授予" : "全部撤回"}`);
      }
    });
  };

  if (roles.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg p-8 text-center">
        <p className="text-[13px] text-[#9A9890] mb-3">尚未建立任何角色</p>
        <Link
          href="/admin/navigation?tab=roles"
          className="inline-flex h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] items-center"
        >
          到「角色」tab 建立第一個角色
        </Link>
      </div>
    );
  }

  // 依 module 分群 permissions
  const byModule = new Map<string, Permission[]>();
  for (const p of permissions) {
    const list = byModule.get(p.module) ?? [];
    list.push(p);
    byModule.set(p.module, list);
  }
  const modules = Array.from(byModule.keys()).sort();

  const currentRole = roles.find((r) => r.id === selectedRole);
  const grantedCount = currentRole
    ? permissions.filter((p) => has(currentRole.id, p.code)).length
    : 0;

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

      {/* 角色選擇器 chips */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 選擇角色</span>
          <span className="text-[11.5px] text-[#9A9890]">
            點選角色後在下方矩陣勾選授予的權限
          </span>
        </header>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {roles.map((r) => {
            const active = r.id === selectedRole;
            const count = permissions.filter((p) => has(r.id, p.code)).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => switchRole(r.id)}
                className={`inline-flex items-center gap-2 px-3 h-[30px] rounded-full text-[12px] border transition-colors ${
                  active
                    ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                }`}
              >
                <span className="font-medium">{r.name}</span>
                <span
                  className={`text-[10.5px] font-mono ${
                    active ? "text-white/70" : "text-[#9A9890]"
                  }`}
                >
                  {r.id}
                </span>
                <span
                  className={`text-[10.5px] px-1.5 py-0.5 rounded-full ${
                    active ? "bg-white/15" : "bg-[#EBF3FF] text-[#1A3A5C]"
                  }`}
                >
                  {count}
                </span>
                {r.is_system && (
                  <span
                    className={`text-[10px] px-1 rounded ${
                      active ? "bg-white/15" : "bg-[#EAF4FB] text-[#185FA5]"
                    }`}
                  >
                    sys
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 當前 role 的權限矩陣 */}
      {currentRole && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ {currentRole.name} 的權限
            </span>
            <span className="text-[11.5px] text-[#9A9890] font-mono">{currentRole.id}</span>
            <span className="text-[11.5px] text-[#185FA5]">
              已授予 <b>{grantedCount}</b> / {permissions.length}
            </span>
            <Link
              href={`/admin/navigation/roles/${currentRole.id}`}
              className="ml-auto text-[11.5px] text-[#185FA5] hover:underline"
            >
              查看角色詳情 →
            </Link>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-[#9A9890] bg-[#FBFAF7]">
                <tr>
                  <th className="text-left font-medium py-2 px-3 w-[60%]">Permission</th>
                  <th className="text-center font-medium py-2 px-3 w-[80px]">已授予</th>
                  <th className="text-right font-medium py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {modules.flatMap((mod) => {
                  const modPerms = byModule.get(mod)!;
                  const allOn = modPerms.every((p) => has(currentRole.id, p.code));
                  const anyOn = modPerms.some((p) => has(currentRole.id, p.code));
                  return [
                    <tr key={`__hdr-${mod}`} className="bg-[#F8F7F4] border-y border-[#EEECE6]">
                      <td className="py-1.5 px-3 text-[11px] font-semibold text-[#185FA5]">
                        {mod}
                      </td>
                      <td className="py-1.5 px-3 text-center text-[11px] text-[#9A9890]">
                        {modPerms.filter((p) => has(currentRole.id, p.code)).length} /{" "}
                        {modPerms.length}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            bulkToggleModule(currentRole.id, mod, !allOn)
                          }
                          disabled={pending}
                          className="text-[10.5px] px-2 h-[22px] rounded border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                          title={allOn ? "全部撤回" : anyOn ? "改為全部授予" : "全部授予"}
                        >
                          {allOn ? "全撤回" : "全授予"}
                        </button>
                      </td>
                    </tr>,
                    ...modPerms.map((p) => {
                      const on = has(currentRole.id, p.code);
                      return (
                        <tr
                          key={p.code}
                          className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]"
                        >
                          <td className="py-2 px-3">
                            <div className="text-[12px]">{p.label}</div>
                            <div className="text-[10px] text-[#9A9890] font-mono">
                              {p.code}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(currentRole.id, p.code)}
                              disabled={pending}
                              className="w-4 h-4 accent-[#0F6E56] cursor-pointer disabled:opacity-50"
                            />
                          </td>
                          <td className="py-2 px-3 text-right text-[11px] text-[#9A9890]">
                            {p.category ?? "—"}
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
