"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addRegion,
  updateRegion,
  setRegionActive,
  deleteRegion,
  type OrgRow,
} from "@/domain/org";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function RegionDetailView({
  region,
  stores,
  canEdit,
  initialMode,
}: {
  region: OrgRow | null;
  stores: OrgRow[];
  canEdit: boolean;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, startTransition] = useTransition();

  // form state
  const [code, setCode] = useState(region?.code ?? "");
  const [name, setName] = useState(region?.name ?? "");
  const [notes, setNotes] = useState(region?.notes ?? "");

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function resetForm(r: OrgRow | null) {
    setCode(r?.code ?? "");
    setName(r?.name ?? "");
    setNotes(r?.notes ?? "");
  }

  function save() {
    startTransition(async () => {
      const input = { code: code.trim(), name: name.trim(), notes: notes.trim() || null };
      if (mode === "create") {
        const res = await addRegion(input);
        if (res.ok) {
          showBanner(true, "✓ 已建立");
          router.push(`/parts/setup/regions/${res.data.id}`);
        } else showBanner(false, res.error);
      } else if (mode === "edit" && region) {
        const res = await updateRegion(region.id, input);
        if (res.ok) {
          showBanner(true, "✓ 已更新");
          setMode("view");
          router.refresh();
        } else showBanner(false, res.error);
      }
    });
  }

  function toggleActive() {
    if (!region) return;
    startTransition(async () => {
      const res = await setRegionActive(region.id, !region.is_active);
      if (res.ok) {
        showBanner(true, region.is_active ? "✓ 已停用" : "✓ 已啟用");
        router.refresh();
      } else showBanner(false, res.error);
    });
  }

  function doDelete() {
    if (!region) return;
    if (!confirm(`確定刪除區域「${region.name}」？`)) return;
    startTransition(async () => {
      const res = await deleteRegion(region.id);
      if (res.ok) {
        showBanner(true, "✓ 已刪除");
        router.push("/parts/setup/regions");
      } else showBanner(false, res.error);
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/regions" className="hover:text-[#185FA5]">銷售區域</Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{mode === "create" ? "新增區域" : region?.code}</span>
          {mode === "edit" && (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">編輯模式</span>
          )}
          {mode === "create" && (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">建立模式</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && region && (
            <>
              <Link
                href="/parts/setup/regions"
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center"
              >
                返回列表
              </Link>
              {canEdit && (
                <>
                  <Link
                    href="/parts/setup/regions/new"
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm flex items-center"
                  >
                    新增
                  </Link>
                  <button
                    onClick={() => { resetForm(region); setMode("edit"); }}
                    disabled={pending}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
                  >
                    修改
                  </button>
                  <button
                    onClick={doDelete}
                    disabled={pending}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                  >
                    刪除
                  </button>
                  <button
                    onClick={toggleActive}
                    disabled={pending}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  >
                    {region.is_active ? "停用" : "啟用"}
                  </button>
                </>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                onClick={() => { resetForm(region); setMode("view"); }}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                onClick={save}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link
                href="/parts/setup/regions"
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm flex items-center"
              >
                取消
              </Link>
              <button
                onClick={save}
                disabled={pending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">銷售區域</div>
        {mode === "view" && region ? (
          <>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{region.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{region.code}</span>
              {region.is_active ? (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
              )}
              <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                {stores.length} 個門店
              </span>
            </div>
          </>
        ) : (
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
            {mode === "create" ? "（未命名區域）" : "編輯中：" + (region?.name ?? "")}
          </h1>
        )}
      </header>

      {/* 區段卡片：基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {mode === "view" && region ? (
            <>
              <Kv label="區域代碼" value={region.code} mono />
              <Kv label="區域名稱" value={region.name} />
              <Kv label="狀態" value={region.is_active ? "啟用" : "停用"} />
              <div className="md:col-span-3">
                <Kv label="涵蓋說明（縣市）" value={region.notes ?? "—"} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>區域代碼 *</label>
                <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="REGION-N" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>區域名稱 *</label>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="台灣北區" />
              </div>
              <div className="md:col-span-3 flex flex-col gap-1">
                <label className={labelClass}>涵蓋說明（縣市）</label>
                <input
                  className={inputClass}
                  value={notes ?? ""}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="台北市、新北市、基隆、桃園"
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* 子門店清單（view 模式才顯示） */}
      {mode === "view" && region && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 隸屬門店（{stores.length}）</span>
            <Link
              href={`/parts/setup/stores/new?region_id=${region.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center"
            >
              ＋ 新增門店
            </Link>
          </header>
          <div className="px-4 py-3">
            {stores.length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">此區域底下尚無門店。</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-[#9A9890]">
                  <tr>
                    <th className="text-left font-medium py-1.5">代碼</th>
                    <th className="text-left font-medium py-1.5">名稱</th>
                    <th className="text-left font-medium py-1.5">類型</th>
                    <th className="text-left font-medium py-1.5">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                      <td className="py-1.5 font-mono">
                        <Link href={`/parts/setup/stores/${s.id}`} className="text-[#185FA5] hover:underline">{s.code}</Link>
                      </td>
                      <td className="py-1.5">{s.name}</td>
                      <td className="py-1.5">
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                          {s.store_type === "dealer" ? "經銷" : "直營"}
                        </span>
                      </td>
                      <td className="py-1.5">
                        {s.is_active ? (
                          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
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

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}
