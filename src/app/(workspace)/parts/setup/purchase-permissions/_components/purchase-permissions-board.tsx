"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { savePurchaseAuthorityRules } from "@/domain/rules";
import type {
  BusinessRuleRow,
  PurchaseAuthorityConfig,
  PurchaseWorkflowConfig,
  PurchaseWorkflowStep,
  RoleRow,
} from "@/domain/rules";
import { KpiCard } from "@/components/visualization";

// ──────────────────────────────────────────────────────────────────────────
// 本地 Form state（每張 row 對應一個編輯狀態）
// ──────────────────────────────────────────────────────────────────────────

type AuthorityFormRow = {
  /** 既有 row 帶 id；新 row 留 undefined */
  id?: string;
  scope_role_code: string;
  /** 上限欄位用字串保存原始輸入（"100000" / "" / "無上限"），儲存時解析 */
  single_limit_text: string;
  monthly_limit_text: string;
  require_supervisor_approval: boolean;
};

type Banner = { ok: boolean; msg: string } | null;

const NO_LIMIT_KEYWORDS = ["無上限", "unlimited", "no limit"];

function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (NO_LIMIT_KEYWORDS.includes(trimmed.toLowerCase())) return null;
  // 移除 NT$, 逗號, 空白
  const cleaned = trimmed.replace(/[NT$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function formatAmount(n: number | null): string {
  if (n === null || n === undefined) return "無上限";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function ruleToForm(rule: BusinessRuleRow): AuthorityFormRow {
  const cfg = (rule.config ?? {}) as Partial<PurchaseAuthorityConfig>;
  return {
    id: rule.id,
    scope_role_code: rule.scope_role_code ?? "",
    single_limit_text: formatAmount(cfg.max_single_amount ?? null),
    monthly_limit_text: formatAmount(cfg.max_monthly_amount ?? null),
    require_supervisor_approval: !!cfg.require_supervisor_approval,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export function PurchasePermissionsBoard({
  authorityRules,
  workflowRules,
  roles,
  canEdit,
}: {
  authorityRules: BusinessRuleRow[];
  workflowRules: BusinessRuleRow[];
  roles: RoleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [rows, setRows] = useState<AuthorityFormRow[]>(() =>
    authorityRules.map(ruleToForm),
  );

  // 已被選中的 role_code（避免重複加同一個 role）
  const usedRoleCodes = useMemo(
    () => new Set(rows.map((r) => r.scope_role_code)),
    [rows],
  );
  const remainingRoles = useMemo(
    () => roles.filter((r) => !usedRoleCodes.has(r.id)),
    [roles, usedRoleCodes],
  );

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  function updateRow(idx: number, patch: Partial<AuthorityFormRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow(roleCode: string) {
    setRows((prev) => [
      ...prev,
      {
        scope_role_code: roleCode,
        single_limit_text: "無上限",
        monthly_limit_text: "無上限",
        require_supervisor_approval: false,
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    setBanner(null);

    // 驗證：每筆上限解析有效
    const parsed: Array<{
      id?: string;
      scope_role_code: string;
      config: PurchaseAuthorityConfig;
    }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const single = parseAmount(row.single_limit_text);
      const monthly = parseAmount(row.monthly_limit_text);
      if (Number.isNaN(single)) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列單筆上限格式錯誤（請輸入數字或「無上限」）` });
        return;
      }
      if (Number.isNaN(monthly)) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列月累計上限格式錯誤` });
        return;
      }
      if (!row.scope_role_code) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列未選角色` });
        return;
      }
      parsed.push({
        id: row.id,
        scope_role_code: row.scope_role_code,
        config: {
          max_single_amount: single as number | null,
          max_monthly_amount: monthly as number | null,
          require_supervisor_approval: row.require_supervisor_approval,
        },
      });
    }

    startTransition(async () => {
      const res = await savePurchaseAuthorityRules(parsed);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已儲存 ${res.data.saved} 筆規則` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const roleNameMap = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  // KPI 計算（即時反應 form state、不是 server snapshot）
  const kpi = useMemo(() => {
    const totalRules = rows.length;
    const activeRoles = new Set(
      rows.map((r) => r.scope_role_code).filter(Boolean),
    ).size;
    const supervisorRequired = rows.filter(
      (r) => r.require_supervisor_approval,
    ).length;
    // 平均單筆上限（排除「無上限」）
    const numericLimits = rows
      .map((r) => parseAmount(r.single_limit_text))
      .filter(
        (v): v is number => v !== null && Number.isFinite(v) && !Number.isNaN(v),
      );
    const avgSingleLimit =
      numericLimits.length > 0
        ? Math.round(
            numericLimits.reduce((a, b) => a + b, 0) / numericLimits.length,
          )
        : null;
    return { totalRules, activeRoles, supervisorRequired, avgSingleLimit };
  }, [rows]);

  // 是否有「未儲存的變更」— 用 ruleToForm 對齊 server snapshot 後字串比對
  const dirty = useMemo(() => {
    const snapshot = authorityRules.map(ruleToForm);
    if (snapshot.length !== rows.length) return true;
    for (let i = 0; i < rows.length; i++) {
      const a = snapshot[i];
      const b = rows[i];
      if (
        a.id !== b.id ||
        a.scope_role_code !== b.scope_role_code ||
        a.single_limit_text !== b.single_limit_text ||
        a.monthly_limit_text !== b.monthly_limit_text ||
        a.require_supervisor_approval !== b.require_supervisor_approval
      ) {
        return true;
      }
    }
    return false;
  }, [rows, authorityRules]);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Banner */}
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

      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購權限規則</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          依角色與門店設定採購金額上限與審核流程
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
          label="需主管審核"
          value={`${kpi.supervisorRequired} / ${kpi.totalRules}`}
          tone={kpi.supervisorRequired > 0 ? "amber" : "gray"}
          icon={<span className="text-[18px]">🔐</span>}
        />
        <KpiCard
          label="平均單筆上限"
          value={
            kpi.avgSingleLimit === null
              ? "—"
              : `NT$ ${kpi.avgSingleLimit.toLocaleString("en-US")}`
          }
          tone={
            kpi.avgSingleLimit === null
              ? "gray"
              : kpi.avgSingleLimit >= 100000
                ? "green"
                : "blue"
          }
          icon={<span className="text-[18px]">💰</span>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左卡：角色採購權限 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              🦁 角色採購權限
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存"}
              </button>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8F7F4]">
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">
                    角色
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">
                    單筆上限
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">
                    月累計上限
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">
                    需主管審核
                  </th>
                  {canEdit && (
                    <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold w-[88px]">
                      操作
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEdit ? 5 : 4}
                      className="px-3 py-10 text-center text-[12px] text-[#9A9890]"
                    >
                      尚無規則，點下方「+ 新增角色」開始建立。
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id ?? `new-${idx}`}
                      className="border-t border-[#EEECE6]"
                    >
                      <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A] font-semibold">
                        {roleNameMap.get(row.scope_role_code) ?? row.scope_role_code}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.single_limit_text}
                          onChange={(e) =>
                            updateRow(idx, { single_limit_text: e.target.value })
                          }
                          disabled={!canEdit}
                          className="w-[120px] h-[26px] border border-[#D5D3CB] rounded px-2 font-mono text-[12px] focus:border-[#185FA5] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.monthly_limit_text}
                          onChange={(e) =>
                            updateRow(idx, { monthly_limit_text: e.target.value })
                          }
                          disabled={!canEdit}
                          className="w-[120px] h-[26px] border border-[#D5D3CB] rounded px-2 font-mono text-[12px] focus:border-[#185FA5] outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.require_supervisor_approval}
                          onChange={(e) =>
                            updateRow(idx, {
                              require_supervisor_approval: e.target.checked,
                            })
                          }
                          disabled={!canEdit}
                        />
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="h-[26px] px-3 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                          >
                            刪除
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 新增角色 */}
          {canEdit && remainingRoles.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[11px] text-[#9A9890]">+ 新增角色：</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    addRow(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] outline-none"
              >
                <option value="">選擇角色…</option>
                {remainingRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}（{r.id}）
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
            💡 留白或填「無上限」代表此角色不受該項上限限制。修改後按右上「儲存」一次寫回。
          </div>
        </section>

        {/* 右卡：採購類型審核流程（Phase 1 readonly） */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              採購類型審核流程
            </h2>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {workflowRules.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-4 text-center">
                尚無流程設定（Phase 1 由系統 seed）
              </div>
            ) : (
              workflowRules.map((rule) => {
                const cfg = (rule.config ?? {}) as Partial<PurchaseWorkflowConfig>;
                const tone = cfg.tone ?? "neutral";
                const card =
                  tone === "amber"
                    ? "bg-[#FDF3E3] border border-[#FAC775]"
                    : tone === "red"
                      ? "bg-[#FDECEA] border border-[#F5AEAD]"
                      : "bg-[#F8F7F4] border border-[#EEECE6]";
                const titleColor =
                  tone === "amber"
                    ? "text-[#854F0B]"
                    : tone === "red"
                      ? "text-[#CC0000]"
                      : "text-[#2C2C2A]";
                return (
                  <div
                    key={rule.id}
                    className={`px-3 py-2.5 rounded-md ${card}`}
                  >
                    <div
                      className={`text-[12.5px] font-semibold mb-1 ${titleColor}`}
                    >
                      {cfg.label ?? "（未命名流程）"}
                    </div>
                    <div className="text-[12px] text-[#5A5955]">
                      {cfg.description ?? "—"}
                    </div>
                    {Array.isArray(cfg.steps) && cfg.steps.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                        {cfg.steps.map((step, i) => (
                          <FlowStepChip
                            key={`${rule.id}-${i}`}
                            step={step}
                            isLast={i === (cfg.steps?.length ?? 1) - 1}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function FlowStepChip({
  step,
  isLast,
}: {
  step: PurchaseWorkflowStep;
  isLast: boolean;
}) {
  const palette: Record<PurchaseWorkflowStep["kind"], string> = {
    done: "bg-[#EAF3DE] text-[#3B6D11]",
    navy: "bg-[#EBF3FF] text-[#1A3A5C]",
    teal: "bg-[#E8F5F0] text-[#0F6E56]",
    pend: "bg-[#FDF3E3] text-[#854F0B]",
    red: "bg-[#FDECEA] text-[#CC0000]",
    gry: "bg-[#F2F2F2] text-[#6B6A68]",
  };
  return (
    <>
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${palette[step.kind] ?? palette.gry}`}
      >
        {step.label}
      </span>
      {!isLast && <span className="text-[11px] text-[#9A9890]">→</span>}
    </>
  );
}
