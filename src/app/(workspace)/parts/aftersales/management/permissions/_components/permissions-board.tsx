"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkSetAftersalesPermissions,
  type PermissionRow,
  type RoleRow,
} from "@/domain/aftersales-permissions";
import {
  AFTERSALES_PERMISSION_GROUPS,
} from "@/domain/aftersales-permissions.constants";

type Banner = { ok: boolean; msg: string } | null;

/** key = `${role_id}::${permission_code}` */
type DraftMap = Record<string, boolean>;

function cellKey(roleId: string, code: string) {
  return `${roleId}::${code}`;
}

function categoryChip(category: string | null) {
  if (!category) return null;
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    view: { bg: "#EAF4FB", fg: "#185FA5", label: "檢視" },
    edit: { bg: "#FDF3E3", fg: "#854F0B", label: "編輯" },
    approve: { bg: "#FDECEA", fg: "#CC0000", label: "核可" },
  };
  const t = map[category];
  if (!t) return null;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ml-1.5"
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {t.label}
    </span>
  );
}

export function PermissionsBoard({
  roles,
  permissions,
  grants,
  canEdit,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  grants: Record<string, string[]>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftMap>({});

  const permByCode = useMemo(() => {
    const m = new Map<string, PermissionRow>();
    permissions.forEach((p) => m.set(p.code, p));
    return m;
  }, [permissions]);

  const baseGrantSet = useMemo(() => {
    const s = new Set<string>();
    for (const [roleId, codes] of Object.entries(grants)) {
      for (const c of codes) s.add(cellKey(roleId, c));
    }
    return s;
  }, [grants]);

  function isGranted(roleId: string, code: string): boolean {
    const key = cellKey(roleId, code);
    if (key in draft) return draft[key];
    return baseGrantSet.has(key);
  }

  function toggleCell(roleId: string, code: string) {
    if (!editing) return;
    const key = cellKey(roleId, code);
    const cur = isGranted(roleId, code);
    setDraft((prev) => {
      const next = { ...prev };
      // 若 toggle 後跟 base 一致，就把這 key 拿掉，保持 draft 乾淨
      if (baseGrantSet.has(key) === !cur) {
        delete next[key];
      } else {
        next[key] = !cur;
      }
      return next;
    });
  }

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function startEdit() {
    setEditing(true);
    setDraft({});
    setBanner(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setBanner(null);
  }

  function handleSave() {
    const updates = Object.entries(draft).map(([key, granted]) => {
      const [roleId, permCode] = key.split("::");
      return { role_id: roleId, permission_code: permCode, granted };
    });
    if (updates.length === 0) {
      showBanner({ ok: false, msg: "沒有任何變更" });
      return;
    }
    startTransition(async () => {
      const res = await bulkSetAftersalesPermissions(updates);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 已套用 ${res.data.saved} 項變更（授予 ${res.data.granted} / 撤銷 ${res.data.revoked}）`,
        });
        setEditing(false);
        setDraft({});
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const dirtyCount = Object.keys(draft).length;

  return (
    <main className="px-6 py-5 space-y-3">
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

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">職級權限對照</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          主管工作檯
        </span>
        <span className="text-[12px] text-[#9A9890]">
          各售後職級可使用的功能 — 直接綁定 RBAC role_permissions，調整後立即生效
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {canEdit && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
            >
              修改權限對照
            </button>
          )}
          {canEdit && editing && (
            <>
              <span className="text-[11.5px] text-[#854F0B] bg-[#FDF3E3] px-2 py-1 rounded">
                編輯模式　已調整 {dirtyCount} 項
              </span>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending || dirtyCount === 0}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : `儲存變更`}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 說明 alert */}
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0D3166] rounded-lg px-4 py-2.5 text-[12.5px] leading-[1.7]">
        <strong>說明：</strong>本表的「勾選 / 取消」直接寫入 RBAC SSOT（
        <code className="font-mono text-[11.5px] bg-white/60 px-1 rounded">role_permissions</code>
        ），影響所有走 <code className="font-mono text-[11.5px] bg-white/60 px-1 rounded">requirePermission()</code>
        防衛的 server action。請僅限售後主管調整、儲存前確認影響範圍。
      </div>

      {/* 主表 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            售後職級 × 功能權限矩陣
          </h2>
          <span className="text-[11px] text-[#9A9890]">
            共 {permissions.length} 項功能 × {roles.length} 個職級
          </span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2.5 text-left text-[11px] text-[#9A9890] font-semibold sticky left-0 bg-[#F8F7F4] z-10 min-w-[260px]">
                  功能模組
                </th>
                {roles.map((r) => (
                  <th
                    key={r.id}
                    className="px-3 py-2.5 text-center text-[11.5px] text-[#2C2C2A] font-semibold border-l border-[#EEECE6] min-w-[120px]"
                  >
                    <div>{r.name}</div>
                    <div className="text-[10.5px] text-[#9A9890] font-normal font-mono mt-0.5">
                      {r.id}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AFTERSALES_PERMISSION_GROUPS.map((group) => (
                <GroupRows
                  key={group.key}
                  title={group.title}
                  codes={group.codes}
                  permByCode={permByCode}
                  roles={roles}
                  editing={editing}
                  isGranted={isGranted}
                  toggleCell={toggleCell}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 圖例 */}
      <div className="flex items-center gap-4 text-[11.5px] text-[#5A5955] px-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-[#EAF3DE] border border-[#C5DC9F]" />
          授予
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-4 rounded bg-[#F2F2F2] border border-[#D5D3CB]" />
          未授予
        </div>
        {editing && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded bg-[#FDF3E3] border border-[#E6BE6E]" />
            本次調整
          </div>
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Group rows
// ──────────────────────────────────────────────────────────────────────────

function GroupRows({
  title,
  codes,
  permByCode,
  roles,
  editing,
  isGranted,
  toggleCell,
}: {
  title: string;
  codes: readonly string[];
  permByCode: Map<string, PermissionRow>;
  roles: RoleRow[];
  editing: boolean;
  isGranted: (roleId: string, code: string) => boolean;
  toggleCell: (roleId: string, code: string) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={1 + roles.length}
          className="px-3 py-1.5 text-[11.5px] font-semibold text-[#185FA5] bg-[#F0F6FC] border-y border-[#D8E6F2] sticky left-0 z-[5]"
        >
          {title}
        </td>
      </tr>
      {codes.map((code) => {
        const perm = permByCode.get(code);
        if (!perm) return null;
        return (
          <tr
            key={code}
            className="border-t border-[#EEECE6] hover:bg-[#FAFAF8]"
          >
            <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A] sticky left-0 bg-white hover:bg-[#FAFAF8] z-[3]">
              <span>{perm.label}</span>
              {categoryChip(perm.category)}
              <div className="text-[10.5px] text-[#9A9890] font-mono mt-0.5">
                {perm.code}
              </div>
            </td>
            {roles.map((r) => {
              const granted = isGranted(r.id, code);
              const dirty = false; // 視覺 dirty 暫不顯示（保持矩陣簡潔）
              return (
                <td
                  key={r.id}
                  className="px-3 py-2 text-center border-l border-[#EEECE6]"
                >
                  <Cell
                    granted={granted}
                    editable={editing}
                    dirty={dirty}
                    onClick={() => toggleCell(r.id, code)}
                  />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function Cell({
  granted,
  editable,
  dirty,
  onClick,
}: {
  granted: boolean;
  editable: boolean;
  dirty: boolean;
  onClick: () => void;
}) {
  if (!editable) {
    return granted ? (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#EAF3DE] text-[#3B6D11] font-semibold"
        title="已授予"
      >
        ✓
      </span>
    ) : (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#F2F2F2] text-[#9A9890]"
        title="未授予"
      >
        —
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center w-6 h-6 rounded text-[12px] font-semibold transition-colors ${
        granted
          ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F] hover:bg-[#d8ebc4]"
          : "bg-white text-[#9A9890] border border-[#D5D3CB] hover:bg-[#F8F7F4]"
      } ${dirty ? "ring-2 ring-[#E6BE6E]" : ""}`}
      title={granted ? "點擊撤銷" : "點擊授予"}
    >
      {granted ? "✓" : ""}
    </button>
  );
}
