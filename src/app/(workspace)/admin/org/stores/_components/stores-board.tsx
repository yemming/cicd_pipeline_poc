"use client";

import { useMemo, useState, useTransition } from "react";

import {
  createStoreAction,
  updateStoreAction,
  deleteStoreAction,
} from "@/lib/rbac/org-actions";
import { Modal, ModalFooter, Field } from "../../groups/_components/groups-board";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Row = {
  id: string;
  brand_id: string;
  group_id: string | null;
  parent_id: string | null;
  type: string;
  level: number;
  code: string;
  name: string;
  short_name: string | null;
  is_active: boolean;
  created_at: string;
  brand_ids: string[];
};

type Brand = { id: string; name: string };
type Group = { id: string; name: string };

const storeColumns: DataGridColumn<Row>[] = [
  {
    id: "code",
    header: "店碼",
    width: 160,
    hideable: false,
    cell: (r) => <span className="font-mono">{r.code}</span>,
    exportValue: (r) => r.code,
    sortValue: (r) => r.code,
  },
  {
    id: "name",
    header: "店名",
    width: 220,
    cell: (r) => (
      <span className="font-medium">
        {r.name}
        {r.short_name && (
          <span className="text-[10.5px] text-[#9A9890] ml-1.5">({r.short_name})</span>
        )}
      </span>
    ),
    exportValue: (r) => r.name + (r.short_name ? ` (${r.short_name})` : ""),
    sortValue: (r) => r.name,
  },
  {
    id: "type",
    header: "類型",
    width: 100,
    cell: (r) => (
      <span
        className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
          r.type === "region"
            ? "bg-[#FDF3E3] text-[#854F0B]"
            : "bg-[#EAF4FB] text-[#185FA5]"
        }`}
      >
        {r.type === "region" ? "區域 / HQ" : "門店"}
      </span>
    ),
    exportValue: (r) => (r.type === "region" ? "區域 / HQ" : "門店"),
    sortValue: (r) => r.type,
  },
  {
    id: "brand_id",
    header: "主品牌",
    width: 100,
    cell: (r) => <span className="font-mono">{r.brand_id}</span>,
    exportValue: (r) => r.brand_id,
    sortValue: (r) => r.brand_id,
  },
  {
    id: "group_id",
    header: "集團",
    width: 100,
    cell: (r) => <span className="font-mono text-[#5A5955]">{r.group_id ?? "—"}</span>,
    exportValue: (r) => r.group_id ?? "",
    sortValue: (r) => r.group_id ?? "",
  },
  {
    id: "additional_brands",
    header: "附加品牌",
    width: 180,
    sortable: false,
    cell: (r) => {
      const additional = r.brand_ids.filter((b) => b !== r.brand_id);
      return additional.length === 0 ? (
        <span className="text-[#9A9890]">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {additional.map((b) => (
            <span
              key={b}
              className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[10.5px] font-mono"
            >
              {b}
            </span>
          ))}
        </div>
      );
    },
    exportValue: (r) => r.brand_ids.filter((b) => b !== r.brand_id).join(","),
  },
  {
    id: "is_active",
    header: "狀態",
    width: 80,
    cell: (r) => (
      <span
        className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
          r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
        }`}
      >
        {r.is_active ? "啟用" : "停用"}
      </span>
    ),
    exportValue: (r) => (r.is_active ? "啟用" : "停用"),
    sortValue: (r) => (r.is_active ? 1 : 0),
  },
];

export function StoresBoard({
  rows,
  brands,
  groups,
}: {
  rows: Row[];
  brands: Brand[];
  groups: Group[];
}) {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [filterBrand, setFilterBrand] = useState("");
  const [keyword, setKeyword] = useState("");
  const [showForm, setShowForm] = useState<{ mode: "create" } | { mode: "edit"; row: Row } | null>(null);

  // form state
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [fShort, setFShort] = useState("");
  const [fBrand, setFBrand] = useState(brands[0]?.id ?? "");
  const [fGroup, setFGroup] = useState(groups[0]?.id ?? "default");
  const [fParent, setFParent] = useState<string | "">("");
  const [fType, setFType] = useState<"region" | "store">("store");
  const [fLevel, setFLevel] = useState(2);
  const [fActive, setFActive] = useState(true);
  const [fBrandIds, setFBrandIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterBrand && r.brand_id !== filterBrand) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        if (
          !r.name.toLowerCase().includes(k) &&
          !r.code.toLowerCase().includes(k) &&
          !(r.short_name ?? "").toLowerCase().includes(k)
        )
          return false;
      }
      return true;
    });
  }, [rows, filterBrand, keyword]);

  // 給 parent_id picker 用：同 brand 內的 region 層 (level=1)
  const parentOptions = useMemo(() => {
    return rows.filter((r) => r.brand_id === fBrand && r.type === "region");
  }, [rows, fBrand]);

  const open = (mode: "create" | "edit", row?: Row) => {
    if (mode === "create") {
      setFCode("");
      setFName("");
      setFShort("");
      setFBrand(brands[0]?.id ?? "");
      setFGroup(groups[0]?.id ?? "default");
      setFParent("");
      setFType("store");
      setFLevel(2);
      setFActive(true);
      setFBrandIds(new Set([brands[0]?.id ?? ""].filter(Boolean)));
      setShowForm({ mode: "create" });
    } else if (row) {
      setFCode(row.code);
      setFName(row.name);
      setFShort(row.short_name ?? "");
      setFBrand(row.brand_id);
      setFGroup(row.group_id ?? "default");
      setFParent(row.parent_id ?? "");
      setFType(row.type === "region" ? "region" : "store");
      setFLevel(row.level);
      setFActive(row.is_active);
      setFBrandIds(new Set(row.brand_ids));
      setShowForm({ mode: "edit", row });
    }
  };

  const submit = () => {
    startTransition(async () => {
      const brandIdsArr = [...fBrandIds];
      if (showForm?.mode === "create") {
        const res = await createStoreAction({
          code: fCode,
          name: fName,
          short_name: fShort,
          brand_id: fBrand,
          group_id: fGroup,
          parent_id: fParent || null,
          type: fType,
          level: fLevel,
          brand_ids: brandIdsArr,
        });
        if (!res.ok) return flash(false, res.error);
        flash(true, "✓ 已建立");
      } else if (showForm?.mode === "edit") {
        const res = await updateStoreAction(showForm.row.id, {
          code: fCode,
          name: fName,
          short_name: fShort,
          brand_id: fBrand,
          group_id: fGroup,
          parent_id: fParent || null,
          is_active: fActive,
          brand_ids: brandIdsArr,
        });
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
      const res = await deleteStoreAction(row.id);
      if (!res.ok) return flash(false, res.error);
      flash(true, "✓ 已刪除");
      setTimeout(() => window.location.reload(), 600);
    });
  };

  const toggleBrandId = (b: string) => {
    const next = new Set(fBrandIds);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    setFBrandIds(next);
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

      {/* Filter */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">主品牌</label>
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
            >
              <option value="">全部</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="店名 / 店碼 / 簡稱"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-[240px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                setFilterBrand("");
                setKeyword("");
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => open("create")}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
            >
              ＋ 新增門店
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆 / 顯示 <b>{filtered.length}</b>
        </span>
      </div>

      <DataGrid<Row>
        columns={storeColumns}
        data={filtered}
        rowKey={(r) => r.id}
        persistKey="admin/org/stores"
        exportFileName="stores"
        emptyMessage="沒有符合條件的門店"
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
          title={
            showForm.mode === "create"
              ? "新增門店 / 區域"
              : `編輯 — ${showForm.row.code} ${showForm.row.name}`
          }
          onClose={() => setShowForm(null)}
        >
          <div className="space-y-3 px-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <Field label="店碼" required>
                <input
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value.toUpperCase())}
                  placeholder="例：DUC_TPE_NEIHU"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full font-mono"
                />
              </Field>
              <Field label="類型" required>
                <select
                  value={fType}
                  onChange={(e) => {
                    const t = e.target.value as "region" | "store";
                    setFType(t);
                    setFLevel(t === "region" ? 1 : 2);
                  }}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
                >
                  <option value="region">區域 / HQ（level 1）</option>
                  <option value="store">門店（level 2）</option>
                </select>
              </Field>
            </div>
            <Field label="店名" required>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="例：Ducati Taipei (內湖)"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
            <Field label="簡稱">
              <input
                value={fShort}
                onChange={(e) => setFShort(e.target.value)}
                placeholder="例：內湖"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="主品牌" required>
                <select
                  value={fBrand}
                  onChange={(e) => {
                    setFBrand(e.target.value);
                    // 自動把主 brand 加進 brand_ids
                    const next = new Set(fBrandIds);
                    next.add(e.target.value);
                    setFBrandIds(next);
                  }}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="所屬集團" required>
                <select
                  value={fGroup}
                  onChange={(e) => setFGroup(e.target.value)}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.id})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {fType === "store" && (
              <Field label="上層區域 / HQ（選）">
                <select
                  value={fParent}
                  onChange={(e) => setFParent(e.target.value)}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
                >
                  <option value="">— 直接掛在 brand 下 —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="附加掛載品牌（複合店勾選；主品牌已自動掛）">
              <div className="border border-[#D5D3CB] rounded p-2 max-h-[160px] overflow-y-auto space-y-1">
                {brands.map((b) => (
                  <label
                    key={b.id}
                    className={`flex items-center gap-2 px-1.5 py-0.5 rounded ${
                      b.id === fBrand
                        ? "bg-[#EAF4FB] cursor-not-allowed opacity-70"
                        : "cursor-pointer hover:bg-[#F8F7F4]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={fBrandIds.has(b.id)}
                      disabled={b.id === fBrand}
                      onChange={() => toggleBrandId(b.id)}
                      className="w-4 h-4 accent-[#0F6E56]"
                    />
                    <span className="text-[12px]">{b.name}</span>
                    <span className="text-[10.5px] text-[#9A9890] font-mono ml-auto">{b.id}</span>
                    {b.id === fBrand && (
                      <span className="text-[10px] px-1 rounded bg-[#1A3A5C] text-white">主</span>
                    )}
                  </label>
                ))}
              </div>
            </Field>
            {showForm.mode === "edit" && (
              <Field label="狀態">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fActive}
                    onChange={(e) => setFActive(e.target.checked)}
                    className="w-4 h-4 accent-[#0F6E56]"
                  />
                  <span className="text-[12px]">啟用</span>
                </label>
              </Field>
            )}
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
          title="確定刪除？"
          message={`確定刪除「${confirmDelete.name}」？下層子節點與授權需先清除。`}
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
