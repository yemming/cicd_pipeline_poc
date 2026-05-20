"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  saveDiscountAuthorityRules,
  saveDiscountWorkflow,
} from "@/domain/aftersales-discounts";
import type {
  BusinessRuleRow,
  DiscountAuthorityConfig,
  DiscountWorkflowConfig,
  RoleRow,
} from "@/domain/aftersales-discounts";
import {
  DEADLINE_OPTIONS,
  OVERDUE_ACTION_OPTIONS,
  OVERDUE_ACTION_LABEL,
} from "@/domain/aftersales-discounts.constants";

// ──────────────────────────────────────────────────────────────────────────
// 本地 Form state
// ──────────────────────────────────────────────────────────────────────────

type AuthorityFormRow = {
  id?: string;
  scope_role_code: string;
  role_label: string;
  /** 文字保留原始輸入（"95" / "" / "—"），save 時 parse */
  overall_text: string;
  goods_text: string;
  labor_text: string;
  approver_role_code: string; // "" = 不允許
};

type WorkflowFormState = {
  first_approver_role: string;
  second_approver_role: string;
  deadline_label: string;
  overdue_action: string;
};

type Banner = { ok: boolean; msg: string } | null;

const NULL_TOKENS = new Set(["", "-", "—", "无", "無", "n/a", "na"]);

function parsePct(input: string): number | null | typeof Number.NaN {
  const trimmed = input.trim();
  if (NULL_TOKENS.has(trimmed.toLowerCase())) return null;
  const cleaned = trimmed.replace(/%/g, "").replace(/\s/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return Number.NaN;
  return n;
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n}%`;
}

function ruleToForm(rule: BusinessRuleRow): AuthorityFormRow {
  const cfg = (rule.config ?? {}) as Partial<DiscountAuthorityConfig>;
  return {
    id: rule.id,
    scope_role_code: rule.scope_role_code ?? "",
    role_label: cfg.role_label ?? rule.scope_role_code ?? "",
    overall_text: formatPct(cfg.max_overall_pct ?? null),
    goods_text: formatPct(cfg.max_goods_pct ?? null),
    labor_text: formatPct(cfg.max_labor_pct ?? null),
    approver_role_code: cfg.approver_role_code ?? "",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export function DiscountsBoard({
  authorityRules,
  workflowRule,
  roles,
  canEdit,
}: {
  authorityRules: BusinessRuleRow[];
  workflowRule: BusinessRuleRow | null;
  roles: RoleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isWfPending, startWfTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [rows, setRows] = useState<AuthorityFormRow[]>(() =>
    authorityRules.map(ruleToForm),
  );

  const initialWf = (workflowRule?.config ?? {}) as Partial<DiscountWorkflowConfig>;
  const [wf, setWf] = useState<WorkflowFormState>({
    first_approver_role: initialWf.first_approver_role ?? "manager",
    second_approver_role: initialWf.second_approver_role ?? "manager",
    deadline_label: initialWf.deadline_label ?? "當日內完成",
    overdue_action: initialWf.overdue_action ?? "return_to_applicant",
  });

  const usedRoleCodes = useMemo(
    () => new Set(rows.map((r) => r.scope_role_code)),
    [rows],
  );
  const remainingRoles = useMemo(
    () => roles.filter((r) => !usedRoleCodes.has(r.id)),
    [roles, usedRoleCodes],
  );
  const roleNameMap = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function updateRow(idx: number, patch: Partial<AuthorityFormRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow(roleCode: string) {
    const role = roles.find((r) => r.id === roleCode);
    setRows((prev) => [
      ...prev,
      {
        scope_role_code: roleCode,
        role_label: role?.name ?? roleCode,
        overall_text: "—",
        goods_text: "—",
        labor_text: "—",
        approver_role_code: "",
      },
    ]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSaveAuthority() {
    setBanner(null);
    const parsed: Array<{
      id?: string;
      scope_role_code: string;
      config: DiscountAuthorityConfig;
    }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const overall = parsePct(row.overall_text);
      const goods = parsePct(row.goods_text);
      const labor = parsePct(row.labor_text);
      if (Number.isNaN(overall as number)) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列「全場最高折扣」格式錯誤（請輸入 0-100 數字或「—」）` });
        return;
      }
      if (Number.isNaN(goods as number)) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列「商品最高折扣」格式錯誤` });
        return;
      }
      if (Number.isNaN(labor as number)) {
        showBanner({ ok: false, msg: `第 ${i + 1} 列「人工費最高折扣」格式錯誤` });
        return;
      }
      const approverCode = row.approver_role_code || null;
      parsed.push({
        id: row.id,
        scope_role_code: row.scope_role_code,
        config: {
          role_label: row.role_label || row.scope_role_code,
          max_overall_pct: overall as number | null,
          max_goods_pct: goods as number | null,
          max_labor_pct: labor as number | null,
          approver_role_code: approverCode,
          approver_label: approverCode
            ? (roleNameMap.get(approverCode) ?? approverCode)
            : "—",
        },
      });
    }

    startTransition(async () => {
      const res = await saveDiscountAuthorityRules(parsed);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已儲存 ${res.data.saved} 筆崗位折扣權限` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSaveWorkflow() {
    setBanner(null);
    const overdueLabel =
      OVERDUE_ACTION_LABEL[wf.overdue_action] ?? wf.overdue_action;
    const cfg: DiscountWorkflowConfig = {
      label: "折扣超限審批流",
      first_approver_role: wf.first_approver_role,
      first_approver_label:
        roleNameMap.get(wf.first_approver_role) ?? wf.first_approver_role,
      second_approver_role: wf.second_approver_role,
      second_approver_label:
        roleNameMap.get(wf.second_approver_role) ?? wf.second_approver_role,
      deadline_label: wf.deadline_label,
      overdue_action: wf.overdue_action,
      overdue_label: overdueLabel,
    };
    startWfTransition(async () => {
      const res = await saveDiscountWorkflow(cfg);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 審批流設定已提交" });
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
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          崗位折扣審批
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後管理
        </span>
        <span className="text-[12px] text-[#9A9890]">
          各崗位折扣上限 + 超限審批流（依 LiVE 規範，配置完成後需提交審批）
        </span>
      </header>

      {/* 警告提示 — 對齊 ro-numbering / env-check-items 的 design pattern */}
      <div className="bg-[#FAEEDA] border border-[#BA7517] rounded-lg px-3.5 py-2.5 text-[12px] text-[#412402] leading-relaxed">
        <strong>⚠️ 重要：</strong>崗位折扣權限直接影響工單最終實收金額；折扣上限調整後即時生效，建議於月底結算後再調整、並通知 SA 團隊。超限折扣會自動觸發審批流，由配置的審批人核可後才會落 DB。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 左卡：崗位折扣權限 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              崗位折扣權限設定
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveAuthority}
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
                    崗位
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">
                    全場最高
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">
                    商品最高
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">
                    人工費最高
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">
                    超限需審批
                  </th>
                  {canEdit && (
                    <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold w-[64px]">
                      操作
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEdit ? 6 : 5}
                      className="px-3 py-10 text-center text-[12px] text-[#9A9890]"
                    >
                      尚無規則，點下方「+ 新增崗位」開始建立。
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id ?? `new-${idx}`}
                      className="border-t border-[#EEECE6]"
                    >
                      <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A]">
                        <div className="font-semibold">
                          {row.role_label || roleNameMap.get(row.scope_role_code) || row.scope_role_code}
                        </div>
                        <div className="text-[11px] text-[#9A9890]">
                          {row.scope_role_code}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <PctInput
                          value={row.overall_text}
                          onChange={(v) => updateRow(idx, { overall_text: v })}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PctInput
                          value={row.goods_text}
                          onChange={(v) => updateRow(idx, { goods_text: v })}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <PctInput
                          value={row.labor_text}
                          onChange={(v) => updateRow(idx, { labor_text: v })}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <select
                          value={row.approver_role_code}
                          onChange={(e) =>
                            updateRow(idx, { approver_role_code: e.target.value })
                          }
                          disabled={!canEdit}
                          className="h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] outline-none w-full max-w-[120px]"
                        >
                          <option value="">— 不允許</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      {canEdit && (
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
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

          {canEdit && remainingRoles.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[11px] text-[#9A9890]">+ 新增崗位：</span>
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
                <option value="">選擇崗位⋯</option>
                {remainingRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}（{r.id}）
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
            💡 折扣欄位填數字（0-100），不允許就填「—」或留空。修改後按右上「儲存」一次寫回。
          </div>
        </section>

        {/* 右卡：審批流設定 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
            isWfPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              審批流設定 · 超出折扣權限時觸發
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveWorkflow}
                disabled={isWfPending}
                className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isWfPending ? "提交中⋯" : "提交審批流設定"}
              </button>
            )}
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="第一級審批人（SA 超限）">
              <select
                value={wf.first_approver_role}
                onChange={(e) =>
                  setWf((s) => ({ ...s, first_approver_role: e.target.value }))
                }
                disabled={!canEdit}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="第二級審批人（主管超限）">
              <select
                value={wf.second_approver_role}
                onChange={(e) =>
                  setWf((s) => ({ ...s, second_approver_role: e.target.value }))
                }
                disabled={!canEdit}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="審批期限">
              <select
                value={wf.deadline_label}
                onChange={(e) =>
                  setWf((s) => ({ ...s, deadline_label: e.target.value }))
                }
                disabled={!canEdit}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
              >
                {DEADLINE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="逾期未審批處理方式">
              <select
                value={wf.overdue_action}
                onChange={(e) =>
                  setWf((s) => ({ ...s, overdue_action: e.target.value }))
                }
                disabled={!canEdit}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
              >
                {OVERDUE_ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
            💡 SA / 零件專員等下層崗位超限折扣 → 第一級；主管自己超限 → 第二級。
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

function PctInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-[80px] h-[26px] border border-[#D5D3CB] rounded px-2 font-mono text-[12px] text-center focus:border-[#185FA5] outline-none mx-auto block"
    />
  );
}
