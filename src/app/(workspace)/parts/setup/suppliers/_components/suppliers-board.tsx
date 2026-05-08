"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSupplierAction,
  deleteSupplierAction,
  updateSupplierAction,
  type SupplierInput,
} from "@/lib/parts-setup/supplier-actions";

export type SupplierRow = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  primary_contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  default_currency: string | null;
  notes: string | null;
  is_active: boolean;
};

type Banner = { ok: boolean; msg: string } | null;

const TYPE_LABEL: Record<string, string> = {
  oem: "原廠",
  distributor: "經銷商",
  parts: "零件商",
  service: "服務",
  other: "其他",
};

export function SuppliersBoard({
  rows,
  canEdit,
}: {
  rows: SupplierRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<SupplierInput>({
    code: "",
    name: "",
    type: "parts",
    default_currency: "TWD",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SupplierRow | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const create = () => {
    startTransition(async () => {
      const res = await createSupplierAction(draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增供應商" });
        setDraft({ code: "", name: "", type: "parts", default_currency: "TWD" });
        setShowCreate(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const startEdit = (r: SupplierRow) => {
    setEditId(r.id);
    setEditDraft({ ...r });
  };

  const saveEdit = () => {
    if (!editId || !editDraft) return;
    startTransition(async () => {
      const res = await updateSupplierAction(editId, {
        code: editDraft.code,
        name: editDraft.name,
        type: editDraft.type ?? "",
        primary_contact: editDraft.primary_contact ?? "",
        phone: editDraft.phone ?? "",
        email: editDraft.email ?? "",
        address: editDraft.address ?? "",
        tax_id: editDraft.tax_id ?? "",
        payment_terms: editDraft.payment_terms ?? "",
        default_currency: editDraft.default_currency ?? "TWD",
        notes: editDraft.notes ?? "",
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

  const remove = (id: string, name: string) => {
    if (!window.confirm(`停用供應商「${name}」？`)) return;
    startTransition(async () => {
      const res = await deleteSupplierAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已停用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const inputClass = "h-7 border border-[#DADADA] rounded px-2 text-[12px] w-full";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">供應商資訊</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          02.1
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`共 ${rows.length} 筆 · ${rows.filter((r) => r.is_active).length} 啟用中`}
        </span>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setShowCreate(!showCreate)}
          className="ml-auto px-3 py-1.5 text-[12.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
        >
          ＋ 新增供應商
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
          <h2 className="font-semibold text-[13px] mb-3">新增供應商</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <input
              placeholder="代碼*"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="名稱*"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
            <select
              value={draft.type ?? "parts"}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              className={inputClass}
            >
              <option value="oem">原廠</option>
              <option value="distributor">經銷商</option>
              <option value="parts">零件商</option>
              <option value="service">服務</option>
              <option value="other">其他</option>
            </select>
            <input
              placeholder="聯絡人"
              value={draft.primary_contact ?? ""}
              onChange={(e) => setDraft({ ...draft, primary_contact: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="電話"
              value={draft.phone ?? ""}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Email"
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="統編"
              value={draft.tax_id ?? ""}
              onChange={(e) => setDraft({ ...draft, tax_id: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="付款條件"
              value={draft.payment_terms ?? ""}
              onChange={(e) => setDraft({ ...draft, payment_terms: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={create}
              className="px-3 py-1.5 rounded bg-[#0F6E56] text-white text-[12.5px]"
            >
              建立
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 rounded border border-[#DADADA] text-[12.5px]"
            >
              取消
            </button>
          </div>
        </section>
      ) : null}

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">代碼</th>
                <th className="px-3 py-2 text-left">名稱</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-left">聯絡人</th>
                <th className="px-3 py-2 text-left">電話</th>
                <th className="px-3 py-2 text-left">付款條件</th>
                <th className="px-3 py-2 text-left">幣別</th>
                <th className="px-3 py-2 text-left">啟用</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={editId === r.id ? "bg-[#FFFBEA]" : ""}>
                  {editId === r.id && editDraft ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.code}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, code: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, name: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.type ?? ""}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, type: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.primary_contact ?? ""}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              primary_contact: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.phone ?? ""}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, phone: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.payment_terms ?? ""}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, payment_terms: e.target.value })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.default_currency ?? "TWD"}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              default_currency: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={editDraft.is_active}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, is_active: e.target.checked })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 space-x-1">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="px-2 py-1 rounded bg-[#0F6E56] text-white text-[11.5px]"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(null);
                            setEditDraft(null);
                          }}
                          className="px-2 py-1 rounded border border-[#DADADA] text-[11.5px]"
                        >
                          取消
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono">{r.code}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">
                        {TYPE_LABEL[r.type ?? ""] ?? r.type ?? "—"}
                      </td>
                      <td className="px-3 py-2">{r.primary_contact ?? "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.phone ?? "—"}</td>
                      <td className="px-3 py-2">{r.payment_terms ?? "—"}</td>
                      <td className="px-3 py-2">{r.default_currency ?? "TWD"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] ${
                            r.is_active
                              ? "bg-[#EAF3DE] text-[#3B6D11]"
                              : "bg-[#F0F0F0] text-[#444]"
                          }`}
                        >
                          {r.is_active ? "啟用" : "停用"}
                        </span>
                      </td>
                      <td className="px-3 py-2 space-x-1">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => startEdit(r)}
                          className="px-2 py-1 rounded border border-[#DADADA] text-[11.5px] disabled:opacity-50"
                        >
                          編輯
                        </button>
                        {r.is_active ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => remove(r.id, r.name)}
                            className="px-2 py-1 rounded border border-[#CC0000] text-[#CC0000] text-[11.5px] disabled:opacity-50"
                          >
                            停用
                          </button>
                        ) : null}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#888]">
                    尚無供應商資料
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
