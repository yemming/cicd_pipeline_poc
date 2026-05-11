"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveItemPermissionRules } from "@/domain/rules";
import { ITEM_PERMISSION_CAPABILITIES } from "@/domain/rules.constants";
import type {
  BusinessRuleRow,
  ItemPermissionConfig,
  RoleRow,
} from "@/domain/rules";

type RuleFormRow = {
  id?: string;
  scope_role_code: string;
  config: ItemPermissionConfig;
};

type Banner = { ok: boolean; msg: string } | null;

function ruleToForm(rule: BusinessRuleRow): RuleFormRow {
  return {
    id: rule.id,
    scope_role_code: rule.scope_role_code ?? "",
    config: (rule.config ?? {}) as ItemPermissionConfig,
  };
}

const SECTIONS = ["商品基礎資料", "定價管理", "序列號/批號"] as const;

export function ItemPermissionsBoard({
  rules,
  roles,
  canEdit,
}: {
  rules: BusinessRuleRow[];
  roles: RoleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [rows, setRows] = useState<RuleFormRow[]>(() => rules.map(ruleToForm));

  const roleNameMap = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  const orderedRows = rows;

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function toggleCell(roleCode: string, capabilityKey: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.scope_role_code === roleCode
          ? {
              ...row,
              config: {
                ...row.config,
                [capabilityKey]: !row.config[capabilityKey],
              },
            }
          : row,
      ),
    );
  }

  function handleSave() {
    setBanner(null);
    startTransition(async () => {
      const res = await saveItemPermissionRules(
        rows.map((r) => ({
          id: r.id,
          scope_role_code: r.scope_role_code,
          config: r.config,
        })),
      );
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已儲存 ${res.data.saved} 筆角色權限` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
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

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品管理權限</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定各角色對商品資料的新增、修改、刪除、定價權限
        </span>
      </header>

      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">角色權限矩陣</h2>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "儲存中⋯" : "儲存設定"}
            </button>
          )}
        </header>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[280px]">
                  功能
                </th>
                {orderedRows.map((row) => (
                  <th
                    key={row.scope_role_code}
                    className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold whitespace-nowrap"
                  >
                    {roleNameMap.get(row.scope_role_code) ?? row.scope_role_code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => {
                const caps = ITEM_PERMISSION_CAPABILITIES.filter(
                  (c) => c.section === section,
                );
                return (
                  <FragmentRows
                    key={section}
                    section={section}
                    capabilities={caps}
                    rows={orderedRows}
                    canEdit={canEdit}
                    onToggle={toggleCell}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
          💡 勾選 = 該角色擁有此功能。改完後按右上「儲存設定」一次寫回。
        </div>
      </section>
    </main>
  );
}

function FragmentRows({
  section,
  capabilities,
  rows,
  canEdit,
  onToggle,
}: {
  section: string;
  capabilities: typeof ITEM_PERMISSION_CAPABILITIES;
  rows: RuleFormRow[];
  canEdit: boolean;
  onToggle: (roleCode: string, capabilityKey: string) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={1 + rows.length}
          className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider"
        >
          {section}
        </td>
      </tr>
      {capabilities.map((cap) => (
        <tr
          key={cap.key}
          className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]"
        >
          <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A]">{cap.label}</td>
          {rows.map((row) => (
            <td
              key={`${cap.key}-${row.scope_role_code}`}
              className="px-3 py-2 text-center"
            >
              <input
                type="checkbox"
                checked={!!row.config[cap.key]}
                onChange={() => onToggle(row.scope_role_code, cap.key)}
                disabled={!canEdit}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
