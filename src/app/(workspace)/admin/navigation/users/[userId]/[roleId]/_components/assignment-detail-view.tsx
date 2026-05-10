"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  bulkCreateUserAssignmentsAction,
  deleteUserAssignmentAction,
  revokeUserRoleScopeAction,
} from "@/lib/rbac/admin-actions";

type Brand = { id: string; name: string };
type Group = { id: string; name: string };
type Store = { id: string; name: string; brand_id: string; group_id: string | null };
type Role = { id: string; name: string; description: string | null };

type ScopeItem = {
  id: string; // user_assignments.id
  scope_id: string;
  granted_at: string;
  notes: string | null;
};

const LIST_HREF = "/admin/navigation?tab=users";

export function AssignmentDetailView({
  mode: initialMode,
  email,
  userId,
  role,
  granted,
  groups,
  brands,
  stores,
  allRoles,
}: {
  /** "view" = 既有 (user,role)；"create" = /admin/navigation/users/new */
  mode: "view" | "create";
  email: string | null;
  userId: string | null;
  role: Role | null;
  granted: {
    groups: ScopeItem[];
    brands: ScopeItem[];
    stores: ScopeItem[];
  };
  groups: Group[];
  brands: Brand[];
  stores: Store[];
  allRoles: Role[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // Create mode form
  const [formUserId, setFormUserId] = useState(userId ?? "");
  const [formRoleId, setFormRoleId] = useState(role?.id ?? allRoles[0]?.id ?? "viewer");

  // 加入新作用域 picker（view + edit + create 共用）
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());
  const [pickedBrands, setPickedBrands] = useState<Set<string>>(new Set());
  const [pickedStores, setPickedStores] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  // 已授予 scope_id 集合（view/edit 中要把這些從 picker 排除掉）
  const grantedGroupIds = new Set(granted.groups.map((g) => g.scope_id));
  const grantedBrandIds = new Set(granted.brands.map((b) => b.scope_id));
  const grantedStoreIds = new Set(granted.stores.map((s) => s.scope_id));

  const toggle = (set: Set<string>, id: string, fn: (n: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    fn(next);
  };

  const totalPicked = pickedGroups.size + pickedBrands.size + pickedStores.size;

  const submitCreate = () => {
    if (!formUserId.trim()) return flash(false, "請填 user_id");
    if (totalPicked === 0) return flash(false, "至少勾選一個作用域");
    startTransition(async () => {
      const res = await bulkCreateUserAssignmentsAction({
        user_id: formUserId.trim(),
        role_id: formRoleId,
        scopes: [
          ...[...pickedGroups].map((id) => ({ scope_type: "group" as const, scope_id: id })),
          ...[...pickedBrands].map((id) => ({ scope_type: "brand" as const, scope_id: id })),
          ...[...pickedStores].map((id) => ({ scope_type: "store" as const, scope_id: id })),
        ],
        notes: notes || null,
      });
      if (!res.ok) return flash(false, `儲存失敗：${res.error}`);
      flash(true, `✓ 已建立 ${res.data.inserted} 筆，跳轉中…`);
      setTimeout(
        () =>
          router.push(
            `/admin/navigation/users/${encodeURIComponent(formUserId.trim())}/${encodeURIComponent(formRoleId)}`,
          ),
        700,
      );
    });
  };

  const submitAdd = () => {
    if (!userId || !role) return;
    if (totalPicked === 0) return flash(false, "至少勾選一個作用域");
    startTransition(async () => {
      const res = await bulkCreateUserAssignmentsAction({
        user_id: userId,
        role_id: role.id,
        scopes: [
          ...[...pickedGroups].map((id) => ({ scope_type: "group" as const, scope_id: id })),
          ...[...pickedBrands].map((id) => ({ scope_type: "brand" as const, scope_id: id })),
          ...[...pickedStores].map((id) => ({ scope_type: "store" as const, scope_id: id })),
        ],
        notes: notes || null,
      });
      if (!res.ok) return flash(false, `儲存失敗：${res.error}`);
      flash(true, `✓ 已加入 ${res.data.inserted} 筆，重整中…`);
      setPickedGroups(new Set());
      setPickedBrands(new Set());
      setPickedStores(new Set());
      setNotes("");
      setMode("view");
      setTimeout(() => router.refresh(), 600);
    });
  };

  const revokeOne = (id: string) => {
    startTransition(async () => {
      const res = await deleteUserAssignmentAction(id);
      if (!res.ok) return flash(false, `撤銷失敗：${res.error}`);
      flash(true, "✓ 已撤銷");
      setTimeout(() => router.refresh(), 400);
    });
  };

  const revokeWhole = () => {
    if (!userId || !role) return;
    if (
      !confirm(
        `確定撤銷 ${email ?? userId} 的所有 ${role.name} 授權？\n會一併刪除 ${
          granted.groups.length + granted.brands.length + granted.stores.length
        } 筆作用域。`,
      )
    )
      return;
    startTransition(async () => {
      // 三個 scope_type 各刪一次
      const results = await Promise.all([
        revokeUserRoleScopeAction(userId, role.id, "group"),
        revokeUserRoleScopeAction(userId, role.id, "brand"),
        revokeUserRoleScopeAction(userId, role.id, "store"),
      ]);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) return flash(false, `刪除失敗：${failed.error}`);
      flash(true, "✓ 已全數撤銷，返回列表…");
      setTimeout(() => router.push(LIST_HREF), 600);
    });
  };

  const newCount = totalPicked;
  const grantedCount =
    granted.groups.length + granted.brands.length + granted.stores.length;

  // ─────────── render ───────────

  const titleEmail = mode === "create" ? "（新授權）" : email ?? "(unknown)";
  const titleUserId = mode === "create" ? "尚未指定 user" : userId ?? "—";
  const roleName = mode === "create" ? "尚未選 role" : role?.name ?? formRoleId;
  const roleId = mode === "create" ? formRoleId : role?.id ?? "—";

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

      {/* 1) Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_HREF} className="hover:text-[#185FA5]">
            使用者授權
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono truncate max-w-[280px]">
            {mode === "create" ? "新增授權" : `${email ?? userId} / ${role?.id ?? "—"}`}
          </span>
          {mode === "edit" && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10.5px] bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10.5px] bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && (
            <>
              <Link
                href={LIST_HREF}
                className="h-[30px] px-4 rounded-full text-[12px] flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href="/admin/navigation/users/new"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] flex items-center shadow-sm"
              >
                新增
              </Link>
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
              >
                修改
              </button>
              <button
                type="button"
                onClick={revokeWhole}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                撤銷整列
              </button>
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPickedGroups(new Set());
                  setPickedBrands(new Set());
                  setPickedStores(new Set());
                  setNotes("");
                  setMode("view");
                }}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={pending || newCount === 0}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "儲存中⋯" : `儲存變更（+${newCount}）`}
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link
                href={LIST_HREF}
                className="h-[30px] px-4 rounded-full text-[12px] flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submitCreate}
                disabled={pending || newCount === 0 || !formUserId.trim()}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2) Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">USER ASSIGNMENT</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {titleEmail} <span className="text-[#9A9890] mx-1">/</span> {roleName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955] truncate max-w-[260px]">
                  {titleUserId}
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px] font-medium font-mono">
                  {roleId}
                </span>
                {mode !== "create" && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11] text-[11px] font-medium">
                    已授予 {grantedCount} 個作用域
                  </span>
                )}
              </div>
            </div>
          </div>

          {mode === "create" ? (
            <div className="shrink-0 w-[260px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] p-3 flex flex-col gap-2">
              <Field label="User ID (UUID)" required>
                <input
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  placeholder="auth.users.id"
                  className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] w-full font-mono"
                />
              </Field>
              <Field label="Role">
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="h-[28px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] w-full"
                >
                  {allRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="shrink-0 w-[260px] bg-[#FBFAF7] rounded-lg p-3 flex flex-col gap-1 text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-[#9A9890]">集團</span>
                <span className="font-medium">{granted.groups.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9A9890]">品牌</span>
                <span className="font-medium">{granted.brands.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9A9890]">門店</span>
                <span className="font-medium">{granted.stores.length}</span>
              </div>
              <div className="border-t border-[#EEECE6] my-1" />
              <div className="flex justify-between">
                <span className="text-[#5A5955]">合計作用域</span>
                <span className="font-semibold text-[#2C2C2A]">{grantedCount}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 3) ▼ 已授予作用域 — view / edit 有資料才顯示 */}
      {mode !== "create" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 已授予作用域</span>
            {mode === "edit" && (
              <span className="ml-2 text-[11.5px] text-[#9A9890]">
                點 chip 上的 ✕ 可單獨撤銷
              </span>
            )}
          </header>
          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScopeColumn
              title="集團"
              palette="amber"
              items={granted.groups}
              labelMap={Object.fromEntries(groups.map((g) => [g.id, g.name]))}
              canRevoke={mode === "edit"}
              onRevoke={revokeOne}
              pending={pending}
            />
            <ScopeColumn
              title="品牌"
              palette="blue"
              items={granted.brands}
              labelMap={Object.fromEntries(brands.map((b) => [b.id, b.name]))}
              canRevoke={mode === "edit"}
              onRevoke={revokeOne}
              pending={pending}
            />
            <ScopeColumn
              title="門店"
              palette="green"
              items={granted.stores}
              labelMap={Object.fromEntries(stores.map((s) => [s.id, s.name]))}
              canRevoke={mode === "edit"}
              onRevoke={revokeOne}
              pending={pending}
            />
          </div>
        </section>
      )}

      {/* 4) ▼ 加入新作用域 — edit / create 才顯示 */}
      {(mode === "edit" || mode === "create") && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 加入新作用域</span>
            <span className="text-[11.5px] text-[#9A9890]">
              一次可勾多個；儲存時批次寫入
            </span>
            <span className="ml-auto text-[11.5px] text-[#185FA5]">
              已選 <b>{newCount}</b> 個
            </span>
          </header>
          <div className="px-4 py-4 space-y-4">
            <PickerSection
              title="集團"
              palette="amber"
              options={groups
                .filter((g) => !grantedGroupIds.has(g.id))
                .map((g) => ({ id: g.id, label: g.name, sub: g.id }))}
              picked={pickedGroups}
              onToggle={(id) => toggle(pickedGroups, id, setPickedGroups)}
              empty="所有集團都已授予"
            />
            <PickerSection
              title="品牌"
              palette="blue"
              options={brands
                .filter((b) => !grantedBrandIds.has(b.id))
                .map((b) => ({ id: b.id, label: b.name, sub: b.id }))}
              picked={pickedBrands}
              onToggle={(id) => toggle(pickedBrands, id, setPickedBrands)}
              empty="所有品牌都已授予"
            />
            <StorePicker
              brands={brands}
              stores={stores.filter((s) => !grantedStoreIds.has(s.id))}
              picked={pickedStores}
              onToggle={(id) => toggle(pickedStores, id, setPickedStores)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">備註（選）</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="授權原因 / 期限"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ───────────────────── 小元件 ─────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10.5px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}

function paletteFor(p: "amber" | "blue" | "green"): { chip: string; head: string } {
  if (p === "amber")
    return {
      chip: "bg-[#FDF3E3] text-[#854F0B] border-[#F0DDB6]",
      head: "text-[#854F0B]",
    };
  if (p === "blue")
    return {
      chip: "bg-[#EAF4FB] text-[#185FA5] border-[#CDDFEC]",
      head: "text-[#185FA5]",
    };
  return {
    chip: "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]",
    head: "text-[#3B6D11]",
  };
}

function ScopeColumn({
  title,
  palette,
  items,
  labelMap,
  canRevoke,
  onRevoke,
  pending,
}: {
  title: string;
  palette: "amber" | "blue" | "green";
  items: ScopeItem[];
  labelMap: Record<string, string>;
  canRevoke: boolean;
  onRevoke: (id: string) => void;
  pending: boolean;
}) {
  const p = paletteFor(palette);
  return (
    <div>
      <div className={`text-[11px] font-semibold mb-1.5 ${p.head}`}>
        {title}（{items.length}）
      </div>
      {items.length === 0 ? (
        <div className="text-[11.5px] text-[#9A9890] italic">—</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((it) => (
            <span
              key={it.id}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11.5px] border ${p.chip}`}
              title={it.notes ?? undefined}
            >
              <span className="font-medium">{labelMap[it.scope_id] ?? it.scope_id}</span>
              <span className="font-mono opacity-60">({it.scope_id.slice(0, 8)})</span>
              {canRevoke && (
                <button
                  type="button"
                  onClick={() => onRevoke(it.id)}
                  disabled={pending}
                  className="ml-0.5 hover:text-[#CC0000] disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PickerSection({
  title,
  palette,
  options,
  picked,
  onToggle,
  empty,
}: {
  title: string;
  palette: "amber" | "blue" | "green";
  options: Array<{ id: string; label: string; sub: string }>;
  picked: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  const p = paletteFor(palette);
  return (
    <div>
      <div className={`text-[11px] font-semibold mb-1.5 ${p.head}`}>
        {title}（已選 {picked.size}）
      </div>
      {options.length === 0 ? (
        <div className="text-[11.5px] text-[#9A9890] italic px-2 py-1">{empty}</div>
      ) : (
        <ul className="grid grid-cols-2 lg:grid-cols-3 gap-1">
          {options.map((o) => {
            const checked = picked.has(o.id);
            return (
              <li key={o.id}>
                <label
                  className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer text-[12px] ${
                    checked
                      ? "bg-[#EAF4FB] border-[#185FA5]"
                      : "bg-white border-[#EEECE6] hover:bg-[#F8F7F4]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(o.id)}
                    className="w-4 h-4 accent-[#0F6E56]"
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  <span className="text-[10.5px] text-[#9A9890] font-mono truncate">
                    {o.sub}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StorePicker({
  brands,
  stores,
  picked,
  onToggle,
}: {
  brands: Brand[];
  stores: Store[];
  picked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const byBrand = new Map<string, Store[]>();
  for (const s of stores) {
    const list = byBrand.get(s.brand_id) ?? [];
    list.push(s);
    byBrand.set(s.brand_id, list);
  }
  const brandsWithStores = brands.filter((b) => byBrand.has(b.id));

  return (
    <div>
      <div className="text-[11px] font-semibold mb-1.5 text-[#3B6D11]">
        門店（已選 {picked.size}）
      </div>
      {brandsWithStores.length === 0 ? (
        <div className="text-[11.5px] text-[#9A9890] italic px-2 py-1">所有門店都已授予</div>
      ) : (
        <div className="border border-[#EEECE6] rounded p-2 max-h-[220px] overflow-y-auto space-y-2">
          {brandsWithStores.map((b) => (
            <div key={b.id}>
              <div className="text-[10.5px] font-semibold text-[#185FA5] uppercase tracking-wider mb-1">
                {b.name} <span className="font-mono text-[#9A9890]">({b.id})</span>
              </div>
              <ul className="grid grid-cols-2 lg:grid-cols-3 gap-1 ml-2">
                {byBrand.get(b.id)!.map((s) => {
                  const checked = picked.has(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer text-[12px] ${
                          checked
                            ? "bg-[#EAF4FB] border-[#185FA5]"
                            : "bg-white border-[#EEECE6] hover:bg-[#F8F7F4]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggle(s.id)}
                          className="w-4 h-4 accent-[#0F6E56]"
                        />
                        <span className="flex-1 truncate">{s.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
