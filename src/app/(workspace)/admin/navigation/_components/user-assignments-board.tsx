"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { revokeUserRoleScopeAction } from "@/lib/rbac/admin-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Brand = { id: string; name: string };
type Role = { id: string; name: string; description: string | null };
type Group = { id: string; name: string };
type Store = { id: string; name: string; brand_id: string; group_id: string | null };
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

type GroupedRow = {
  user_id: string;
  email: string | null;
  role_id: string;
  groups: Assignment[];
  brands: Assignment[];
  stores: Assignment[];
};

export function UserAssignmentsBoard({
  brands,
  roles,
  assignments,
  groups,
  stores,
}: {
  brands: Brand[];
  roles: Role[];
  assignments: Assignment[];
  groups: Group[];
  stores: Store[];
}) {
  const router = useRouter();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState<GroupedRow | null>(null);

  // filters
  const [keyword, setKeyword] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  // 把扁平 assignments 折成「(user, role) 一列」
  const grouped = useMemo<GroupedRow[]>(() => {
    const map = new Map<string, GroupedRow>();
    for (const a of assignments) {
      const key = `${a.user_id}::${a.role_id}`;
      let row = map.get(key);
      if (!row) {
        row = {
          user_id: a.user_id,
          email: a.email,
          role_id: a.role_id,
          groups: [],
          brands: [],
          stores: [],
        };
        map.set(key, row);
      }
      if (a.scope_type === "group") row.groups.push(a);
      else if (a.scope_type === "brand") row.brands.push(a);
      else if (a.scope_type === "store") row.stores.push(a);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        (a.email ?? "").localeCompare(b.email ?? "") || a.role_id.localeCompare(b.role_id),
    );
  }, [assignments]);

  const groupLabels = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.id, g.name])),
    [groups],
  );
  const brandLabels = useMemo(
    () => Object.fromEntries(brands.map((b) => [b.id, b.name])),
    [brands],
  );
  const storeLabels = useMemo(
    () => Object.fromEntries(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  const filtered = useMemo(() => {
    return grouped.filter((r) => {
      if (filterRole && r.role_id !== filterRole) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        if (
          !(r.email ?? "").toLowerCase().includes(k) &&
          !r.user_id.toLowerCase().includes(k) &&
          !r.role_id.toLowerCase().includes(k)
        )
          return false;
      }
      return true;
    });
  }, [grouped, filterRole, keyword]);

  const revokeWhole = (row: GroupedRow) => {
    setConfirmRevoke(row);
  };
  const doRevoke = () => {
    if (!confirmRevoke) return;
    const row = confirmRevoke;
    setConfirmRevoke(null);
    startTransition(async () => {
      const results = await Promise.all([
        revokeUserRoleScopeAction(row.user_id, row.role_id, "group"),
        revokeUserRoleScopeAction(row.user_id, row.role_id, "brand"),
        revokeUserRoleScopeAction(row.user_id, row.role_id, "store"),
      ]);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) return flash(false, `撤銷失敗：${failed.error}`);
      flash(true, "✓ 已撤銷，重整中…");
      setTimeout(() => router.refresh(), 600);
    });
  };

  const columns: DataGridColumn<GroupedRow>[] = [
    {
      id: "user",
      header: "使用者",
      width: 260,
      hideable: false,
      cell: (r) => (
        <div>
          <div className="font-medium">{r.email ?? "(unknown)"}</div>
          <div className="text-[10px] text-[#9A9890] font-mono">{r.user_id}</div>
        </div>
      ),
      exportValue: (r) => `${r.email ?? ""} / ${r.user_id}`,
      sortValue: (r) => (r.email ?? r.user_id),
    },
    {
      id: "role_id",
      header: "Role",
      width: 140,
      cell: (r) => (
        <span className="px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px] font-medium font-mono">
          {r.role_id}
        </span>
      ),
      exportValue: (r) => r.role_id,
      sortValue: (r) => r.role_id,
    },
    {
      id: "groups",
      header: "集團",
      width: 180,
      sortable: false,
      cell: (r) => <ScopeChips items={r.groups} labelMap={groupLabels} palette="amber" />,
      exportValue: (r) => r.groups.map((a) => groupLabels[a.scope_id] ?? a.scope_id).join(","),
    },
    {
      id: "brands",
      header: "品牌",
      width: 180,
      sortable: false,
      cell: (r) => <ScopeChips items={r.brands} labelMap={brandLabels} palette="blue" />,
      exportValue: (r) => r.brands.map((a) => brandLabels[a.scope_id] ?? a.scope_id).join(","),
    },
    {
      id: "stores",
      header: "門店",
      width: 220,
      sortable: false,
      cell: (r) => <ScopeChips items={r.stores} labelMap={storeLabels} palette="green" />,
      exportValue: (r) => r.stores.map((a) => storeLabels[a.scope_id] ?? a.scope_id).join(","),
    },
  ];

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
              placeholder="email / user_id / role"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-[260px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] min-w-[160px]"
            >
              <option value="">全部</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setFilterRole("");
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/admin/navigation/users/new"
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] flex items-center"
            >
              ＋ 新增授權
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{grouped.length}</b> 筆 (user × role) 授權，顯示{" "}
          <b>{filtered.length}</b> 筆
        </span>
      </div>

      <DataGrid<GroupedRow>
        columns={columns}
        data={filtered}
        rowKey={(r) => `${r.user_id}::${r.role_id}`}
        persistKey="admin/navigation/user-assignments"
        exportFileName="user-assignments"
        emptyMessage={grouped.length === 0 ? "尚無任何授權" : "沒有符合條件的授權"}
        disabled={pending}
        rowActions={(r) => (
          <>
            <Link
              href={`/admin/navigation/users/${encodeURIComponent(r.user_id)}/${encodeURIComponent(r.role_id)}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center"
            >
              修改
            </Link>
            <button
              type="button"
              onClick={() => revokeWhole(r)}
              disabled={pending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              title="撤銷此 user × role 的整列授權"
            >
              撤銷
            </button>
          </>
        )}
        rowActionsWidth={150}
      />
      {confirmRevoke && (
        <ConfirmDialog
          title="確定撤銷授權？"
          message={`撤銷 ${confirmRevoke.email ?? confirmRevoke.user_id} 的所有「${confirmRevoke.role_id}」授權？會一併刪除 ${confirmRevoke.groups.length + confirmRevoke.brands.length + confirmRevoke.stores.length} 筆作用域。`}
          confirmLabel="確認撤銷"
          variant="danger"
          isPending={pending}
          onConfirm={doRevoke}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}
    </div>
  );
}

function ScopeChips({
  items,
  labelMap,
  palette,
}: {
  items: Assignment[];
  labelMap: Record<string, string>;
  palette: "amber" | "blue" | "green";
}) {
  if (items.length === 0) {
    return <span className="text-[#9A9890]">—</span>;
  }
  const palClass =
    palette === "amber"
      ? "bg-[#FDF3E3] text-[#854F0B]"
      : palette === "blue"
        ? "bg-[#EAF4FB] text-[#185FA5]"
        : "bg-[#EAF3DE] text-[#3B6D11]";
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((a) => (
        <span
          key={a.id}
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${palClass}`}
          title={a.notes ?? undefined}
        >
          {labelMap[a.scope_id] ?? a.scope_id}
        </span>
      ))}
    </div>
  );
}
