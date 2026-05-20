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
import { KpiCard, MatrixSelector } from "@/components/visualization";

type RuleFormRow = {
  id?: string;
  scope_role_code: string;
  config: ItemPermissionConfig;
};

type Banner = { ok: boolean; msg: string } | null;

type SectionKey = "all" | "商品基礎資料" | "定價管理" | "序列號/批號";

const SECTION_OPTIONS: Array<{ value: SectionKey; label: string }> = [
  { value: "all", label: "全部能力" },
  { value: "商品基礎資料", label: "商品基礎資料" },
  { value: "定價管理", label: "定價管理" },
  { value: "序列號/批號", label: "序列號/批號" },
];

const ALL_SECTIONS = ["商品基礎資料", "定價管理", "序列號/批號"] as const;

function ruleToForm(rule: BusinessRuleRow): RuleFormRow {
  return {
    id: rule.id,
    scope_role_code: rule.scope_role_code ?? "",
    config: (rule.config ?? {}) as ItemPermissionConfig,
  };
}

function stableConfigSig(cfg: ItemPermissionConfig): string {
  const keys = Object.keys(cfg).sort();
  return keys.map((k) => `${k}:${cfg[k] ? 1 : 0}`).join("|");
}

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
  const [search, setSearch] = useState<string>("");
  const [section, setSection] = useState<SectionKey>("all");

  // 原始 signature — 用來判斷是否有未存的變更
  const initialSig = useMemo(
    () =>
      rules
        .map(ruleToForm)
        .map((r) => `${r.scope_role_code}:${stableConfigSig(r.config)}`)
        .sort()
        .join("||"),
    [rules],
  );

  const currentSig = useMemo(
    () =>
      rows
        .map((r) => `${r.scope_role_code}:${stableConfigSig(r.config)}`)
        .sort()
        .join("||"),
    [rows],
  );
  const dirty = currentSig !== initialSig;

  const roleNameMap = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  // 過濾後要展示的能力（cols）
  const filteredCapabilities = useMemo(() => {
    return ITEM_PERMISSION_CAPABILITIES.filter((c) =>
      section === "all" ? true : c.section === section,
    );
  }, [section]);

  // 過濾後要展示的 row（rows）— search 比對角色名 + role id
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (roleNameMap.get(r.scope_role_code) ?? "").toLowerCase();
      return (
        name.includes(q) || r.scope_role_code.toLowerCase().includes(q)
      );
    });
  }, [rows, search, roleNameMap]);

  // KPI 計算
  const kpi = useMemo(() => {
    const totalRules = rows.length;
    const activeRoles = new Set(rows.map((r) => r.scope_role_code)).size;
    let grantedCells = 0;
    let totalCells = 0;
    for (const r of rows) {
      for (const cap of ITEM_PERMISSION_CAPABILITIES) {
        totalCells += 1;
        if (r.config[cap.key]) grantedCells += 1;
      }
    }
    const coveragePct =
      totalCells > 0 ? Math.round((grantedCells / totalCells) * 100) : 0;
    const totalCapabilities = ITEM_PERMISSION_CAPABILITIES.length;
    return {
      totalRules,
      activeRoles,
      grantedCells,
      coveragePct,
      totalCapabilities,
    };
  }, [rows]);

  // MatrixSelector 用的 selected map: { [roleCode]: { [capKey]: bool } }
  const selectedMap = useMemo(() => {
    const out: Record<string, Record<string, boolean>> = {};
    for (const r of filteredRows) {
      const inner: Record<string, boolean> = {};
      for (const cap of filteredCapabilities) {
        inner[cap.key] = !!r.config[cap.key];
      }
      out[r.scope_role_code] = inner;
    }
    return out;
  }, [filteredRows, filteredCapabilities]);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleMatrixChange(roleCode: string, capKey: string, value: boolean) {
    if (!canEdit) return;
    setRows((prev) =>
      prev.map((row) =>
        row.scope_role_code === roleCode
          ? {
              ...row,
              config: {
                ...row.config,
                [capKey]: value,
              },
            }
          : row,
      ),
    );
  }

  function handleResetFilters() {
    setSearch("");
    setSection("all");
  }

  function handleRevertChanges() {
    setRows(rules.map(ruleToForm));
    setBanner(null);
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

  // Matrix rows / cols
  const matrixRows = filteredRows.map((r) => ({
    id: r.scope_role_code,
    label: roleNameMap.get(r.scope_role_code) ?? r.scope_role_code,
  }));
  const matrixCols = filteredCapabilities.map((c) => ({
    id: c.key,
    label: c.label,
  }));

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

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
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          商品管理權限
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定各角色對商品資料的新增、修改、刪除、定價權限
        </span>
        {dirty && (
          <span className="ml-2 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            有未儲存的變更
          </span>
        )}
      </header>

      {/* KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="總規則數"
          value={kpi.totalRules}
          tone="blue"
          icon={<span className="text-[18px]">📋</span>}
        />
        <KpiCard
          label="涵蓋角色"
          value={kpi.activeRoles}
          tone="teal"
          icon={<span className="text-[18px]">👤</span>}
        />
        <KpiCard
          label="授權能力總格"
          value={`${kpi.grantedCells} / ${kpi.totalRules * kpi.totalCapabilities}`}
          tone={kpi.coveragePct >= 50 ? "green" : "amber"}
          icon={<span className="text-[18px]">✓</span>}
        />
        <KpiCard
          label="平均授權率"
          value={`${kpi.coveragePct}%`}
          tone={
            kpi.coveragePct >= 70
              ? "green"
              : kpi.coveragePct >= 40
              ? "amber"
              : "red"
          }
          icon={<span className="text-[18px]">📊</span>}
        />
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              搜尋角色
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="輸入角色名稱或 code"
              className="h-[30px] w-[200px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              能力區段
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as SectionKey)}
              className="h-[30px] w-[160px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
            >
              {SECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置篩選
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={handleRevertChanges}
                  disabled={!dirty || isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  捨棄變更
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "儲存中⋯" : "儲存設定"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar 提示 */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          顯示 <b className="text-[#2C2C2A]">{filteredRows.length}</b> 個角色 ×{" "}
          <b className="text-[#2C2C2A]">{filteredCapabilities.length}</b>{" "}
          個能力（共 {rows.length} 角色 / {ITEM_PERMISSION_CAPABILITIES.length}{" "}
          能力）
        </span>
        {!canEdit && (
          <span className="ml-2 text-[11.5px] text-[#854F0B] bg-[#FDF3E3] px-2 py-0.5 rounded">
            僅檢視（無編輯權限）
          </span>
        )}
      </div>

      {/* 主視覺：MatrixSelector */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            角色 × 能力矩陣
          </h2>
          <span className="ml-auto text-[11px] text-[#9A9890]">
            點擊格子切換授權；改完按「儲存設定」一次寫回
          </span>
        </header>

        <div className="p-3">
          {filteredRows.length === 0 ? (
            <EmptyState
              title="沒有符合條件的角色"
              hint="請調整搜尋字串或重置篩選"
              onReset={handleResetFilters}
            />
          ) : filteredCapabilities.length === 0 ? (
            <EmptyState
              title="沒有符合條件的能力"
              hint="切換能力區段以檢視其他能力"
              onReset={handleResetFilters}
            />
          ) : (
            <MatrixSelector
              rows={matrixRows}
              cols={matrixCols}
              selected={selectedMap}
              onChange={handleMatrixChange}
              tone="teal"
            />
          )}
        </div>

        {/* 區段參考圖例 */}
        {section === "all" && filteredCapabilities.length > 0 && (
          <div className="border-t border-[#EEECE6] bg-[#F8F7F4] px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#5A5955]">
              <span className="text-[11px] text-[#9A9890]">能力分組：</span>
              {ALL_SECTIONS.map((s) => {
                const caps = ITEM_PERMISSION_CAPABILITIES.filter(
                  (c) => c.section === s,
                );
                return (
                  <span key={s} className="inline-flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#185FA5]" />
                    <span className="font-medium text-[#2C2C2A]">{s}</span>
                    <span className="text-[#9A9890]">（{caps.length}）</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
          💡 儲存後會同步更新 RBAC role_permissions 表（每個 capability 都有對應的 RBAC code）。
        </div>
      </section>
    </main>
  );
}

function EmptyState({
  title,
  hint,
  onReset,
}: {
  title: string;
  hint: string;
  onReset: () => void;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="text-[13px] font-medium text-[#5A5955]">{title}</div>
      <div className="text-[12px] text-[#9A9890] mt-1">{hint}</div>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 h-[28px] px-3 rounded text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
      >
        重置篩選
      </button>
    </div>
  );
}
