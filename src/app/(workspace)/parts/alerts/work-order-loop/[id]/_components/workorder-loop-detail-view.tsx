"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createWorkorderLoopEntryAction,
  updateWorkorderLoopEntryAction,
  resolveWorkorderLoopEntryAction,
  escalateWorkorderLoopEntryAction,
  deleteWorkorderLoopEntryAction,
  type WorkorderLoopRow,
  type WorkorderLoopStatus,
} from "@/domain/alerts";
import { WORKORDER_LOOP_STATUS_CHIP, WORKORDER_LOOP_STATUS_OPTIONS } from "@/domain/alerts.constants";

type Draft = {
  ro_no: string;
  missing_parts: string;
  sa_name: string;
  shortage_reason: string;
  po_no: string;
  eta_label: string;
  days_pending: string;
  status: WorkorderLoopStatus;
  is_overdue: boolean;
  sort_order: string;
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const lockedClass =
  "h-[30px] border border-[#EEECE6] bg-[#F8F7F4] rounded px-2 text-[12.5px] text-[#5A5955] w-full inline-flex items-center";

function emptyDraft(): Draft {
  return {
    ro_no: "",
    missing_parts: "",
    sa_name: "",
    shortage_reason: "",
    po_no: "",
    eta_label: "",
    days_pending: "0",
    status: "pending",
    is_overdue: false,
    sort_order: "99",
  };
}

function fromRow(row: WorkorderLoopRow): Draft {
  return {
    ro_no: row.ro_no ?? "",
    missing_parts: row.missing_parts ?? "",
    sa_name: row.sa_name ?? "",
    shortage_reason: row.shortage_reason ?? "",
    po_no: row.po_no ?? "",
    eta_label: row.eta_label ?? "",
    days_pending: String(row.days_pending ?? 0),
    status: (row.status as WorkorderLoopStatus) ?? "pending",
    is_overdue: row.is_overdue ?? false,
    sort_order: row.sort_order != null ? String(row.sort_order) : "99",
  };
}

export function WorkorderLoopDetailView({
  entry,
  canEdit,
  initialMode = "view",
}: {
  entry: WorkorderLoopRow | null;
  canEdit: boolean;
  initialMode?: "view" | "edit" | "create";
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit" | "create">(initialMode);
  const [draft, setDraft] = useState<Draft>(() =>
    initialMode === "create" || !entry ? emptyDraft() : fromRow(entry),
  );
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function startCreate() {
    setMode("create");
    setDraft(emptyDraft());
    setFormError(null);
  }
  function startEdit() {
    if (!entry) return;
    setMode("edit");
    setDraft(fromRow(entry));
    setFormError(null);
  }
  function cancelEdit() {
    if (!entry) {
      router.push("/parts/alerts/work-order-loop");
      return;
    }
    setMode("view");
    setDraft(fromRow(entry));
    setFormError(null);
  }

  function submit() {
    setFormError(null);
    if (!draft.ro_no.trim()) {
      setFormError("工單號必填");
      return;
    }
    if (!draft.missing_parts.trim()) {
      setFormError("缺料備件必填");
      return;
    }
    const days = Number(draft.days_pending);
    if (Number.isNaN(days) || days < 0) {
      setFormError("待料天數必須是非負整數");
      return;
    }
    const sortNum = Number(draft.sort_order);
    if (Number.isNaN(sortNum)) {
      setFormError("排序必須是數字");
      return;
    }

    const payload = {
      ro_no: draft.ro_no.trim(),
      missing_parts: draft.missing_parts.trim(),
      sa_name: draft.sa_name.trim() || null,
      shortage_reason: draft.shortage_reason.trim() || null,
      po_no: draft.po_no.trim() || null,
      eta_label: draft.eta_label.trim() || null,
      days_pending: days,
      status: draft.status,
      is_overdue: draft.is_overdue,
      sort_order: sortNum,
    };

    startTransition(async () => {
      if (mode === "create") {
        const res = await createWorkorderLoopEntryAction(payload);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已建立" });
          router.push(`/parts/alerts/work-order-loop/${res.data.id}`);
        } else {
          setFormError(res.error);
        }
      } else if (mode === "edit" && entry) {
        const res = await updateWorkorderLoopEntryAction(entry.id, payload);
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已更新" });
          setMode("view");
          router.refresh();
        } else {
          setFormError(res.error);
        }
      }
    });
  }

  function resolveThis() {
    if (!entry) return;
    startTransition(async () => {
      const res = await resolveWorkorderLoopEntryAction(entry.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已解除待料" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function escalateThis() {
    if (!entry) return;
    startTransition(async () => {
      const res = await escalateWorkorderLoopEntryAction(entry.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已標記催單" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeThis() {
    if (!entry) return;
    if (!confirm("確定刪除此待料工單？此動作無法復原。")) return;
    startTransition(async () => {
      const res = await deleteWorkorderLoopEntryAction(entry.id);
      if (res.ok) {
        router.push("/parts/alerts/work-order-loop");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const isCreating = mode === "create";
  const isEditing = mode === "edit";
  const isLocked = pending;
  const statusChip =
    WORKORDER_LOOP_STATUS_CHIP[entry?.status ?? ""] ?? WORKORDER_LOOP_STATUS_CHIP.pending;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1) Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/alerts/work-order-loop" className="hover:text-[#185FA5]">
            工單增項閉環
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">
            {isCreating ? "新增" : entry?.ro_no ?? "—"}
          </span>
          {isEditing && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          )}
          {isCreating && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && entry && (
            <>
              <Link
                href="/parts/alerts/work-order-loop"
                className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={startCreate}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                onClick={startEdit}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              {entry.status !== "resolved" && (
                <>
                  <button
                    type="button"
                    onClick={resolveThis}
                    disabled={!canEdit || isLocked}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                  >
                    到庫解除
                  </button>
                  <button
                    type="button"
                    onClick={escalateThis}
                    disabled={!canEdit || isLocked}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  >
                    催單
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={removeThis}
                disabled={!canEdit || isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {isCreating && (
            <>
              <Link
                href="/parts/alerts/work-order-loop"
                className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submit}
                disabled={isLocked}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {pending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2) Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                WORKORDER LOOP ・ 待料工單
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {isCreating ? "（未建立待料工單）" : entry?.ro_no ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">
                  {isCreating ? "—" : entry?.missing_parts ?? "—"}
                </span>
                {!isCreating && entry && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip.chip}`}
                  >
                    {statusChip.label}
                  </span>
                )}
                {!isCreating && entry?.is_overdue && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
                    逾期
                  </span>
                )}
                {isCreating && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
              {isCreating ? "建立後可看到補貨進度" : "（補貨進度時間軸預留）"}
            </div>
          </div>
        </div>
      </header>

      {/* 3) Section card — 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="工單號 *"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.ro_no}
                  onChange={(e) => setDraft({ ...draft, ro_no: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：RO-20260514-001"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{entry?.ro_no ?? "—"}</span>
              )
            }
          />
          <Kv
            label="SA 人員"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.sa_name}
                  onChange={(e) => setDraft({ ...draft, sa_name: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：陳服務"
                  className={inputClass}
                />
              ) : (
                entry?.sa_name ?? "—"
              )
            }
          />
          <Kv
            label="排序"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                  disabled={isLocked}
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{entry?.sort_order ?? "—"}</span>
              )
            }
          />
          <div className="md:col-span-3">
            <Kv
              label="缺料備件 *"
              value={
                isEditing || isCreating ? (
                  <textarea
                    value={draft.missing_parts}
                    onChange={(e) =>
                      setDraft({ ...draft, missing_parts: e.target.value })
                    }
                    disabled={isLocked}
                    rows={2}
                    placeholder="例：機油濾清器 × 1；前煞車來令片 × 1"
                    className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full"
                  />
                ) : (
                  <span className="text-[12.5px] text-[#5A5955]">
                    {entry?.missing_parts ?? "—"}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      {/* 4) Section card — 待料狀態 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 待料狀態</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="狀態"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as WorkorderLoopStatus })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  {WORKORDER_LOOP_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip.chip}`}
                >
                  {statusChip.label}
                </span>
              )
            }
          />
          <Kv
            label="待料天數"
            value={
              isEditing || isCreating ? (
                <input
                  type="number"
                  value={draft.days_pending}
                  onChange={(e) => setDraft({ ...draft, days_pending: e.target.value })}
                  disabled={isLocked}
                  min={0}
                  className={inputClass}
                />
              ) : (
                <span
                  className={`font-mono ${
                    entry?.is_overdue ? "text-[#CC0000]" : "text-[#854F0B]"
                  }`}
                >
                  {entry?.days_pending ?? 0} 天
                </span>
              )
            }
          />
          <Kv
            label="是否逾期"
            value={
              isEditing || isCreating ? (
                <select
                  value={draft.is_overdue ? "true" : "false"}
                  onChange={(e) =>
                    setDraft({ ...draft, is_overdue: e.target.value === "true" })
                  }
                  disabled={isLocked}
                  className={inputClass}
                >
                  <option value="false">否</option>
                  <option value="true">是</option>
                </select>
              ) : (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                    entry?.is_overdue
                      ? "bg-[#FDECEA] text-[#CC0000]"
                      : "bg-[#F2F2F2] text-[#6B6A68]"
                  }`}
                >
                  {entry?.is_overdue ? "逾期" : "正常"}
                </span>
              )
            }
          />
          <div className="md:col-span-3">
            <Kv
              label="待料原因"
              value={
                isEditing || isCreating ? (
                  <input
                    type="text"
                    value={draft.shortage_reason}
                    onChange={(e) =>
                      setDraft({ ...draft, shortage_reason: e.target.value })
                    }
                    disabled={isLocked}
                    placeholder="例：庫存歸零、A 類備件缺貨..."
                    className={inputClass}
                  />
                ) : (
                  <span className="text-[12.5px] text-[#5A5955]">
                    {entry?.shortage_reason ?? "—"}
                  </span>
                )
              }
            />
          </div>
        </div>
      </section>

      {/* 5) Section card — 補貨進度 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 補貨進度</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="補貨單號"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.po_no}
                  onChange={(e) => setDraft({ ...draft, po_no: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：PO-20260514-001"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[#0F6E56]">{entry?.po_no ?? "—"}</span>
              )
            }
          />
          <Kv
            label="預計到貨"
            value={
              isEditing || isCreating ? (
                <input
                  type="text"
                  value={draft.eta_label}
                  onChange={(e) => setDraft({ ...draft, eta_label: e.target.value })}
                  disabled={isLocked}
                  placeholder="例：今日 17:00、05/15"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[#854F0B]">{entry?.eta_label ?? "—"}</span>
              )
            }
          />
          <Kv
            label="brand / 建立"
            value={
              entry ? (
                <span className={lockedClass}>
                  {entry.brand_id} ・{" "}
                  {new Date(entry.created_at).toLocaleDateString("zh-TW", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </span>
              ) : (
                <span className={lockedClass}>—</span>
              )
            }
          />
        </div>
      </section>

      {formError && (
        <div className="rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
          {formError}
        </div>
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
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <div className="text-[12.5px] text-[#2C2C2A]">{value}</div>
    </div>
  );
}
