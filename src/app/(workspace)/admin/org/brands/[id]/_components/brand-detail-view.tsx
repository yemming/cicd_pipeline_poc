"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createBrandAction,
  updateBrandAction,
  deleteBrandAction,
} from "@/lib/rbac/org-actions";
import type { BrandDetail } from "@/domain/org-admin";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";
type Group = { id: string; name: string };

export type BrandDetailViewProps = {
  brand: BrandDetail | null;
  groups: Group[];
  initialMode: Mode;
};

export function BrandDetailView({ brand, groups, initialMode }: BrandDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Edit form state
  const [eName, setEName] = useState(brand?.name ?? "");
  const [eMfg, setEMfg] = useState(brand?.manufacturer ?? "");
  const [eGroups, setEGroups] = useState<Set<string>>(new Set(brand?.group_ids ?? []));

  // Create form state
  const [cId, setCId] = useState("");
  const [cName, setCName] = useState("");
  const [cMfg, setCMfg] = useState("");
  const [cGroups, setCGroups] = useState<Set<string>>(new Set());

  const enterEditMode = () => {
    if (brand) {
      setEName(brand.name);
      setEMfg(brand.manufacturer ?? "");
      setEGroups(new Set(brand.group_ids));
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!brand) return;
    if (!eName.trim()) {
      showBanner({ ok: false, msg: "品牌名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await updateBrandAction(brand.id, {
        name: eName.trim(),
        manufacturer: eMfg.trim() || null,
        group_ids: [...eGroups],
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!cId.trim()) {
      showBanner({ ok: false, msg: "Brand ID 必填" });
      return;
    }
    if (!cName.trim()) {
      showBanner({ ok: false, msg: "品牌名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await createBrandAction({
        id: cId.trim(),
        name: cName.trim(),
        manufacturer: cMfg.trim() || null,
        group_ids: [...cGroups],
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${res.data.id}` });
        router.push(`/admin/org/brands/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!brand) return;
    if (!confirm(`刪除品牌「${brand.id} ${brand.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteBrandAction(brand.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/org/brands");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleGroup = (gid: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(gid)) next.delete(gid);
    else next.add(gid);
    setter(next);
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode = mode === "create" ? "新增品牌" : brand?.id ?? "—";

  const renderPills = () => {
    if (mode === "edit" && brand) {
      return (
        <>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存變更"}
          </button>
        </>
      );
    }
    if (mode === "create") {
      return (
        <>
          <button
            type="button"
            onClick={() => router.push("/admin/org/brands")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </>
      );
    }
    return (
      <>
        <Link
          href="/admin/org/brands"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <Link
          href="/admin/org/brands/new"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
        >
          新增
        </Link>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !brand}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={isPending || !brand}
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
      </>
    );
  };

  const groupPicker = (set: Set<string>, setter: (s: Set<string>) => void) => (
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
              checked={set.has(g.id)}
              onChange={() => toggleGroup(g.id, set, setter)}
              className="w-4 h-4 accent-[#0F6E56]"
            />
            <span className="text-[12px]">{g.name}</span>
            <span className="text-[10.5px] text-[#9A9890] font-mono ml-auto">{g.id}</span>
          </label>
        ))
      )}
    </div>
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/org/brands" className="hover:text-[#185FA5]">
            品牌主檔
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">{renderPills()}</div>
      </div>

      {/* 2. Banner */}
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

      {/* 3. Title Card */}
      {mode === "create" ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">品牌字典</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名品牌）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              新增品牌（Brand ID 為小寫英數+底線/連字號、開頭必為英文）
            </span>
          </div>
        </header>
      ) : brand ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">品牌字典</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {brand.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{brand.id}</span>
              {brand.manufacturer && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  {brand.manufacturer}
                </span>
              )}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
                {brand.store_count} 門店
              </span>
              {brand.netsuite_segment_value_id && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2EAFB] text-[#5E2EA0]">
                  NS Segment {brand.netsuite_segment_value_id}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此品牌（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Brand ID *</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="例：bmw"
                value={cId}
                onChange={(e) => setCId(e.target.value)}
              />
              <span className="text-[10px] text-[#9A9890]">小寫英數+底線/連字號</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>品牌名稱 *</label>
              <input
                className={inputClass}
                placeholder="例：BMW"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>原廠</label>
              <input
                className={inputClass}
                placeholder="例：BMW Group"
                value={cMfg}
                onChange={(e) => setCMfg(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label className={labelClass}>代理集團（多選）</label>
              {groupPicker(cGroups, setCGroups)}
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該品牌的詳情頁，可進一步維護⋯
          </div>
        </SectionCard>
      ) : brand ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="Brand ID" value={<span className="font-mono">{brand.id}</span>} />
              <Kv
                label="品牌名稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  ) : (
                    brand.name
                  )
                }
              />
              <Kv
                label="原廠"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eMfg}
                      onChange={(e) => setEMfg(e.target.value)}
                    />
                  ) : (
                    brand.manufacturer ?? "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 代理集團">
            {mode === "edit" ? (
              groupPicker(eGroups, setEGroups)
            ) : brand.group_ids.length === 0 ? (
              <div className="text-[12px] text-[#9A9890]">未指定代理集團</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {brand.group_ids.map((gid) => {
                  const g = groups.find((x) => x.id === gid);
                  return (
                    <span
                      key={gid}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11.5px]"
                    >
                      {g?.name ?? gid}
                      <span className="font-mono text-[10px] text-[#9A9890]">{gid}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="▼ NetSuite / 系統">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="NS Segment Value ID"
                value={brand.netsuite_segment_value_id ?? "—"}
                mono
                small
              />
              <Kv label="NS 最後同步" value={fmtTs(brand.netsuite_synced_at)} small />
              <Kv label="掛載門店數" value={String(brand.store_count)} small />
              <Kv label="建立時間" value={fmtTs(brand.created_at)} small />
              <Kv label="更新時間" value={fmtTs(brand.updated_at)} small />
            </div>
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tw.getUTCFullYear()}-${p(tw.getUTCMonth() + 1)}-${p(tw.getUTCDate())} ${p(
    tw.getUTCHours(),
  )}:${p(tw.getUTCMinutes())}`;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div
        className={`${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
