"use client";

/**
 * GRP20 組織架構設定 — client board（唯讀統一樹 + 深連結）
 *
 * 左：五層組織樹（<OrgTree>）。右：選中節點的詳情 KV + 人員指派清單 +
 * 頁面權限總覽。每區塊放「→ 前往 /admin/* 編輯」深連結（本頁不寫入）。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/org-structure 注入。
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import type { OrgNodeType, OrgStructureData, OrgTreeNode } from "@/domain/org-structure";
import type { OrgSettings } from "@/domain/org-settings";
import { setOrgModeAction } from "@/lib/group/org-settings-actions";

import { OrgTree, TYPE_META, BRAND_LABEL } from "./org-tree";

/** 節點類型 → /admin 編輯深連結 */
const EDIT_HREF: Record<OrgNodeType, string> = {
  group: "/admin/org/groups",
  subsidiary: "/admin/org/groups",
  region: "/admin/org/stores",
  store: "/admin/org/stores",
  department: "/admin/org",
};

function flatten(nodes: OrgTreeNode[], out: OrgTreeNode[] = []): OrgTreeNode[] {
  for (const n of nodes) {
    out.push(n);
    flatten(n.children, out);
  }
  return out;
}

function DeepLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[12px] text-[#185FA5] hover:text-[#1A3A5C] hover:underline"
    >
      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
      {label}
    </Link>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F8F7F4] border border-[#EEECE6] text-[12px] text-[#5A5955]">
      {label} <b className="text-[#2C2C2A]">{value}</b>
    </span>
  );
}

export function OrgStructureBoard({
  data,
  orgSettings,
}: {
  data: OrgStructureData;
  orgSettings: OrgSettings | null;
}) {
  useSetPageHeader({
    title: "組織架構設定",
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: "組織架構設定" }],
    hideSearch: true,
  });

  // G3-A：org_mode 樂觀切換（3 三層 / 4 四層）
  const [orgMode, setOrgMode] = useState<3 | 4>(orgSettings?.orgMode ?? 3);
  const [savingMode, startSave] = useTransition();
  const [modeBanner, setModeBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function changeOrgMode(next: 3 | 4) {
    if (!orgSettings || next === orgMode || savingMode) return;
    const prev = orgMode;
    setOrgMode(next); // 樂觀
    startSave(async () => {
      const res = await setOrgModeAction(orgSettings.groupId, next);
      if (res.ok) {
        setModeBanner({ ok: true, msg: `✓ 已切換為 ${next} 層組織模式` });
        setTimeout(() => setModeBanner(null), 2200);
      } else {
        setOrgMode(prev); // rollback
        setModeBanner({ ok: false, msg: res.error });
      }
    });
  }

  const all = useMemo(() => flatten(data.tree), [data.tree]);
  // 預設選中第一個法人（看得到指派），沒有就選根
  const defaultNode = useMemo(
    () => all.find((n) => n.type === "subsidiary" && n.assignments.length > 0) ?? all[0] ?? null,
    [all],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(defaultNode?.key ?? null);
  const selected = useMemo(
    () => all.find((n) => n.key === selectedKey) ?? defaultNode,
    [all, selectedKey, defaultNode],
  );

  const m = selected ? TYPE_META[selected.type] : null;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織架構設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">GRP20</span>
        <span className="text-[12px] text-[#9A9890]">集團組織層級 · 法人 · 門店 · 部門 · 人員指派與頁面權限總覽（唯讀）</span>
      </header>

      {/* G3-A：⚠️ 上線前必須完成 — 紅色警示橫幅 */}
      <section className="rounded-lg border border-[#F5AEAD] bg-[#FDECEA] px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#CC0000] mt-0.5">warning</span>
          <div className="flex-1 text-[12.5px] text-[#2C2C2A] leading-relaxed">
            <b className="text-[#CC0000]">上線前必須完成：</b>組織架構是整個系統的安全基礎。
            <span className="text-[#5A5955]">
              組織模式（org_mode）影響全系統組織樹與報表篩選；角色權限矩陣是 Supabase RLS 的設定依據，
              未依矩陣配置 RLS 則任何角色都能看到其他門店機密資料。請先完成組織架構與權限設定，再進行其他設定。
            </span>
          </div>
        </div>

        {/* org_mode 選擇器 */}
        <div className="mt-3 flex items-center gap-3 flex-wrap border-t border-[#F5AEAD]/60 pt-3">
          <span className="text-[12px] text-[#5A5955] font-medium">組織模式</span>
          {([3, 4] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeOrgMode(m)}
              disabled={savingMode || !orgSettings}
              className={`h-[30px] px-3.5 rounded-full text-[12.5px] font-medium border transition-colors disabled:opacity-60 ${
                orgMode === m
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
              }`}
            >
              {m === 3 ? "三層（集團→法人→門店）" : "四層（集團→法人→區域→門店）"}
            </button>
          ))}
          {savingMode && <span className="text-[12px] text-[#9A9890]">切換中⋯</span>}
          {!orgSettings && <span className="text-[12px] text-[#9A9890]">（system_settings 尚未初始化）</span>}
          <span className="text-[11.5px] text-[#9A9890] ml-auto">
            目前：{orgMode} 層 · {orgSettings?.groupName ?? "—"}
          </span>
        </div>
      </section>

      {/* 統計 chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatChip label="集團" value={data.stats.groups} />
        <StatChip label="法人" value={data.stats.subsidiaries} />
        <StatChip label="門店" value={data.stats.stores} />
        <StatChip label="部門" value={data.stats.departments} />
        <StatChip label="人員指派" value={data.stats.assignments} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-3 items-start">
        {/* 左：組織樹 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 組織樹狀結構</span>
            <DeepLink href="/admin/org/groups" label="編輯" />
          </header>
          <div className="p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
            <OrgTree tree={data.tree} selectedKey={selectedKey} onSelect={(n) => setSelectedKey(n.key)} />
          </div>
        </section>

        {/* 右：詳情 + 人員 + 權限 */}
        <div className="space-y-3 min-w-0">
          {!selected ? (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-8 text-center text-[13px] text-[#9A9890]">
              無組織資料
            </div>
          ) : (
            <>
              {/* Title card */}
              <section className="bg-white border border-[#EEECE6] rounded-lg p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <span
                    className="material-symbols-outlined text-[28px] shrink-0"
                    style={{ color: m!.color }}
                  >
                    {m!.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] tracking-wider text-[#9A9890]">{m!.label}</div>
                    <h2 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{selected.name}</h2>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                      {selected.code && <span className="font-mono text-[#5A5955]">{selected.code}</span>}
                      {selected.brandIds.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]"
                        >
                          {BRAND_LABEL[b] ?? b}
                        </span>
                      ))}
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                          selected.isActive === false
                            ? "bg-[#F2F2F2] text-[#6B6A68]"
                            : "bg-[#EAF3DE] text-[#3B6D11]"
                        }`}
                      >
                        {selected.isActive === false ? "停用" : "啟用"}
                      </span>
                    </div>
                  </div>
                  <DeepLink href={EDIT_HREF[selected.type]} label={`前往編輯${m!.label}`} />
                </div>
              </section>

              {/* 基本資料 KV */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
                </header>
                <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
                  {selected.detail.map((kv) => (
                    <div key={kv.label} className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-[#9A9890]">{kv.label}</span>
                      <span
                        className={`text-[12.5px] text-[#2C2C2A] break-words ${kv.mono ? "font-mono" : ""}`}
                      >
                        {kv.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 人員指派 */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">
                    ▼ 人員指派{selected.assignments.length > 0 ? `（${selected.assignments.length}）` : ""}
                  </span>
                  <DeepLink href="/admin/navigation" label="編輯人員角色" />
                </header>
                {selected.assignments.length === 0 ? (
                  <div className="px-4 py-5 text-[12.5px] text-[#9A9890]">
                    此節點層級無直接人員指派{selected.type !== "subsidiary" ? "（人員以品牌為範圍指派，見對應法人節點）" : ""}。
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#EEECE6]">
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">姓名</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">角色</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">範圍</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">到期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.assignments.map((a, i) => (
                        <tr key={`${a.roleId}:${i}`} className="border-b border-[#F5F4F0] last:border-0">
                          <td className="px-4 py-2 text-[12.5px] text-[#2C2C2A]">{a.userName ?? "—（未綁定使用者）"}</td>
                          <td className="px-4 py-2 text-[12.5px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                              {a.roleName}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-[12px] text-[#5A5955]">{a.scopeLabel}</td>
                          <td className="px-4 py-2 text-[12px] text-[#5A5955]">{a.expires ? a.expires.slice(0, 10) : "永久"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {/* 頁面權限總覽 */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 頁面權限總覽（各模組）</span>
                  <DeepLink href="/admin/navigation" label="編輯導覽 / 權限" />
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#EEECE6]">
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">品牌</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium">模組</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium text-right">頁面數</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium text-right">僅管理者</th>
                        <th className="px-4 py-2 text-[11px] text-[#9A9890] font-medium text-right">具權限鍵</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.permissionMatrix.map((r) => (
                        <tr key={`${r.brandId}:${r.module}`} className="border-b border-[#F5F4F0] last:border-0">
                          <td className="px-4 py-2 text-[12px]">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                              {BRAND_LABEL[r.brandId] ?? r.brandId}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-[12.5px] text-[#2C2C2A]">{r.module}</td>
                          <td className="px-4 py-2 text-[12.5px] text-[#2C2C2A] text-right">{r.pageCount}</td>
                          <td className="px-4 py-2 text-[12.5px] text-[#854F0B] text-right">{r.adminOnlyCount}</td>
                          <td className="px-4 py-2 text-[12.5px] text-[#3B6D11] text-right">{r.withPermissionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* org_mode 切換 toast */}
      {modeBanner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            modeBanner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {modeBanner.msg}
        </div>
      )}
    </main>
  );
}
