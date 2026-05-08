"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createItemAction,
  setItemActiveAction,
  updateItemAction,
  type ItemInput,
} from "@/lib/parts-setup/item-actions";

export type ItemRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
  base_uom: string | null;
  standard_cost: number | null;
  suggested_price: number | null;
  warranty_months: number | null;
  shelf_life_months: number | null;
  default_supplier_id: string | null;
  is_active: boolean;
};

export type SupplierOption = { id: string; code: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

export function ItemsBoard({
  rows,
  suppliers,
  canEdit,
}: {
  rows: ItemRow[];
  suppliers: SupplierOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<ItemInput>({ code: "", name: "", base_uom: "PCS" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ItemRow | null>(null);
  const [filter, setFilter] = useState("");

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const f = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(f) ||
        r.name.toLowerCase().includes(f) ||
        (r.category ?? "").toLowerCase().includes(f),
    );
  }, [rows, filter]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const create = () => {
    startTransition(async () => {
      const res = await createItemAction(draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增料號" });
        setDraft({ code: "", name: "", base_uom: "PCS" });
        setShowCreate(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const saveEdit = () => {
    if (!editId || !editDraft) return;
    startTransition(async () => {
      const res = await updateItemAction(editId, {
        code: editDraft.code,
        name: editDraft.name,
        category: editDraft.category ?? "",
        control_type: editDraft.control_type ?? "",
        base_uom: editDraft.base_uom ?? "PCS",
        standard_cost: editDraft.standard_cost,
        suggested_price: editDraft.suggested_price,
        warranty_months: editDraft.warranty_months,
        shelf_life_months: editDraft.shelf_life_months,
        default_supplier_id: editDraft.default_supplier_id,
        is_active: editDraft.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setEditId(null);
        setEditDraft(null);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleActive = (id: string, next: boolean) => {
    startTransition(async () => {
      const res = await setItemActiveAction(id, next);
      if (res.ok) router.refresh();
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass = "h-7 border border-[#DADADA] rounded px-2 text-[12px] w-full";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">商品基礎資料</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          03.1
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`共 ${rows.length} 筆 · 顯示 ${filteredRows.length}`}
        </span>
        <input
          placeholder="搜尋料號 / 名稱 / 類別"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 border border-[#DADADA] rounded px-2 text-[12px] ml-auto w-[260px]"
        />
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-[12.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
        >
          ＋ 新增料號
        </button>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {showCreate ? (
        <section className={`rounded-md border border-[#0F6E56] bg-[#F5FCF8] p-4 ${lockedClass}`}>
          <h2 className="font-semibold text-[13px] mb-3">新增料號</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="料號*" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={inputClass} />
            <input placeholder="名稱*" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
            <input placeholder="類別" value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputClass} />
            <input placeholder="管控類型 A/B/C" value={draft.control_type ?? ""} onChange={(e) => setDraft({ ...draft, control_type: e.target.value })} className={inputClass} />
            <input placeholder="UOM" value={draft.base_uom ?? "PCS"} onChange={(e) => setDraft({ ...draft, base_uom: e.target.value })} className={inputClass} />
            <input type="number" placeholder="標準成本" value={draft.standard_cost ?? ""} onChange={(e) => setDraft({ ...draft, standard_cost: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
            <input type="number" placeholder="建議售價" value={draft.suggested_price ?? ""} onChange={(e) => setDraft({ ...draft, suggested_price: e.target.value ? Number(e.target.value) : null })} className={inputClass} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={create} className="px-3 py-1.5 rounded bg-[#0F6E56] text-white text-[12.5px]">建立</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded border border-[#DADADA] text-[12.5px]">取消</button>
          </div>
        </section>
      ) : null}

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">料號</th>
                <th className="px-3 py-2 text-left">名稱</th>
                <th className="px-3 py-2 text-left">類別</th>
                <th className="px-3 py-2 text-left">管控</th>
                <th className="px-3 py-2 text-left">UOM</th>
                <th className="px-3 py-2 text-right">標準成本</th>
                <th className="px-3 py-2 text-right">建議售價</th>
                <th className="px-3 py-2 text-left">預設供應商</th>
                <th className="px-3 py-2 text-left">啟用</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className={editId === r.id ? "bg-[#FFFBEA]" : ""}>
                  {editId === r.id && editDraft ? (
                    <>
                      <td className="px-3 py-2"><input value={editDraft.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input value={editDraft.category ?? ""} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input value={editDraft.control_type ?? ""} onChange={(e) => setEditDraft({ ...editDraft, control_type: e.target.value })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input value={editDraft.base_uom ?? "PCS"} onChange={(e) => setEditDraft({ ...editDraft, base_uom: e.target.value })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={editDraft.standard_cost ?? ""} onChange={(e) => setEditDraft({ ...editDraft, standard_cost: e.target.value ? Number(e.target.value) : null })} className={inputClass} /></td>
                      <td className="px-3 py-2"><input type="number" value={editDraft.suggested_price ?? ""} onChange={(e) => setEditDraft({ ...editDraft, suggested_price: e.target.value ? Number(e.target.value) : null })} className={inputClass} /></td>
                      <td className="px-3 py-2">
                        <select value={editDraft.default_supplier_id ?? ""} onChange={(e) => setEditDraft({ ...editDraft, default_supplier_id: e.target.value || null })} className={inputClass}>
                          <option value="">—</option>
                          {suppliers.map((s) => (<option key={s.id} value={s.id}>{`${s.code} ${s.name}`}</option>))}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="checkbox" checked={editDraft.is_active} onChange={(e) => setEditDraft({ ...editDraft, is_active: e.target.checked })} /></td>
                      <td className="px-3 py-2 space-x-1">
                        <button type="button" onClick={saveEdit} className="px-2 py-1 rounded bg-[#0F6E56] text-white text-[11.5px]">儲存</button>
                        <button type="button" onClick={() => { setEditId(null); setEditDraft(null); }} className="px-2 py-1 rounded border border-[#DADADA] text-[11.5px]">取消</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">{r.category ?? "—"}</td>
                      <td className="px-3 py-2">{r.control_type ?? "—"}</td>
                      <td className="px-3 py-2">{r.base_uom ?? "PCS"}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.standard_cost ? Number(r.standard_cost).toLocaleString("en-US") : "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.suggested_price ? Number(r.suggested_price).toLocaleString("en-US") : "—"}</td>
                      <td className="px-3 py-2 text-[11.5px]">{r.default_supplier_id ? supplierMap.get(r.default_supplier_id)?.name ?? "—" : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F0F0F0] text-[#444]"}`}>
                          {r.is_active ? "啟用" : "停用"}
                        </span>
                      </td>
                      <td className="px-3 py-2 space-x-1">
                        <button type="button" disabled={!canEdit} onClick={() => { setEditId(r.id); setEditDraft({ ...r }); }} className="px-2 py-1 rounded border border-[#DADADA] text-[11.5px] disabled:opacity-50">編輯</button>
                        <button type="button" disabled={!canEdit} onClick={() => toggleActive(r.id, !r.is_active)} className="px-2 py-1 rounded border border-[#DADADA] text-[11.5px] disabled:opacity-50">{r.is_active ? "停用" : "啟用"}</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-[#888]">無料號資料</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
