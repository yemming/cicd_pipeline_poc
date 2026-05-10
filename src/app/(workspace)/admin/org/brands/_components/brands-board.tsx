"use client";

import { useState, useTransition } from "react";

import {
  createBrandAction,
  updateBrandAction,
  deleteBrandAction,
} from "@/lib/rbac/org-actions";
import { Modal, ModalFooter, Field } from "../../groups/_components/groups-board";

type Row = {
  id: string;
  name: string;
  manufacturer: string | null;
  created_at: string;
  group_ids: string[];
  store_count: number;
};
type Group = { id: string; name: string };

export function BrandsBoard({ rows, groups }: { rows: Row[]; groups: Group[] }) {
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showForm, setShowForm] = useState<{ mode: "create" } | { mode: "edit"; row: Row } | null>(null);

  const [fId, setFId] = useState("");
  const [fName, setFName] = useState("");
  const [fMfg, setFMfg] = useState("");
  const [fGroups, setFGroups] = useState<Set<string>>(new Set());

  const flash = (ok: boolean, msg: string) => {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  };

  const open = (mode: "create" | "edit", row?: Row) => {
    if (mode === "create") {
      setFId("");
      setFName("");
      setFMfg("");
      setFGroups(new Set());
      setShowForm({ mode: "create" });
    } else if (row) {
      setFId(row.id);
      setFName(row.name);
      setFMfg(row.manufacturer ?? "");
      setFGroups(new Set(row.group_ids));
      setShowForm({ mode: "edit", row });
    }
  };

  const submit = () => {
    startTransition(async () => {
      if (showForm?.mode === "create") {
        const res = await createBrandAction({
          id: fId,
          name: fName,
          manufacturer: fMfg,
          group_ids: [...fGroups],
        });
        if (!res.ok) return flash(false, res.error);
        flash(true, "✓ 已建立");
      } else if (showForm?.mode === "edit") {
        const res = await updateBrandAction(showForm.row.id, {
          name: fName,
          manufacturer: fMfg,
          group_ids: [...fGroups],
        });
        if (!res.ok) return flash(false, res.error);
        flash(true, "✓ 已更新");
      }
      setShowForm(null);
      setTimeout(() => window.location.reload(), 600);
    });
  };

  const remove = (row: Row) => {
    if (!confirm(`確定刪除品牌「${row.name}」？`)) return;
    startTransition(async () => {
      const res = await deleteBrandAction(row.id);
      if (!res.ok) return flash(false, res.error);
      flash(true, "✓ 已刪除");
      setTimeout(() => window.location.reload(), 600);
    });
  };

  const toggleGroup = (gid: string) => {
    const next = new Set(fGroups);
    if (next.has(gid)) next.delete(gid);
    else next.add(gid);
    setFGroups(next);
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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 個品牌
        </span>
        <button
          type="button"
          onClick={() => open("create")}
          className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
        >
          ＋ 新增品牌
        </button>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">Brand ID</th>
              <th className="text-left font-medium py-2 px-3">名稱</th>
              <th className="text-left font-medium py-2 px-3">原廠</th>
              <th className="text-left font-medium py-2 px-3">代理集團</th>
              <th className="text-right font-medium py-2 px-3">門店</th>
              <th className="text-right font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[#9A9890] italic">
                  尚無任何品牌
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3 font-mono">{r.id}</td>
                  <td className="py-2 px-3 font-medium">{r.name}</td>
                  <td className="py-2 px-3 text-[#5A5955]">{r.manufacturer || "—"}</td>
                  <td className="py-2 px-3">
                    {r.group_ids.length === 0 ? (
                      <span className="text-[#9A9890] italic">未指定</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.group_ids.map((gid) => (
                          <span
                            key={gid}
                            className="px-1.5 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[10.5px] font-mono"
                          >
                            {gid}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-[#5A5955]">{r.store_count}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="inline-flex gap-1.5">
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
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {showForm && (
        <Modal
          title={showForm.mode === "create" ? "新增品牌" : `編輯品牌 — ${showForm.row.id}`}
          onClose={() => setShowForm(null)}
        >
          <div className="space-y-3 px-4 py-4">
            <Field label="Brand ID" required>
              <input
                value={fId}
                disabled={showForm.mode === "edit"}
                onChange={(e) => setFId(e.target.value)}
                placeholder="例：bmw"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full font-mono disabled:bg-[#F8F7F4] disabled:text-[#9A9890]"
              />
            </Field>
            <Field label="品牌名稱" required>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="例：BMW"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
            <Field label="原廠">
              <input
                value={fMfg}
                onChange={(e) => setFMfg(e.target.value)}
                placeholder="例：BMW Group"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] w-full"
              />
            </Field>
            <Field label="代理集團（多選）">
              <div className="border border-[#D5D3CB] rounded p-2 max-h-[180px] overflow-y-auto space-y-1">
                {groups.length === 0 ? (
                  <span className="text-[11.5px] text-[#9A9890] italic">尚無集團</span>
                ) : (
                  groups.map((g) => (
                    <label
                      key={g.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-[#F8F7F4] px-1.5 py-0.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={fGroups.has(g.id)}
                        onChange={() => toggleGroup(g.id)}
                        className="w-4 h-4 accent-[#0F6E56]"
                      />
                      <span className="text-[12px]">{g.name}</span>
                      <span className="text-[10.5px] text-[#9A9890] font-mono ml-auto">{g.id}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
          </div>
          <ModalFooter
            pending={pending}
            onCancel={() => setShowForm(null)}
            onSubmit={submit}
            submitLabel={showForm.mode === "create" ? "建立" : "儲存變更"}
          />
        </Modal>
      )}
    </div>
  );
}
