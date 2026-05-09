"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkSaveGrantsAction,
  createFeatureAction,
  createRoleAction,
  deleteFeatureAction,
  deleteRoleAction,
  updateFeatureAction,
  updateRoleAction,
  type GrantPatch,
} from "@/lib/parts-setup/item-permission-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type RoleRow = {
  id: string;
  role_code: string;
  role_name: string;
  sort_order: number;
  is_active: boolean;
};

export type FeatureRow = {
  id: string;
  group_code: string;
  group_name: string;
  group_sort_order: number;
  feature_code: string;
  feature_name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type GrantMap = Record<string, boolean>; // key = `${feature_id}:${role_id}`

type Banner = { ok: boolean; msg: string } | null;
const grantKey = (fId: string, rId: string) => `${fId}:${rId}`;

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function ItemPermissionsBoard({
  roles,
  features,
  grants,
  canEdit,
}: {
  roles: RoleRow[];
  features: FeatureRow[];
  grants: GrantMap;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<Banner>(null);
  const [draft, setDraft] = useState<GrantMap>({});
  const [pending, startTransition] = useTransition();

  // Modal state
  const [roleModal, setRoleModal] = useState<RoleRow | "new" | null>(null);
  const [featureModal, setFeatureModal] = useState<FeatureRow | "new" | null>(
    null,
  );

  // 重置 draft 當 server 回傳的 grants 變了（例如 router.refresh 後）
  const grantsKey = useMemo(
    () =>
      Object.keys(grants)
        .sort()
        .map((k) => `${k}=${grants[k] ? 1 : 0}`)
        .join(","),
    [grants],
  );
  useEffect(() => {
    setDraft({});
  }, [grantsKey]);

  // banner auto-dismiss
  useEffect(() => {
    if (!banner || !banner.ok) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  function isGranted(fId: string, rId: string): boolean {
    const k = grantKey(fId, rId);
    if (k in draft) return draft[k];
    return !!grants[k];
  }
  function isDirty(fId: string, rId: string): boolean {
    const k = grantKey(fId, rId);
    return k in draft && draft[k] !== !!grants[k];
  }
  function toggle(fId: string, rId: string) {
    if (!canEdit) return;
    const k = grantKey(fId, rId);
    const next = !isGranted(fId, rId);
    setDraft((d) => {
      const out = { ...d };
      if (next === !!grants[k]) delete out[k];
      else out[k] = next;
      return out;
    });
  }

  const dirtyPatches: GrantPatch[] = useMemo(() => {
    const out: GrantPatch[] = [];
    for (const k of Object.keys(draft)) {
      if (draft[k] === !!grants[k]) continue;
      const [feature_id, role_id] = k.split(":");
      out.push({ feature_id, role_id, granted: draft[k] });
    }
    return out;
  }, [draft, grants]);

  function onSaveAll() {
    if (dirtyPatches.length === 0) {
      setBanner({ ok: false, msg: "沒有要儲存的變更" });
      return;
    }
    startTransition(async () => {
      const res = await bulkSaveGrantsAction(dirtyPatches);
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 已儲存 ${res.data.updated} 個權限變更` });
        setDraft({});
        router.refresh();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function onResetAll() {
    setDraft({});
    setBanner(null);
  }

  // 行操作 helpers（整列勾／整列清）
  function rowAllGranted(featureId: string): boolean {
    return roles.every((r) => isGranted(featureId, r.id));
  }
  function setRowAll(featureId: string, granted: boolean) {
    if (!canEdit) return;
    setDraft((d) => {
      const out = { ...d };
      for (const r of roles) {
        const k = grantKey(featureId, r.id);
        if (granted === !!grants[k]) delete out[k];
        else out[k] = granted;
      }
      return out;
    });
  }
  function colAllGranted(roleId: string): boolean {
    return features.every((f) => isGranted(f.id, roleId));
  }
  function setColAll(roleId: string, granted: boolean) {
    if (!canEdit) return;
    setDraft((d) => {
      const out = { ...d };
      for (const f of features) {
        const k = grantKey(f.id, roleId);
        if (granted === !!grants[k]) delete out[k];
        else out[k] = granted;
      }
      return out;
    });
  }

  // 群組分組
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { code: string; name: string; sort: number; features: FeatureRow[] }
    >();
    for (const f of features) {
      const g = map.get(f.group_code);
      if (g) g.features.push(f);
      else
        map.set(f.group_code, {
          code: f.group_code,
          name: f.group_name,
          sort: f.group_sort_order,
          features: [f],
        });
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    for (const g of arr) g.features.sort((a, b) => a.sort_order - b.sort_order);
    return arr;
  }, [features]);

  const hasDirty = dirtyPatches.length > 0;

  return (
    <main className="px-6 py-6 space-y-5 bg-[#F8F7F4] min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            商品管理權限
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            1.3
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          設定各角色對商品資料的新增、修改、刪除、定價權限
        </p>
      </header>

      {banner && (
        <div
          className={`rounded-md px-4 py-2 text-[12px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C7E0AC]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between flex-wrap gap-2">
          <span className="text-[13px] font-semibold text-[#1A1917]">
            🧮 角色權限矩陣
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setFeatureModal("new")}
                  disabled={pending}
                  className="px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
                >
                  ＋ 新增功能
                </button>
                <button
                  type="button"
                  onClick={() => setRoleModal("new")}
                  disabled={pending}
                  className="px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
                >
                  ＋ 新增角色
                </button>
                <button
                  type="button"
                  onClick={onResetAll}
                  disabled={!hasDirty || pending}
                  className="px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  還原
                </button>
                <button
                  type="button"
                  onClick={onSaveAll}
                  disabled={!hasDirty || pending}
                  className={`px-3 h-[26px] rounded text-[11.5px] font-medium ${
                    hasDirty && !pending
                      ? "bg-[#1A3A5C] hover:bg-[#0F2A45] text-white"
                      : "bg-[#F2F2F2] text-[#9A9890] cursor-not-allowed"
                  }`}
                >
                  {pending ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner /> 儲存中⋯
                    </span>
                  ) : hasDirty ? (
                    `儲存設定 (${dirtyPatches.length})`
                  ) : (
                    "儲存設定"
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {features.length === 0 || roles.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[#9A9890]">
            {features.length === 0
              ? "尚無功能，請點「＋ 新增功能」開始建立。"
              : "尚無角色，請點「＋ 新增角色」開始建立。"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8F7F4] border-b border-[#EEECE6]">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#6B6A68] sticky left-0 bg-[#F8F7F4] min-w-[200px] z-10">
                    功能
                  </th>
                  {roles.map((r) => (
                    <th
                      key={r.id}
                      className="px-3 py-2 text-center text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap min-w-[120px]"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[12px] text-[#2C2C2A]">
                          {r.role_name}
                        </span>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                title="本欄全勾"
                                onClick={() => setColAll(r.id, true)}
                                disabled={pending}
                                className="text-[9.5px] text-[#0F6E56] hover:underline disabled:opacity-40"
                              >
                                全勾
                              </button>
                              <span className="text-[9px] text-[#9A9890]">|</span>
                              <button
                                type="button"
                                title="本欄全清"
                                onClick={() => setColAll(r.id, false)}
                                disabled={pending}
                                className="text-[9.5px] text-[#5A5955] hover:underline disabled:opacity-40"
                              >
                                全清
                              </button>
                              <span className="text-[9px] text-[#9A9890]">|</span>
                              <button
                                type="button"
                                title="編輯角色"
                                onClick={() => setRoleModal(r)}
                                disabled={pending}
                                className="text-[9.5px] text-[#185FA5] hover:underline disabled:opacity-40"
                              >
                                編輯
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={pending ? "opacity-60 pointer-events-none" : ""}>
                {groups.map((g) => (
                  <FragmentGroup
                    key={g.code}
                    group={g}
                    roles={roles}
                    canEdit={canEdit}
                    isGranted={isGranted}
                    isDirty={isDirty}
                    toggle={toggle}
                    rowAllGranted={rowAllGranted}
                    setRowAll={setRowAll}
                    onEditFeature={(f) => setFeatureModal(f)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t border-[#EEECE6] bg-[#FAFAF9] text-[11px] text-[#9A9890]">
          💡 提示：黃底代表尚未儲存的變更；可用各欄頂端「全勾／全清」快速切換整欄。
        </div>
      </section>

      {roleModal && canEdit && (
        <RoleEditModal
          role={roleModal === "new" ? null : roleModal}
          onClose={() => setRoleModal(null)}
          onResult={(b) => {
            setBanner(b);
            if (b?.ok) {
              setRoleModal(null);
              router.refresh();
            }
          }}
        />
      )}

      {featureModal && canEdit && (
        <FeatureEditModal
          feature={featureModal === "new" ? null : featureModal}
          existingGroups={Array.from(
            new Map(
              features.map((f) => [
                f.group_code,
                {
                  code: f.group_code,
                  name: f.group_name,
                  sort: f.group_sort_order,
                },
              ]),
            ).values(),
          )}
          onClose={() => setFeatureModal(null)}
          onResult={(b) => {
            setBanner(b);
            if (b?.ok) {
              setFeatureModal(null);
              router.refresh();
            }
          }}
        />
      )}
    </main>
  );
}

function FragmentGroup({
  group,
  roles,
  canEdit,
  isGranted,
  isDirty,
  toggle,
  rowAllGranted,
  setRowAll,
  onEditFeature,
}: {
  group: { code: string; name: string; features: FeatureRow[] };
  roles: RoleRow[];
  canEdit: boolean;
  isGranted: (f: string, r: string) => boolean;
  isDirty: (f: string, r: string) => boolean;
  toggle: (f: string, r: string) => void;
  rowAllGranted: (f: string) => boolean;
  setRowAll: (f: string, granted: boolean) => void;
  onEditFeature: (f: FeatureRow) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={1 + roles.length}
          className="bg-[#F8F7F4] px-3 py-1.5 text-[11px] font-semibold text-[#6B6A68] uppercase tracking-wide"
        >
          {group.name}
          <span className="ml-2 font-mono text-[10px] text-[#9A9890] normal-case">
            {group.code}
          </span>
        </td>
      </tr>
      {group.features.map((f) => (
        <tr
          key={f.id}
          className="border-b border-[#EEECE6] last:border-b-0 hover:bg-[#FAFAF9]"
        >
          <td className="px-3 py-2 text-[12.5px] sticky left-0 bg-white z-[5] hover:bg-[#FAFAF9]">
            <div className="flex items-center gap-2">
              <span className="text-[#2C2C2A]">{f.feature_name}</span>
              <span className="font-mono text-[10px] text-[#9A9890]">
                {f.feature_code}
              </span>
              {canEdit && (
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    title="此列全勾"
                    onClick={() => setRowAll(f.id, !rowAllGranted(f.id))}
                    className="text-[10px] text-[#185FA5] hover:underline"
                  >
                    {rowAllGranted(f.id) ? "全清" : "全勾"}
                  </button>
                  <button
                    type="button"
                    title="編輯功能"
                    onClick={() => onEditFeature(f)}
                    className="text-[10px] text-[#5A5955] hover:underline"
                  >
                    編輯
                  </button>
                </span>
              )}
            </div>
            {f.description && (
              <div className="text-[10.5px] text-[#9A9890] mt-0.5">
                {f.description}
              </div>
            )}
          </td>
          {roles.map((r) => {
            const checked = isGranted(f.id, r.id);
            const dirty = isDirty(f.id, r.id);
            return (
              <td
                key={r.id}
                className={`px-3 py-2 text-center ${dirty ? "bg-[#FFFBEA]" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={checked}
                  onChange={() => toggle(f.id, r.id)}
                  className="w-4 h-4 accent-[#1A3A5C] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Role Edit Modal
// ──────────────────────────────────────────────────────────

function RoleEditModal({
  role,
  onClose,
  onResult,
}: {
  role: RoleRow | null;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState(role?.role_code ?? "");
  const [name, setName] = useState(role?.role_name ?? "");
  const [sort, setSort] = useState(role?.sort_order ?? 99);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!code.trim() || !name.trim()) {
      setErr("代碼與名稱為必填");
      return;
    }
    startTransition(async () => {
      const res = role
        ? await updateRoleAction(role.id, {
            role_code: code,
            role_name: name,
            sort_order: sort,
          })
        : await createRoleAction({
            role_code: code,
            role_name: name,
            sort_order: sort,
          });
      if (res.ok) {
        onResult({ ok: true, msg: role ? "✓ 已更新角色" : "✓ 已新增角色" });
      } else {
        setErr(res.error);
      }
    });
  }

  function onDelete() {
    if (!role) return;
    if (!confirm(`刪除「${role.role_name}」會一併移除所有相關 grant，確定？`))
      return;
    startTransition(async () => {
      const res = await deleteRoleAction(role.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除角色" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <Modal title={role ? `編輯角色：${role.role_name}` : "新增角色"} onClose={onClose}>
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="代碼 *">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toLowerCase().replace(/\s/g, "_"))
              }
              disabled={pending || !!role}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
              placeholder="warehouse"
            />
          </Field>
          <Field label="名稱 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="倉管人員"
            />
          </Field>
          <Field label="排序">
            <input
              type="number"
              value={sort}
              onChange={(e) => setSort(Number(e.target.value) || 0)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
        </div>
        {err && (
          <div className="text-[11.5px] text-[#CC0000] mt-2">{err}</div>
        )}
        <div className="flex justify-between gap-2 pt-3 mt-3 border-t border-[#EEECE6]">
          {role ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="px-2.5 h-[28px] rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[11.5px] hover:bg-[#FAD5D2] disabled:opacity-50"
            >
              刪除角色
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-3 h-[28px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending}
              className="px-3 h-[28px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {pending ? (
                <>
                  <Spinner /> 儲存中⋯
                </>
              ) : role ? (
                "更新"
              ) : (
                "建立"
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────
// Feature Edit Modal
// ──────────────────────────────────────────────────────────

function FeatureEditModal({
  feature,
  existingGroups,
  onClose,
  onResult,
}: {
  feature: FeatureRow | null;
  existingGroups: { code: string; name: string; sort: number }[];
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [groupCode, setGroupCode] = useState(feature?.group_code ?? "");
  const [groupName, setGroupName] = useState(feature?.group_name ?? "");
  const [groupSort, setGroupSort] = useState(feature?.group_sort_order ?? 99);
  const [code, setCode] = useState(feature?.feature_code ?? "");
  const [name, setName] = useState(feature?.feature_name ?? "");
  const [description, setDescription] = useState(feature?.description ?? "");
  const [sort, setSort] = useState(feature?.sort_order ?? 99);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function applyGroupPreset(gc: string) {
    setGroupCode(gc);
    const g = existingGroups.find((x) => x.code === gc);
    if (g) {
      setGroupName(g.name);
      setGroupSort(g.sort);
    }
  }

  function onSubmit() {
    setErr(null);
    if (!groupCode.trim() || !groupName.trim()) {
      setErr("群組代碼與名稱為必填");
      return;
    }
    if (!code.trim() || !name.trim()) {
      setErr("功能代碼與名稱為必填");
      return;
    }
    startTransition(async () => {
      const payload = {
        group_code: groupCode,
        group_name: groupName,
        group_sort_order: groupSort,
        feature_code: code,
        feature_name: name,
        description,
        sort_order: sort,
      };
      const res = feature
        ? await updateFeatureAction(feature.id, payload)
        : await createFeatureAction(payload);
      if (res.ok) {
        onResult({ ok: true, msg: feature ? "✓ 已更新功能" : "✓ 已新增功能" });
      } else {
        setErr(res.error);
      }
    });
  }

  function onDelete() {
    if (!feature) return;
    if (!confirm(`刪除「${feature.feature_name}」會一併移除所有 grant，確定？`))
      return;
    startTransition(async () => {
      const res = await deleteFeatureAction(feature.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除功能" });
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <Modal
      title={feature ? `編輯功能：${feature.feature_name}` : "新增功能"}
      onClose={onClose}
    >
      <div className={pending ? "opacity-60 pointer-events-none" : ""}>
        <div className="text-[11px] font-semibold text-[#6B6A68] mb-1">
          所屬群組
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <Field label="群組代碼 *">
            <select
              value={
                existingGroups.some((g) => g.code === groupCode)
                  ? groupCode
                  : "__custom"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom") {
                  setGroupCode("");
                  setGroupName("");
                  setGroupSort(99);
                } else {
                  applyGroupPreset(v);
                }
              }}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="__custom">— 自訂新群組 —</option>
              {existingGroups.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}（{g.code}）
                </option>
              ))}
            </select>
          </Field>
          <Field label="自訂代碼">
            <input
              value={groupCode}
              onChange={(e) =>
                setGroupCode(e.target.value.toLowerCase().replace(/\s/g, "_"))
              }
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
              placeholder="basic / pricing / serial..."
            />
          </Field>
          <Field label="群組名稱 *">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="商品基礎資料"
            />
          </Field>
        </div>

        <div className="text-[11px] font-semibold text-[#6B6A68] mb-1">功能</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="代碼 *">
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toLowerCase().replace(/\s/g, "_"))
              }
              disabled={pending || !!feature}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
              placeholder="view_list"
            />
          </Field>
          <Field label="名稱 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
              placeholder="查看商品清單"
            />
          </Field>
          <Field label="排序（功能）">
            <input
              type="number"
              value={sort}
              onChange={(e) => setSort(Number(e.target.value) || 0)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <Field label="排序（群組）">
            <input
              type="number"
              value={groupSort}
              onChange={(e) => setGroupSort(Number(e.target.value) || 0)}
              disabled={pending}
              className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </Field>
          <div className="col-span-2">
            <Field label="說明">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="例：包含進口商品的單價設定"
              />
            </Field>
          </div>
        </div>
        {err && (
          <div className="text-[11.5px] text-[#CC0000] mt-2">{err}</div>
        )}
        <div className="flex justify-between gap-2 pt-3 mt-3 border-t border-[#EEECE6]">
          {feature ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="px-2.5 h-[28px] rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[11.5px] hover:bg-[#FAD5D2] disabled:opacity-50"
            >
              刪除功能
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-3 h-[28px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending}
              className="px-3 h-[28px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {pending ? (
                <>
                  <Spinner /> 儲存中⋯
                </>
              ) : feature ? (
                "更新"
              ) : (
                "建立"
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#1A1917]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-full max-w-[600px] max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1A1917]">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium text-[#9A9890]">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
