"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CountPlanListRow } from "@/domain/count";
import {
  createCountPlanAction,
  updateCountPlanAction,
  setCountPlanActiveAction,
  deleteCountPlanAction,
} from "@/domain/count";
import {
  COUNT_PLAN_TYPE_CHIP,
  COUNT_PLAN_TYPE_OPTIONS,
  ABC_FILTER_OPTIONS,
} from "@/domain/count.constants";

type WarehouseOption = { id: string; name: string; code: string };
type Mode = "view" | "edit" | "create";

type Draft = {
  plan_name: string;
  warehouse_id: string;
  plan_type: string;
  abc_filter: string;
  schedule_cron: string;
  next_run_at: string;
  notes: string;
};

function planToDraft(p: CountPlanListRow | null, defaultWh: string): Draft {
  if (!p) {
    return {
      plan_name: "",
      warehouse_id: defaultWh,
      plan_type: "cycle",
      abc_filter: "",
      schedule_cron: "",
      next_run_at: "",
      notes: "",
    };
  }
  return {
    plan_name: p.plan_name ?? "",
    warehouse_id: p.warehouse_id ?? defaultWh,
    plan_type: p.plan_type ?? "cycle",
    abc_filter: p.abc_filter ?? "",
    schedule_cron: p.schedule_cron ?? "",
    next_run_at: p.next_run_at ? p.next_run_at.slice(0, 10) : "",
    notes: p.notes ?? "",
  };
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return d.slice(0, 10).replace(/-/g, "/");
}

export function CountPlanDetailView({
  plan,
  warehouses,
  canEdit,
  initialMode,
}: {
  plan: CountPlanListRow | null;
  warehouses: WarehouseOption[];
  canEdit: boolean;
  initialMode: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [draft, setDraft] = useState<Draft>(
    planToDraft(plan, warehouses[0]?.id ?? ""),
  );
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function enterEdit() {
    setDraft(planToDraft(plan, warehouses[0]?.id ?? ""));
    setFormError(null);
    setMode("edit");
  }

  function enterCreate() {
    setDraft({
      plan_name: "",
      warehouse_id: warehouses[0]?.id ?? "",
      plan_type: "cycle",
      abc_filter: "",
      schedule_cron: "",
      next_run_at: "",
      notes: "",
    });
    setFormError(null);
    setMode("create");
  }

  function cancelEdit() {
    setDraft(planToDraft(plan, warehouses[0]?.id ?? ""));
    setFormError(null);
    setMode("view");
  }

  function submitSave() {
    setFormError(null);
    if (!draft.plan_name.trim()) {
      setFormError("計畫名稱不可為空");
      return;
    }
    if (!draft.warehouse_id) {
      setFormError("倉庫必選");
      return;
    }
    startTransition(async () => {
      if (mode === "create") {
        const res = await createCountPlanAction({
          plan_name: draft.plan_name,
          warehouse_id: draft.warehouse_id,
          plan_type: (draft.plan_type as
            | "cycle"
            | "full"
            | "spot"
            | "abc_a"
            | "abc_b"
            | "abc_c") ?? "cycle",
          abc_filter: (draft.abc_filter as "A" | "B" | "C" | "all") || undefined,
          notes: draft.notes || undefined,
        });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        // 補 schedule_cron / next_run_at
        if (draft.schedule_cron || draft.next_run_at) {
          await updateCountPlanAction(res.data.plan_id, {
            schedule_cron: draft.schedule_cron || null,
            next_run_at: draft.next_run_at || null,
          });
        }
        router.push(`/parts/count/plans/${res.data.plan_id}`);
      } else if (mode === "edit" && plan) {
        const res = await updateCountPlanAction(plan.id, {
          plan_name: draft.plan_name,
          warehouse_id: draft.warehouse_id,
          plan_type: draft.plan_type,
          abc_filter: draft.abc_filter || null,
          schedule_cron: draft.schedule_cron || null,
          next_run_at: draft.next_run_at || null,
          notes: draft.notes || null,
        });
        if (!res.ok) {
          setFormError(res.error);
          return;
        }
        setMode("view");
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      }
    });
  }

  function toggleActive() {
    if (!plan) return;
    startTransition(async () => {
      const res = await setCountPlanActiveAction(plan.id, !plan.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: plan.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow() {
    if (!plan) return;
    if (!confirm(`確定刪除計畫「${plan.plan_name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCountPlanAction(plan.id);
      if (res.ok) {
        router.push("/parts/count/plans");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const planTypeDef =
    plan && COUNT_PLAN_TYPE_CHIP[plan.plan_type ?? ""]
      ? COUNT_PLAN_TYPE_CHIP[plan.plan_type ?? ""]
      : null;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/count/plans"
            className="hover:text-[#185FA5]"
          >
            盤點計畫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {mode === "create" ? "新增" : plan?.plan_name ?? "—"}
          </span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              建立模式
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && plan && (
            <>
              <Link
                href="/parts/count/plans"
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={enterCreate}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={removeRow}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={toggleActive}
                disabled={!canEdit || isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {plan.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}

          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={submitSave}
                disabled={isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
            </>
          )}

          {mode === "create" && (
            <>
              <Link
                href="/parts/count/plans"
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submitSave}
                disabled={isPending}
                className="inline-flex items-center h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                INVENTORY COUNT PLAN
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {mode === "create"
                  ? "（未命名計畫）"
                  : plan?.plan_name ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {mode === "create" ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                ) : plan ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {plan.warehouse_name ?? "—"}
                    </span>
                    {planTypeDef && (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${planTypeDef.chip}`}
                      >
                        {planTypeDef.label}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
                        plan.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {plan.is_active ? "啟用" : "停用"}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ▼ 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {mode === "view" && plan ? (
            <>
              <Kv label="計畫名稱" value={plan.plan_name ?? "—"} />
              <Kv label="倉庫" value={plan.warehouse_name ?? "—"} />
              <Kv
                label="計畫類型"
                value={
                  COUNT_PLAN_TYPE_CHIP[plan.plan_type ?? ""]?.label ??
                  plan.plan_type ??
                  "—"
                }
              />
              <Kv label="ABC 範圍" value={plan.abc_filter ?? "—"} />
              <Kv
                label="啟用狀態"
                value={plan.is_active ? "啟用" : "停用"}
              />
              <Kv
                label="建立時間"
                value={plan.created_at ? fmtDate(plan.created_at) : "—"}
                mono
              />
            </>
          ) : (
            <>
              <KvEdit label="計畫名稱 *">
                <input
                  value={draft.plan_name}
                  onChange={(e) =>
                    setDraft({ ...draft, plan_name: e.target.value })
                  }
                  disabled={isPending}
                  placeholder="例：信義主倉月底盤點"
                  className={inputClass}
                />
              </KvEdit>
              <KvEdit label="倉庫 *">
                <select
                  value={draft.warehouse_id}
                  onChange={(e) =>
                    setDraft({ ...draft, warehouse_id: e.target.value })
                  }
                  disabled={isPending}
                  className={inputClass}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} ・ {w.name}
                    </option>
                  ))}
                </select>
              </KvEdit>
              <KvEdit label="計畫類型">
                <select
                  value={draft.plan_type}
                  onChange={(e) =>
                    setDraft({ ...draft, plan_type: e.target.value })
                  }
                  disabled={isPending}
                  className={inputClass}
                >
                  {COUNT_PLAN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </KvEdit>
              <KvEdit label="ABC 範圍">
                <select
                  value={draft.abc_filter}
                  onChange={(e) =>
                    setDraft({ ...draft, abc_filter: e.target.value })
                  }
                  disabled={isPending}
                  className={inputClass}
                >
                  {ABC_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </KvEdit>
            </>
          )}
        </div>
      </section>

      {/* ▼ 排程設定 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 排程設定
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {mode === "view" && plan ? (
            <>
              <Kv label="排程 cron" value={plan.schedule_cron ?? "—"} mono />
              <Kv label="下次執行" value={fmtDate(plan.next_run_at)} mono />
              <Kv label="上次執行" value={fmtDate(plan.last_run_at)} mono />
            </>
          ) : (
            <>
              <KvEdit label="排程 cron (選填)">
                <input
                  value={draft.schedule_cron}
                  onChange={(e) =>
                    setDraft({ ...draft, schedule_cron: e.target.value })
                  }
                  disabled={isPending}
                  placeholder="0 9 1 * *"
                  className={`${inputClass} font-mono`}
                />
              </KvEdit>
              <KvEdit label="下次執行日">
                <input
                  type="date"
                  value={draft.next_run_at}
                  onChange={(e) =>
                    setDraft({ ...draft, next_run_at: e.target.value })
                  }
                  disabled={isPending}
                  className={inputClass}
                />
              </KvEdit>
            </>
          )}
        </div>
      </section>

      {/* ▼ 備註 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 備註
          </span>
        </header>
        <div className="px-4 py-4">
          {mode === "view" && plan ? (
            <p className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
              {plan.notes ?? "—"}
            </p>
          ) : (
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              disabled={isPending}
              rows={4}
              placeholder="盤點重點、備註事項…"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          )}
        </div>
      </section>

      {formError && (
        <div className="rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
          {formError}
        </div>
      )}

      {mode === "create" && (
        <p className="text-[12px] text-[#9A9890]">
          建立後將跳轉到該計畫的詳情頁，可進一步維護排程⋯
        </p>
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
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function KvEdit({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[#9A9890] font-medium">{label}</span>
      {children}
    </div>
  );
}
