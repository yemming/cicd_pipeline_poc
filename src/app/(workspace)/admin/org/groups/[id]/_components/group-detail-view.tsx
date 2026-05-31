"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
} from "@/lib/rbac/org-actions";
import type { GroupDetail } from "@/domain/org-admin";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

export type GroupDetailViewProps = {
  group: GroupDetail | null;
  initialMode: Mode;
};

export function GroupDetailView({ group, initialMode }: GroupDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Edit form state
  const [eName, setEName] = useState(group?.name ?? "");
  const [eShort, setEShort] = useState(group?.short_name ?? "");

  // Create form state
  const [cId, setCId] = useState("");
  const [cName, setCName] = useState("");
  const [cShort, setCShort] = useState("");

  const enterEditMode = () => {
    if (group) {
      setEName(group.name);
      setEShort(group.short_name ?? "");
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitEdit = () => {
    if (!group) return;
    if (!eName.trim()) {
      showBanner({ ok: false, msg: "集團名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await updateGroupAction(group.id, {
        name: eName.trim(),
        short_name: eShort.trim() || null,
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
      showBanner({ ok: false, msg: "Group ID 必填" });
      return;
    }
    if (!cName.trim()) {
      showBanner({ ok: false, msg: "集團名稱必填" });
      return;
    }
    startTransition(async () => {
      const res = await createGroupAction({
        id: cId.trim(),
        name: cName.trim(),
        short_name: cShort.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${res.data.id}` });
        router.push(`/admin/org/groups/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!group) return;
    if (!confirm(`刪除集團「${group.id} ${group.name}」？依賴的門店 / 品牌代理 / 授權需先清除。`))
      return;
    startTransition(async () => {
      const res = await deleteGroupAction(group.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/org/groups");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode = mode === "create" ? "新增集團" : group?.id ?? "—";

  const renderPills = () => {
    if (mode === "edit" && group) {
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
            onClick={() => router.push("/admin/org/groups")}
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
          href="/admin/org/groups"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <Link
          href="/admin/org/groups/new"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
        >
          新增
        </Link>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !group}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        <button
          type="button"
          onClick={removeRow}
          disabled={isPending || !group}
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/org/groups" className="hover:text-[#185FA5]">
            集團主檔
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
          <div className="text-[11px] tracking-wider text-[#9A9890]">集團 / 代理商</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名集團）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              新增集團（Group ID 為小寫英數+底線/連字號、開頭必為英文）
            </span>
          </div>
        </header>
      ) : group ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">集團 / 代理商</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {group.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{group.id}</span>
              {group.short_name && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  {group.short_name}
                </span>
              )}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2EAFB] text-[#5E2EA0]">
                {group.brand_count} 代理品牌
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
                {group.org_count} 門店
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此集團（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Group ID *</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="例：fanho"
                value={cId}
                onChange={(e) => setCId(e.target.value)}
              />
              <span className="text-[10px] text-[#9A9890]">小寫英數+底線/連字號</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>集團名稱 *</label>
              <input
                className={inputClass}
                placeholder="例：汎德永業"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>簡稱</label>
              <input
                className={inputClass}
                placeholder="例：汎德"
                value={cShort}
                onChange={(e) => setCShort(e.target.value)}
              />
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該集團的詳情頁，可進一步維護⋯
          </div>
        </SectionCard>
      ) : group ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="Group ID" value={<span className="font-mono">{group.id}</span>} />
              <Kv
                label="集團名稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  ) : (
                    group.name
                  )
                }
              />
              <Kv
                label="簡稱"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eShort}
                      onChange={(e) => setEShort(e.target.value)}
                    />
                  ) : (
                    group.short_name ?? "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title={`▼ 代理品牌（${group.brand_count}）`}>
            {group.brands.length === 0 ? (
              <div className="text-[12px] text-[#9A9890]">尚未代理任何品牌</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {group.brands.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11.5px]"
                  >
                    {b.name}
                    <span className="font-mono text-[10px] text-[#9A9890]">{b.id}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-[#9A9890] mt-2">
              代理品牌關係在「品牌」頁的代理集團設定，此處唯讀。
            </p>
          </SectionCard>

          <SectionCard title="▼ 系統">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="tenant_uuid" value={group.tenant_uuid} mono small />
              <Kv label="掛載門店數" value={String(group.org_count)} small />
              <Kv label="建立時間" value={fmtTs(group.created_at)} small />
              <Kv label="更新時間" value={fmtTs(group.updated_at)} small />
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
