"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

import {
  addRegion,
  updateRegion,
  setRegionActive,
  deleteRegion,
  type OrgRow,
  type AddRegionInput,
} from "@/domain/org";

type Banner = { ok: boolean; msg: string } | null;
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function RegionsBoard({
  rows,
  canEdit,
  filterQ,
  filterStatus,
  loadError,
  autoOpenCreate,
}: {
  rows: OrgRow[];
  canEdit: boolean;
  filterQ: string;
  filterStatus: string;
  loadError: string | null;
  autoOpenCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [formMode, setFormMode] = useState<FormMode>(autoOpenCreate ? { kind: "create" } : { kind: "closed" });
  const [q, setQ] = useState(filterQ);
  const [status, setStatus] = useState(filterStatus);

  const editingRow = useMemo(
    () => (formMode.kind === "edit" ? rows.find((r) => r.id === formMode.id) ?? null : null),
    [formMode, rows],
  );

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    startTransition(() => {
      router.push(`/parts/setup/regions${params.toString() ? `?${params.toString()}` : ""}`);
    });
  }
  function resetFilters() {
    setQ("");
    setStatus("all");
    startTransition(() => router.push("/parts/setup/regions"));
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">銷售區域</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">1.1</span>
        <span className="text-[12px] text-[#9A9890]">組織三層的第一層 — 區域管理</span>
      </header>

      {loadError && (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      )}

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              style={{ width: 220 }}
              placeholder="代碼 / 名稱"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilters}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {pending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setFormMode({ kind: "create" })}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                disabled={pending}
              >
                ＋ 新增區域
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      {/* Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
            <tr>
              <th className="text-left font-medium py-2 px-3">代碼</th>
              <th className="text-left font-medium py-2 px-3">名稱</th>
              <th className="text-left font-medium py-2 px-3">涵蓋說明</th>
              <th className="text-left font-medium py-2 px-3">狀態</th>
              <th className="text-right font-medium py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#9A9890] text-[12px]">
                  尚無區域，請新增。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                <td className="py-2 px-3 font-mono text-[12px]">
                  <Link href={`/parts/setup/regions/${r.id}`} className="text-[#185FA5] hover:underline">
                    {r.code}
                  </Link>
                </td>
                <td className="py-2 px-3 text-[12.5px] text-[#2C2C2A]">{r.name}</td>
                <td className="py-2 px-3 text-[12px] text-[#5A5955]">{r.notes ?? "—"}</td>
                <td className="py-2 px-3">
                  {r.is_active ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right">
                  {canEdit && (
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => setFormMode({ kind: "edit", id: r.id })}
                        disabled={pending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => {
                          startTransition(async () => {
                            const res = await setRegionActive(r.id, !r.is_active);
                            if (res.ok) {
                              showBanner(true, r.is_active ? "✓ 已停用" : "✓ 已啟用");
                              router.refresh();
                            } else {
                              showBanner(false, res.error);
                            }
                          });
                        }}
                        disabled={pending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        {r.is_active ? "停用" : "啟用"}
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`確定刪除區域「${r.name}」？`)) return;
                          startTransition(async () => {
                            const res = await deleteRegion(r.id);
                            if (res.ok) {
                              showBanner(true, "✓ 已刪除");
                              router.refresh();
                            } else {
                              showBanner(false, res.error);
                            }
                          });
                        }}
                        disabled={pending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {formMode.kind !== "closed" && (
        <RegionFormModal
          mode={formMode}
          initial={editingRow}
          onClose={() => setFormMode({ kind: "closed" })}
          onSuccess={(msg) => {
            showBanner(true, msg);
            setFormMode({ kind: "closed" });
            router.refresh();
          }}
          onError={(msg) => showBanner(false, msg)}
        />
      )}

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
    </main>
  );
}

function RegionFormModal({
  mode,
  initial,
  onClose,
  onSuccess,
  onError,
}: {
  mode: FormMode;
  initial: OrgRow | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = mode.kind === "edit";
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const input: AddRegionInput = {
        code: code.trim(),
        name: name.trim(),
        notes: notes.trim() || null,
      };
      const res = isEdit
        ? await updateRegion((mode as { kind: "edit"; id: string }).id, input)
        : await addRegion(input);
      if (res.ok) onSuccess(isEdit ? "✓ 已更新" : "✓ 已建立");
      else onError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg w-[480px] max-w-[90vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
            {isEdit ? "編輯區域" : "新增區域"}
          </h2>
          <button onClick={onClose} className="text-[#9A9890] hover:text-[#5A5955] text-[20px] leading-none">×</button>
        </header>
        <div className={`px-5 py-4 space-y-3 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>區域代碼 *</label>
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="REGION-N" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>區域名稱 *</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="台灣北區" />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>涵蓋說明（縣市）</label>
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="台北市、新北市、基隆、桃園"
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {pending ? (isEdit ? "更新中⋯" : "建立中⋯") : isEdit ? "儲存" : "建立"}
          </button>
        </footer>
      </div>
    </div>
  );
}
