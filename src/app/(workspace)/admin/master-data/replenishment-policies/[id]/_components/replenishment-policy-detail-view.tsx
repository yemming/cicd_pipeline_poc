"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createReplenishmentPolicyAction,
  deleteReplenishmentPolicyAction,
  updateReplenishmentPolicyAction,
  type ReplenishmentPolicyInput,
} from "@/lib/master-data/replenishment-policy-actions";
import type {
  ReplenishmentPolicyFieldKey,
  ReplenishmentPolicyRow,
} from "@/lib/master-data/replenishment-policy-form-types";
import { FREQUENCY_LABEL } from "@/lib/master-data/replenishment-policy-form-types";
import type { Warehouse } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "basic" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "排程設定" },
  { key: "audit", label: "稽核資訊" },
];

const FREQ_OPTIONS: { value: ReplenishmentPolicyInput["frequency"]; label: string }[] = [
  { value: "weekly_mon", label: "每週一" },
  { value: "biweekly", label: "每兩週" },
  { value: "monthly_1", label: "每月一日" },
  { value: "manual", label: "手動觸發" },
];

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

const blankInput = (): ReplenishmentPolicyInput => ({
  warehouse_id: null,
  frequency: "weekly_mon",
  horizon_days: 7,
  auto_create_pr_for_urgent: false,
  include_forecast: false,
  notes: null,
  is_active: true,
});

const fromRow = (r: ReplenishmentPolicyRow): ReplenishmentPolicyInput => ({
  warehouse_id: r.warehouse_id,
  frequency: r.frequency,
  horizon_days: r.horizon_days,
  auto_create_pr_for_urgent: r.auto_create_pr_for_urgent,
  include_forecast: r.include_forecast,
  notes: r.notes,
  is_active: r.is_active,
});

export function ReplenishmentPolicyDetailView({
  policy,
  warehouses,
  canEdit,
  initialMode = "view",
}: {
  policy: ReplenishmentPolicyRow | null;
  warehouses: Warehouse[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [draft, setDraft] = useState<ReplenishmentPolicyInput>(
    policy ? fromRow(policy) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<ReplenishmentPolicyInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ReplenishmentPolicyFieldKey, string>>
  >({});

  const showInputs = editing || creating;
  const formDraft: ReplenishmentPolicyInput = creating ? createDraft : draft;
  const setFormDraft = (next: ReplenishmentPolicyInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const targetWh = policy?.warehouse_id ? warehouseById.get(policy.warehouse_id) : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!policy) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateReplenishmentPolicyAction(policy.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (policy) setDraft(fromRow(policy));
    setFieldErrors({});
    setEditing(false);
  };

  const toggleActive = () => {
    if (!policy) return;
    startTransition(async () => {
      const res = await updateReplenishmentPolicyAction(policy.id, {
        ...fromRow(policy),
        is_active: !policy.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: policy.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setFieldErrors({});
    setCreating(true);
  };

  const cancelCreate = () => {
    setFieldErrors({});
    if (initialMode === "create") router.push("/admin/master-data/replenishment-policies");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createReplenishmentPolicyAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立補貨計畫，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/replenishment-policies/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!policy) return;
    if (!confirm("確定刪除此補貨計畫？")) return;
    startTransition(async () => {
      const res = await deleteReplenishmentPolicyAction(policy.id);
      if (res.ok) {
        router.push("/admin/master-data/replenishment-policies");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const scopeLabel = creating
    ? "（未設定）"
    : policy
      ? policy.warehouse_id
        ? targetWh
          ? `${targetWh.code} ・ ${targetWh.name}`
          : "（已停用倉庫）"
        : "全域預設（所有倉）"
      : "（資料缺失）";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/admin/master-data/replenishment-policies"
            className="hover:text-[#185FA5]"
          >
            補貨計畫設定
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">
            {creating ? "新增計畫" : scopeLabel}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/admin/master-data/replenishment-policies"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || !policy}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !policy}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !policy}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {policy?.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">補貨計畫</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {scopeLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                ) : policy ? (
                  <>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        policy.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {policy.is_active ? "啟用" : "停用"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                      {FREQUENCY_LABEL[policy.frequency] ?? policy.frequency}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                      展望 {policy.horizon_days} 天
                    </span>
                    {policy.auto_create_pr_for_urgent ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                        緊急自動 PR
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div
              className={`w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] ${
                creating
                  ? "border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
                  : "border border-[#EEECE6] bg-[#F8F7F4]"
              }`}
            >
              {creating ? (
                <span>建立後可調整頻率與展望天數</span>
              ) : (
                <>
                  <div className="text-[11px] text-[#9A9890]">展望天數</div>
                  <div className="text-[26px] font-semibold text-[#2C2C2A] font-mono">
                    {policy?.horizon_days ?? "—"}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    {policy ? (FREQUENCY_LABEL[policy.frequency] ?? policy.frequency) : "—"}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="作用範圍（倉庫）"
            value={
              showInputs ? (
                <select
                  value={formDraft.warehouse_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, warehouse_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 全域預設（所有倉）—</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} ・ {w.name}
                    </option>
                  ))}
                </select>
              ) : policy?.warehouse_id ? (
                targetWh ? (
                  <span>
                    <span className="font-mono">{targetWh.code}</span> ・ {targetWh.name}
                  </span>
                ) : (
                  <span className="text-[#9A9890]">已停用倉庫</span>
                )
              ) : (
                "全域預設（所有倉）"
              )
            }
          />
          <Kv
            label="排程頻率*"
            value={
              showInputs ? (
                <select
                  value={formDraft.frequency ?? "weekly_mon"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      frequency: e.target.value as ReplenishmentPolicyInput["frequency"],
                    })
                  }
                  className={inputClass}
                >
                  {FREQ_OPTIONS.map((o) => (
                    <option key={o.value as string} value={o.value as string}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                FREQUENCY_LABEL[policy?.frequency ?? ""] ?? policy?.frequency ?? "—"
              )
            }
          />
          <Kv
            label="展望天數*"
            value={
              showInputs ? (
                <input
                  type="number"
                  min={1}
                  value={formDraft.horizon_days ?? 7}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      horizon_days: parseInt(e.target.value || "0", 10) || 7,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{policy?.horizon_days ?? "—"} 天</span>
              )
            }
          />
        </div>
        {Object.values(fieldErrors).some(Boolean) ? (
          <div className="px-4 pb-3 text-[11.5px] text-[#CC0000]">
            {Object.entries(fieldErrors)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        ) : null}
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該補貨計畫的詳情頁，可進一步調整自動 PR / 預測展望設定。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && policy ? (
        <>
          <div
            className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
            id="tab-content"
          >
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                      active
                        ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                        : "text-[#5A5955] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "basic" ? (
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${showInputs ? lockedClass : ""}`}
              >
                {sectionCard(
                  "自動化選項",
                  <div className="grid grid-cols-1 gap-3">
                    <Kv
                      label="緊急料件自動建 PR"
                      value={
                        showInputs ? (
                          <label className="inline-flex items-center gap-2 text-[12.5px]">
                            <input
                              type="checkbox"
                              checked={formDraft.auto_create_pr_for_urgent === true}
                              onChange={(e) =>
                                setFormDraft({
                                  ...formDraft,
                                  auto_create_pr_for_urgent: e.target.checked,
                                })
                              }
                            />
                            <span>啟用</span>
                          </label>
                        ) : policy.auto_create_pr_for_urgent ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                            啟用
                          </span>
                        ) : (
                          <span className="text-[#9A9890]">未啟用</span>
                        )
                      }
                    />
                    <Kv
                      label="納入需求預測"
                      value={
                        showInputs ? (
                          <label className="inline-flex items-center gap-2 text-[12.5px]">
                            <input
                              type="checkbox"
                              checked={formDraft.include_forecast === true}
                              onChange={(e) =>
                                setFormDraft({
                                  ...formDraft,
                                  include_forecast: e.target.checked,
                                })
                              }
                            />
                            <span>啟用</span>
                          </label>
                        ) : policy.include_forecast ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                            啟用
                          </span>
                        ) : (
                          <span className="text-[#9A9890]">未啟用</span>
                        )
                      }
                    />
                  </div>,
                )}
                {sectionCard(
                  "備註",
                  <Kv
                    label="補充說明"
                    value={
                      showInputs ? (
                        <textarea
                          value={formDraft.notes ?? ""}
                          onChange={(e) =>
                            setFormDraft({ ...formDraft, notes: e.target.value || null })
                          }
                          rows={4}
                          placeholder="特殊倉的補貨節奏、停用原因…"
                          className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full"
                        />
                      ) : policy.notes ? (
                        <div className="whitespace-pre-wrap text-[12.5px]">{policy.notes}</div>
                      ) : (
                        <span className="text-[#9A9890]">—</span>
                      )
                    }
                  />,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv
                      label="系統識別碼"
                      value={<span className="font-mono">{policy.id}</span>}
                      small
                    />
                    <Kv label="品牌" value={policy.brand_id} mono small />
                  </>,
                )}
                {sectionCard(
                  "建立",
                  <Kv label="建立時間" value={fmtDateTime(policy.created_at)} mono small />,
                )}
                {sectionCard(
                  "更新",
                  <Kv label="最後更新" value={fmtDateTime(policy.updated_at)} mono small />,
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
