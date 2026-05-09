"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkUpdateRulesAction,
  createFlowAction,
  createRuleAction,
  deleteFlowAction,
  deleteRuleAction,
  updateFlowAction,
  type FlowStep,
  type RuleBulkPatch,
} from "@/lib/parts-setup/purchase-permission-actions";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type RuleRow = {
  id: string;
  role_code: string;
  role_name: string;
  store_id: string | null;
  single_limit: number | null;
  monthly_limit: number | null;
  requires_approval: boolean;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
};

export type FlowRow = {
  id: string;
  flow_type: string;
  flow_name: string;
  description: string | null;
  color_tag: string;
  emoji: string | null;
  steps: FlowStep[];
  is_active: boolean;
  sort_order: number;
};

export type StoreOpt = { id: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

const COLOR_OPTIONS: Array<{
  key: string;
  label: string;
  badge: string;
  panel: string;
  panelBorder: string;
  textOnPanel: string;
}> = [
  {
    key: "green",
    label: "綠（計畫）",
    badge: "bg-[#EAF3DE] text-[#3B6D11]",
    panel: "bg-[#F8F7F4]",
    panelBorder: "border-[#EEECE6]",
    textOnPanel: "text-[#2C2C2A]",
  },
  {
    key: "amber",
    label: "黃（緊急）",
    badge: "bg-[#FDF3E3] text-[#854F0B]",
    panel: "bg-[#FDF3E3]",
    panelBorder: "border-[#FAC775]",
    textOnPanel: "text-[#854F0B]",
  },
  {
    key: "red",
    label: "紅（超額）",
    badge: "bg-[#FDECEA] text-[#CC0000]",
    panel: "bg-[#FDECEA]",
    panelBorder: "border-[#F5AEAD]",
    textOnPanel: "text-[#CC0000]",
  },
  {
    key: "navy",
    label: "藍",
    badge: "bg-[#EBF3FF] text-[#1A3A5C]",
    panel: "bg-[#EBF3FF]",
    panelBorder: "border-[#B5D4F4]",
    textOnPanel: "text-[#1A3A5C]",
  },
  {
    key: "teal",
    label: "青",
    badge: "bg-[#E8F5F0] text-[#0F6E56]",
    panel: "bg-[#E8F5F0]",
    panelBorder: "border-[#A8D8C7]",
    textOnPanel: "text-[#0F6E56]",
  },
  {
    key: "gray",
    label: "灰",
    badge: "bg-[#F2F2F2] text-[#5A5955]",
    panel: "bg-[#F2F2F2]",
    panelBorder: "border-[#D5D3CB]",
    textOnPanel: "text-[#5A5955]",
  },
];
function colorMeta(key: string) {
  return COLOR_OPTIONS.find((c) => c.key === key) ?? COLOR_OPTIONS[3];
}

// ──────────────────────────────────────────────────────────
// Top-level Board
// ──────────────────────────────────────────────────────────

export function PurchasePermissionsBoard({
  rules,
  flows,
  stores,
  canEdit,
}: {
  rules: RuleRow[];
  flows: FlowRow[];
  stores: StoreOpt[];
  canEdit: boolean;
}) {
  const [banner, setBanner] = useState<Banner>(null);

  // auto-dismiss success banner
  useEffect(() => {
    if (!banner || !banner.ok) return;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  return (
    <main className="px-6 py-6 space-y-5 bg-[#F8F7F4] min-h-[calc(100dvh-var(--shell-topbar-h,52px))]">
      <header className="space-y-1">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[20px] font-bold text-[#1A1917] tracking-tight">
            採購權限規則
          </h1>
          <span className="bg-[#EAF4FB] text-[#185FA5] text-[11px] font-semibold px-2 py-0.5 rounded-[10px]">
            1.2
          </span>
        </div>
        <p className="text-[12px] text-[#6B6A68]">
          依角色與門店設定採購金額上限與審核流程
        </p>
      </header>

      {banner && (
        <div
          className={`rounded-md px-4 py-2 text-[12px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C7E0AC]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RolesCard
          rules={rules}
          stores={stores}
          canEdit={canEdit}
          onBanner={setBanner}
        />
        <FlowsCard flows={flows} canEdit={canEdit} onBanner={setBanner} />
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────
// Roles Card（角色採購權限）
// ──────────────────────────────────────────────────────────

type RuleDraft = {
  id: string;
  single_limit: string;
  monthly_limit: string;
  requires_approval: boolean;
};

function RolesCard({
  rules,
  stores,
  canEdit,
  onBanner,
}: {
  rules: RuleRow[];
  stores: StoreOpt[];
  canEdit: boolean;
  onBanner: (b: Banner) => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  // 重置 drafts 當 server-side rules 變動
  const rulesKey = useMemo(
    () =>
      rules
        .map(
          (r) =>
            `${r.id}|${r.single_limit ?? ""}|${r.monthly_limit ?? ""}|${r.requires_approval}`,
        )
        .join(";"),
    [rules],
  );
  useEffect(() => {
    setDrafts({});
  }, [rulesKey]);

  function getDraft(rule: RuleRow): RuleDraft {
    return (
      drafts[rule.id] ?? {
        id: rule.id,
        single_limit: rule.single_limit === null ? "" : String(rule.single_limit),
        monthly_limit:
          rule.monthly_limit === null ? "" : String(rule.monthly_limit),
        requires_approval: rule.requires_approval,
      }
    );
  }
  function patchDraft(id: string, patch: Partial<RuleDraft>) {
    setDrafts((d) => {
      const cur = d[id] ?? getDraft(rules.find((r) => r.id === id)!);
      return { ...d, [id]: { ...cur, ...patch } };
    });
  }

  // 計算「有變更」的列數
  const dirtyPatches: RuleBulkPatch[] = useMemo(() => {
    const out: RuleBulkPatch[] = [];
    for (const r of rules) {
      const d = drafts[r.id];
      if (!d) continue;
      const sChanged =
        normalizeNum(d.single_limit) !==
        (r.single_limit === null ? null : r.single_limit);
      const mChanged =
        normalizeNum(d.monthly_limit) !==
        (r.monthly_limit === null ? null : r.monthly_limit);
      const aChanged = d.requires_approval !== r.requires_approval;
      if (sChanged || mChanged || aChanged) {
        out.push({
          id: r.id,
          single_limit: sChanged ? d.single_limit : undefined,
          monthly_limit: mChanged ? d.monthly_limit : undefined,
          requires_approval: aChanged ? d.requires_approval : undefined,
        });
      }
    }
    return out;
  }, [drafts, rules]);

  function onSaveAll() {
    if (dirtyPatches.length === 0) {
      onBanner({ ok: false, msg: "沒有要儲存的變更" });
      return;
    }
    startTransition(async () => {
      const res = await bulkUpdateRulesAction(dirtyPatches);
      if (res.ok) {
        onBanner({ ok: true, msg: `✓ 已儲存 ${res.data.updated} 筆規則` });
        setDrafts({});
        router.refresh();
      } else {
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  function onDeleteRule(id: string) {
    if (!confirm("確定刪除此角色規則？")) return;
    startTransition(async () => {
      const res = await deleteRuleAction(id);
      if (res.ok) {
        onBanner({ ok: true, msg: "✓ 已刪除規則" });
        router.refresh();
      } else {
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  const hasDirty = dirtyPatches.length > 0;
  const storeNameById = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🛡 角色採購權限
        </span>
        <div className="flex items-center gap-2">
          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={pending}
              className="px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
            >
              ＋ 新增角色
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={!hasDirty || pending}
              className={`px-3 h-[26px] rounded text-[11.5px] font-medium transition ${
                hasDirty && !pending
                  ? "bg-[#1A3A5C] hover:bg-[#0F2A45] text-white"
                  : "bg-[#F2F2F2] text-[#9A9890] cursor-not-allowed"
              }`}
            >
              {pending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner /> 儲存中⋯
                </span>
              ) : hasDirty ? (
                `儲存 (${dirtyPatches.length})`
              ) : (
                "儲存"
              )}
            </button>
          )}
        </div>
      </div>

      {adding && canEdit && (
        <RuleAddForm
          stores={stores}
          onClose={() => setAdding(false)}
          onResult={(b) => {
            onBanner(b);
            if (b?.ok) router.refresh();
          }}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F8F7F4] border-b border-[#EEECE6]">
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                角色
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                門店
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                單筆上限
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                月累計上限
              </th>
              <th className="px-3 py-2 text-center text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                需主管審核
              </th>
              {canEdit && (
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[#6B6A68] whitespace-nowrap">
                  動作
                </th>
              )}
            </tr>
          </thead>
          <tbody className={pending ? "opacity-60 pointer-events-none" : ""}>
            {rules.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-4 py-10 text-center text-[12px] text-[#9A9890]"
                >
                  尚無規則，點「＋ 新增角色」開始建立。
                </td>
              </tr>
            )}
            {rules.map((r) => {
              const d = getDraft(r);
              const dirty =
                d.requires_approval !== r.requires_approval ||
                normalizeNum(d.single_limit) !== r.single_limit ||
                normalizeNum(d.monthly_limit) !== r.monthly_limit;
              return (
                <tr
                  key={r.id}
                  className={`border-b border-[#EEECE6] last:border-b-0 ${
                    dirty ? "bg-[#FFFBEA]" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-[12.5px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#2C2C2A]">
                        {r.role_name}
                      </span>
                      <span className="font-mono text-[10.5px] text-[#9A9890]">
                        {r.role_code}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-[#5A5955]">
                    {r.store_id
                      ? (storeNameById.get(r.store_id) ?? "—")
                      : (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-[#EBF3FF] text-[#1A3A5C] text-[10.5px] font-medium">
                            品牌預設
                          </span>
                        )}
                  </td>
                  <td className="px-3 py-2">
                    <LimitInput
                      value={d.single_limit}
                      disabled={!canEdit}
                      onChange={(v) =>
                        patchDraft(r.id, { single_limit: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <LimitInput
                      value={d.monthly_limit}
                      disabled={!canEdit}
                      onChange={(v) =>
                        patchDraft(r.id, { monthly_limit: v })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={d.requires_approval}
                      onChange={(e) =>
                        patchDraft(r.id, {
                          requires_approval: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#1A3A5C] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteRule(r.id)}
                        disabled={pending}
                        className="px-2 h-[26px] rounded bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] text-[11px] hover:bg-[#FAD5D2] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-[#EEECE6] bg-[#FAFAF9] text-[11px] text-[#9A9890]">
        💡 提示：留空或填「無上限」代表此角色不受該項上限限制。修改後請按右上角「儲存」。
      </div>
    </section>
  );
}

function LimitInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const isUnlimited = value.trim() === "" || /無上限/i.test(value);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="無上限"
        className={`w-[120px] h-[26px] px-2 border rounded text-[11.5px] outline-none ${
          isUnlimited
            ? "border-[#D5D3CB] text-[#9A9890] italic"
            : "border-[#D5D3CB] text-[#2C2C2A] font-mono"
        } focus:border-[#185FA5] disabled:bg-[#F8F7F4] disabled:cursor-not-allowed`}
      />
    </div>
  );
}

function RuleAddForm({
  stores,
  onClose,
  onResult,
}: {
  stores: StoreOpt[];
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const [roleCode, setRoleCode] = useState("");
  const [roleName, setRoleName] = useState("");
  const [storeId, setStoreId] = useState<string>("");
  const [singleLimit, setSingleLimit] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [needsApproval, setNeedsApproval] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (!roleCode.trim() || !roleName.trim()) {
      setErr("角色代碼與名稱為必填");
      return;
    }
    startTransition(async () => {
      const res = await createRuleAction({
        role_code: roleCode,
        role_name: roleName,
        store_id: storeId || null,
        single_limit: singleLimit,
        monthly_limit: monthlyLimit,
        requires_approval: needsApproval,
      });
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已新增角色規則" });
        onClose();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      className={`px-4 py-3 border-b border-[#EEECE6] bg-[#FAFAF9] space-y-2 ${
        pending ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Field label="角色代碼 *">
          <input
            value={roleCode}
            onChange={(e) =>
              setRoleCode(e.target.value.toLowerCase().replace(/\s/g, "_"))
            }
            disabled={pending}
            placeholder="warehouse"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
          />
        </Field>
        <Field label="角色名稱 *">
          <input
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            disabled={pending}
            placeholder="倉管人員"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
          />
        </Field>
        <Field label="門店（不選 = 品牌預設）">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
          >
            <option value="">— 品牌預設 —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="需主管審核">
          <label className="inline-flex items-center gap-2 h-[30px] text-[12.5px] text-[#5A5955]">
            <input
              type="checkbox"
              checked={needsApproval}
              onChange={(e) => setNeedsApproval(e.target.checked)}
              disabled={pending}
              className="w-4 h-4 accent-[#1A3A5C]"
            />
            需要審核
          </label>
        </Field>
        <Field label="單筆上限">
          <input
            value={singleLimit}
            onChange={(e) => setSingleLimit(e.target.value)}
            disabled={pending}
            placeholder="例：10000，留空為無上限"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
          />
        </Field>
        <Field label="月累計上限">
          <input
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            disabled={pending}
            placeholder="例：50000，留空為無上限"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none"
          />
        </Field>
      </div>

      {err && (
        <div className="text-[11.5px] text-[#CC0000]">{err}</div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-3 h-[28px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="px-3 h-[28px] rounded bg-[#0F6E56] hover:bg-[#0a5642] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {pending ? (
            <>
              <Spinner /> 建立中⋯
            </>
          ) : (
            "建立"
          )}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Flows Card（採購類型審核流程）
// ──────────────────────────────────────────────────────────

function FlowsCard({
  flows,
  canEdit,
  onBanner,
}: {
  flows: FlowRow[];
  canEdit: boolean;
  onBanner: (b: Banner) => void;
}) {
  const [editing, setEditing] = useState<FlowRow | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#1A1917]">
          🔁 採購類型審核流程
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
            className="px-2.5 h-[26px] rounded bg-[#0F6E56] hover:bg-[#0a5642] text-white text-[11.5px] font-medium"
          >
            ＋ 新增流程
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {(adding || editing) && canEdit && (
          <FlowForm
            mode={editing ? "update" : "create"}
            flow={editing ?? undefined}
            onClose={() => {
              setAdding(false);
              setEditing(null);
            }}
            onResult={onBanner}
          />
        )}

        {flows.length === 0 && !adding && (
          <div className="px-2 py-8 text-center text-[12px] text-[#9A9890]">
            尚無流程設定。
          </div>
        )}

        {flows.map((f) => (
          <FlowItem
            key={f.id}
            flow={f}
            canEdit={canEdit}
            onEdit={() => {
              setEditing(f);
              setAdding(false);
            }}
            onResult={onBanner}
          />
        ))}
      </div>
    </section>
  );
}

function FlowItem({
  flow,
  canEdit,
  onEdit,
  onResult,
}: {
  flow: FlowRow;
  canEdit: boolean;
  onEdit: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const c = colorMeta(flow.color_tag);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`確定刪除「${flow.flow_name}」流程？`)) return;
    startTransition(async () => {
      const res = await deleteFlowAction(flow.id);
      if (res.ok) {
        onResult({ ok: true, msg: "✓ 已刪除流程" });
        router.refresh();
      } else {
        onResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div
      className={`rounded-md border ${c.panelBorder} ${c.panel} px-3 py-2.5 ${
        pending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`text-[13px] font-semibold ${c.textOnPanel}`}>
          {flow.emoji ? `${flow.emoji} ` : ""}
          {flow.flow_name}
          <span className="ml-2 font-mono text-[10.5px] text-[#9A9890] font-normal">
            {flow.flow_type}
          </span>
        </div>
        {canEdit && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="px-2 h-[24px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
            >
              編輯
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="px-2 h-[24px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[11px] hover:bg-[#FDECEA]"
            >
              刪除
            </button>
          </div>
        )}
      </div>

      {flow.description && (
        <div className="text-[12px] text-[#5A5955] mt-1">{flow.description}</div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {flow.steps.map((s, i) => {
          const sc = colorMeta(s.color ?? "navy");
          return (
            <span key={`${flow.id}-${i}`} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${sc.badge}`}
              >
                {s.label}
              </span>
              {i < flow.steps.length - 1 && (
                <span className="text-[#9A9890] text-[11px]">→</span>
              )}
            </span>
          );
        })}
        {flow.steps.length === 0 && (
          <span className="text-[11px] text-[#9A9890] italic">尚無步驟</span>
        )}
      </div>
    </div>
  );
}

function FlowForm({
  mode,
  flow,
  onClose,
  onResult,
}: {
  mode: "create" | "update";
  flow?: FlowRow;
  onClose: () => void;
  onResult: (b: Banner) => void;
}) {
  const router = useRouter();
  const [flowType, setFlowType] = useState(flow?.flow_type ?? "");
  const [flowName, setFlowName] = useState(flow?.flow_name ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [colorTag, setColorTag] = useState(flow?.color_tag ?? "navy");
  const [emoji, setEmoji] = useState(flow?.emoji ?? "");
  const [steps, setSteps] = useState<FlowStep[]>(
    flow?.steps && flow.steps.length > 0
      ? flow.steps
      : [{ label: "", color: "navy" }],
  );
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function setStep(i: number, patch: Partial<FlowStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { label: "", color: "navy" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onSubmit() {
    setErr(null);
    if (!flowType.trim() || !flowName.trim()) {
      setErr("流程代碼與名稱為必填");
      return;
    }
    const cleanedSteps = steps.filter((s) => s.label.trim().length > 0);

    startTransition(async () => {
      const payload = {
        flow_type: flowType,
        flow_name: flowName,
        description,
        color_tag: colorTag,
        emoji,
        steps: cleanedSteps,
      };
      const res =
        mode === "create"
          ? await createFlowAction(payload)
          : await updateFlowAction(flow!.id, payload);
      if (res.ok) {
        onResult({
          ok: true,
          msg: mode === "create" ? "✓ 已新增流程" : "✓ 已更新流程",
        });
        onClose();
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div
      className={`rounded-md border border-[#185FA5] bg-[#F0F7FF] p-3 space-y-2 ${
        pending ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="text-[12px] font-semibold text-[#1A3A5C]">
        {mode === "create" ? "新增流程" : `編輯：${flow?.flow_name}`}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="代碼 *">
          <input
            value={flowType}
            onChange={(e) =>
              setFlowType(e.target.value.toLowerCase().replace(/\s/g, "_"))
            }
            disabled={pending || mode === "update"}
            placeholder="planned"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded font-mono text-[12px] focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
          />
        </Field>
        <Field label="名稱 *">
          <input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            disabled={pending}
            placeholder="計畫採購"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
          />
        </Field>
        <Field label="顏色">
          <select
            value={colorTag}
            onChange={(e) => setColorTag(e.target.value)}
            disabled={pending}
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
          >
            {COLOR_OPTIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Emoji">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            disabled={pending}
            placeholder="🟢"
            className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
          />
        </Field>
      </div>

      <Field label="描述">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
          placeholder="例：倉管建立 → 主管審核 → 自動採購"
          className="w-full h-[30px] px-2 border border-[#D5D3CB] rounded text-[12.5px] focus:border-[#185FA5] outline-none"
        />
      </Field>

      <div>
        <div className="text-[11px] font-semibold text-[#6B6A68] mb-1.5">
          流程步驟（拖曳順序由上而下）
        </div>
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#9A9890] w-5 text-right">
                {i + 1}.
              </span>
              <input
                value={s.label}
                onChange={(e) => setStep(i, { label: e.target.value })}
                disabled={pending}
                placeholder="步驟名稱"
                className="flex-1 h-[28px] px-2 border border-[#D5D3CB] rounded text-[12px] focus:border-[#185FA5] outline-none"
              />
              <select
                value={s.color ?? "navy"}
                onChange={(e) => setStep(i, { color: e.target.value })}
                disabled={pending}
                className="h-[28px] px-2 border border-[#D5D3CB] rounded text-[11.5px] focus:border-[#185FA5] outline-none"
              >
                {COLOR_OPTIONS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeStep(i)}
                disabled={pending}
                className="px-2 h-[28px] rounded bg-white border border-[#F5AEAD] text-[#CC0000] text-[11px]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStep}
          disabled={pending}
          className="mt-1.5 px-2.5 h-[26px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11px]"
        >
          ＋ 新增步驟
        </button>
      </div>

      {err && <div className="text-[11.5px] text-[#CC0000]">{err}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="px-3 h-[28px] rounded bg-white border border-[#D5D3CB] hover:border-[#9A9890] text-[#5A5955] text-[11.5px] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="px-3 h-[28px] rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {pending ? (
            <>
              <Spinner /> 儲存中⋯
            </>
          ) : mode === "create" ? (
            "建立"
          ) : (
            "更新"
          )}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium text-[#9A9890]">{label}</span>
      {children}
    </label>
  );
}

function Spinner() {
  return (
    <svg
      className="w-3.5 h-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function normalizeNum(v: string): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  if (/無上限|unlimited|∞|n\/a/i.test(s)) return null;
  const cleaned = s.replace(/NT\$|TWD|\$|,|\s/gi, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

