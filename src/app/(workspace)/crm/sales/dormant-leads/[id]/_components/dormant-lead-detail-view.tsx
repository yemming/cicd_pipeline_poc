"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDormantLeadAction,
  deleteDormantLeadAction,
  markLeadLostAction,
  reviveDormantLeadAction,
  updateDormantLeadAction,
  type DormantLeadInput,
} from "@/lib/sales/sales-dormant-leads-actions";
import {
  DORMANCY_STATUS_BADGE,
  DORMANCY_STATUS_LABEL,
  LOST_REASON_B9_LABEL,
  dormancyBucket,
  dormancyCopy,
  lostReasonLabel,
  mapDbToLostReasonB9,
  mapLostReasonB9ToDb,
  type DormancyStatus,
  type DormantLeadKind,
  type LostReason,
  type LostReasonB9,
} from "@/domain/sales-dormant-leads.constants";
import {
  LOST_REASON_LABEL as AFTERSALES_LOST_REASON_LABEL,
  type AftersalesLostReason,
} from "@/domain/crm-aftersales-dormant.constants";
import type { DormantLeadRow } from "@/domain/sales-dormant-leads";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";
type TabKey = "history" | "revive" | "notes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "history", label: "互動歷程" },
  { key: "revive", label: "喚醒紀錄" },
  { key: "notes", label: "備註與標籤" },
];

const STATUS_OPTIONS_SALES: { value: DormancyStatus; label: string }[] = [
  { value: "active", label: "活躍中" },
  { value: "dormant", label: "休眠" },
  { value: "lost", label: "戰敗" },
  { value: "revived", label: "已喚醒" },
  { value: "converted", label: "已成交" },
];

const STATUS_OPTIONS_AFTERSALES: { value: DormancyStatus; label: string }[] = [
  { value: "active", label: "活躍中" },
  { value: "dormant", label: "休眠" },
  { value: "lost", label: "已流失" },
  { value: "revived", label: "已喚回" },
  { value: "converted", label: "已回流" },
];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function toDateInput(s: string | null | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function fromDateInput(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// 本元件用的 local form shape（含 aftersales_lost_reason，比 action input 多一欄）
type LocalFormState = DormantLeadInput & {
  aftersales_lost_reason: AftersalesLostReason | null;
};

const blankInput = (kind: DormantLeadKind): LocalFormState => ({
  name: "",
  phone: null,
  email: null,
  habc: null,
  intent_model: null,
  source: null,
  rs_name: null,
  dormancy_status: "dormant",
  lost_reason: null,
  aftersales_lost_reason: null,
  competitor_brand: null,
  lost_at: null,
  last_visit_at: null,
  next_revive_at: null,
  note: null,
  kind,
});

const fromLead = (l: DormantLeadRow): LocalFormState => ({
  name: l.name,
  phone: l.phone,
  email: l.email,
  habc: l.habc,
  intent_model: l.intent_model,
  source: l.source,
  rs_name: l.rs_name,
  dormancy_status: l.dormancy_status,
  lost_reason: l.lost_reason,
  aftersales_lost_reason: l.aftersales_lost_reason,
  competitor_brand: l.competitor_brand,
  lost_at: l.lost_at,
  last_visit_at: l.last_visit_at,
  next_revive_at: l.next_revive_at,
  note: l.note,
  kind: l.kind,
});

export function DormantLeadDetailView({
  lead,
  canEdit,
  initialMode = "view",
  basePath = "/crm/sales/dormant-leads",
  kind: kindProp,
}: {
  lead: DormantLeadRow | null;
  canEdit: boolean;
  initialMode?: Mode;
  basePath?: string;
  /** 用於 create mode；view/edit mode 會取 lead.kind */
  kind?: DormantLeadKind;
}) {
  // kind 優先序：lead.kind > kindProp > 'sales'
  const kind: DormantLeadKind = lead?.kind ?? kindProp ?? "sales";
  const copy = dormancyCopy(kind);
  const reasonMap = lostReasonLabel(kind);
  const isAfter = kind === "aftersales";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tab, setTab] = useState<TabKey>("history");

  const [form, setForm] = useState<LocalFormState>(() =>
    lead ? fromLead(lead) : blankInput(kind),
  );

  const creating = mode === "create" || !lead;
  const editing = mode === "edit";
  const readOnly = !editing && !creating;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      showBanner({ ok: false, msg: "客戶姓名必填" });
      return;
    }
    startTransition(async () => {
      const res = creating
        ? await createDormantLeadAction(form)
        : await updateDormantLeadAction(lead!.id, form);
      if (res.ok) {
        showBanner({ ok: true, msg: creating ? "✓ 已建立" : "✓ 已儲存變更" });
        if (creating) {
          router.push(`${basePath}/${res.data.id}`);
        } else {
          setMode("view");
          router.refresh();
        }
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleCancel = () => {
    if (creating) {
      router.push(basePath);
      return;
    }
    setForm(fromLead(lead!));
    setMode("view");
  };

  const handleDelete = () => {
    if (!lead) return;
    if (
      !confirm(
        `確定刪除${copy.noun}「${lead.code} ${lead.name}」？此動作不可復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteDormantLeadAction(lead.id, kind);
      if (res.ok) {
        router.push(basePath);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleRevive = () => {
    if (!lead) return;
    startTransition(async () => {
      const res = await reviveDormantLeadAction(lead.id, kind);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: isAfter ? "✓ 已記錄一次喚回" : "✓ 已記錄一次再接觸",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleMarkLost = () => {
    if (!lead) return;
    if (isAfter) {
      // 裁示三：售後流失 → 讀 aftersales_lost_reason，直接傳給 action
      const aftersalesReason: AftersalesLostReason = form.aftersales_lost_reason ?? "other";
      startTransition(async () => {
        const res = await markLeadLostAction(
          lead.id,
          aftersalesReason,
          null, // aftersales 不用競品品牌
          kind,
        );
        if (res.ok) {
          const callTaskMsg = res.data.callTaskCreated
            ? `（已自動建立喚醒電訪任務）`
            : res.data.callTaskError
              ? `（自動建任務失敗：${res.data.callTaskError}）`
              : "";
          showBanner({ ok: true, msg: `✓ 已標記為流失 ${callTaskMsg}` });
          router.refresh();
        } else {
          showBanner({ ok: false, msg: res.error });
        }
      });
      return;
    }
    // 銷售戰敗 → 輪11-1：UI 使用 B9 8 類原因，讀取 form 中的 lost_reason（DB 值）並反查到 B9
    const dbReason = (form.lost_reason ?? "other") as LostReason;
    const b9Reason: LostReasonB9 = mapDbToLostReasonB9(dbReason);
    // 輪11-4 前端必填：competitor 原因時競品品牌必填
    if (b9Reason === "competitor" && !form.competitor_brand?.trim()) {
      showBanner({ ok: false, msg: "選擇「流失至競品」時，競品品牌必填" });
      return;
    }
    startTransition(async () => {
      const res = await markLeadLostAction(
        lead.id,
        b9Reason,
        form.competitor_brand ?? null,
        kind,
      );
      if (res.ok) {
        const callTaskMsg = res.data.callTaskCreated
          ? `（已自動建立喚醒電訪任務）`
          : res.data.callTaskError
            ? `（自動建任務失敗：${res.data.callTaskError}）`
            : "";
        showBanner({
          ok: true,
          msg: isAfter
            ? `✓ 已標記為流失 ${callTaskMsg}`
            : `✓ 已標記為戰敗 ${callTaskMsg}`,
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const headerBadge = useMemo(() => {
    if (creating) return { label: "建立模式", bg: "#FDF3E3", fg: "#854F0B" };
    if (editing) return { label: "編輯模式", bg: "#FDF3E3", fg: "#854F0B" };
    return null;
  }, [creating, editing]);

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] disabled:bg-[#F8F7F4] disabled:text-[#5A5955]";

  const breadcrumbCode = creating
    ? `新增${copy.noun}`
    : (lead?.code ?? "—");

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={basePath} className="hover:text-[#185FA5]">
            {copy.listLabel}
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {headerBadge ? (
            <span
              className="px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ backgroundColor: headerBadge.bg, color: headerBadge.fg }}
            >
              {headerBadge.label}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {readOnly && lead ? (
            <>
              <Link
                href={basePath}
                className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <Link
                href={`${basePath}/new`}
                aria-disabled={!canEdit}
                className={`h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
              >
                ＋ 新增
              </Link>
              <button
                type="button"
                onClick={() => setMode("edit")}
                disabled={!canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={handleRevive}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                title={
                  isAfter
                    ? "記錄一次喚回（+1 嘗試）"
                    : "記錄一次再接觸（+1 嘗試）"
                }
              >
                {isAfter ? "喚回" : "再接觸"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
            </>
          ) : null}
          {editing && lead ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
            </>
          ) : null}
          {creating ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                data-testid="dormant-lead-create-submit"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                {copy.kindCaption}
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {creating
                  ? form.name || `（未命名${copy.noun}）`
                  : (lead?.name ?? "—")}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">
                  {creating ? "尚未建立" : (lead?.code ?? "—")}
                </span>
                {!creating && lead ? (
                  <>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                      style={{
                        backgroundColor:
                          DORMANCY_STATUS_BADGE[lead.dormancy_status].bg,
                        color:
                          DORMANCY_STATUS_BADGE[lead.dormancy_status].fg,
                      }}
                    >
                      {DORMANCY_STATUS_LABEL[lead.dormancy_status]}
                    </span>
                    {lead.habc ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                        HABC {lead.habc}
                      </span>
                    ) : null}
                    {/* 裁示三：依 kind 顯示對應的流失/戰敗原因 */}
                    {isAfter && lead.aftersales_lost_reason ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]">
                        {AFTERSALES_LOST_REASON_LABEL[lead.aftersales_lost_reason]}
                      </span>
                    ) : !isAfter && lead.lost_reason ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]">
                        {reasonMap[lead.lost_reason]}
                      </span>
                    ) : null}
                    {lead.dormant_days != null ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F8F7F4] text-[#5A5955]">
                        {dormancyBucket(lead.dormant_days).label}（{lead.dormant_days} 天）
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
            {!readOnly ? null : (
              <div className="text-[11.5px] text-[#5A5955]">
                {lead?.intent_model
                  ? `${isAfter ? "保養車型" : "意向"}：${lead.intent_model}`
                  : ""}
                {lead?.intent_model && lead?.rs_name ? "・" : ""}
                {lead?.rs_name
                  ? `${isAfter ? "負責 SA" : "負責 RS"}：${lead.rs_name}`
                  : ""}
              </div>
            )}
          </div>
          <div className="shrink-0">
            <div className="w-[220px] h-[120px] rounded-lg bg-[#F8F7F4] border border-[#EEECE6] flex flex-col items-center justify-center text-[11.5px] text-[#5A5955] gap-1">
              <div className="text-[24px] font-semibold text-[#1A3A5C]">
                {creating ? "—" : (lead?.revive_attempt_count ?? 0)}
              </div>
              <div>{isAfter ? "累計喚回次數" : "累計再接觸次數"}</div>
              {!creating && lead?.next_revive_at ? (
                <div className="text-[10.5px] text-[#9A9890]">
                  下次：{fmtDate(lead.next_revive_at)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="客戶姓名" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={readOnly}
              data-testid="dormant-lead-name-input"
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label="聯絡電話">
            <input
              type="text"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label="HABC">
            <select
              value={form.habc ?? ""}
              onChange={(e) => setForm({ ...form, habc: e.target.value || null })}
              disabled={readOnly}
              className={`${inputClass} w-full`}
            >
              <option value="">—</option>
              <option value="H">H</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
          <Field label={isAfter ? "保養車型" : "意向車型"}>
            <input
              type="text"
              value={form.intent_model ?? ""}
              onChange={(e) =>
                setForm({ ...form, intent_model: e.target.value })
              }
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label={isAfter ? "負責 SA" : "負責 RS"}>
            <input
              type="text"
              value={form.rs_name ?? ""}
              onChange={(e) => setForm({ ...form, rs_name: e.target.value })}
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label="來源">
            <input
              type="text"
              value={form.source ?? ""}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              disabled={readOnly}
              placeholder={
                isAfter
                  ? "例：保養回廠 / 客服回訪"
                  : "例：車展活動 / RS01 手卡同步"
              }
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label={isAfter ? "最近回廠日" : "最近到店日"}>
            <input
              type="date"
              value={toDateInput(form.last_visit_at)}
              onChange={(e) =>
                setForm({
                  ...form,
                  last_visit_at: fromDateInput(e.target.value),
                })
              }
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
        </div>
      </section>

      {/* 休眠／戰敗狀態 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ {isAfter ? "休眠／流失狀態" : "休眠／戰敗狀態"}
          </span>
          {readOnly && lead && lead.dormancy_status !== "lost" ? (
            <button
              type="button"
              onClick={handleMarkLost}
              disabled={!canEdit || isPending}
              className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              {copy.markLostButtonLabel}
            </button>
          ) : null}
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="狀態" required>
            <select
              value={form.dormancy_status}
              onChange={(e) =>
                setForm({
                  ...form,
                  dormancy_status: e.target.value as DormancyStatus,
                })
              }
              disabled={readOnly}
              className={`${inputClass} w-full`}
            >
              {(isAfter
                ? STATUS_OPTIONS_AFTERSALES
                : STATUS_OPTIONS_SALES
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {/* 裁示三：aftersales 用 AftersalesLostReason 6 類讀寫 aftersales_lost_reason；sales 用 B9 8 類讀寫 lost_reason */}
          <Field label={isAfter ? "流失原因（6 類）" : "戰敗原因（8 類）"}>
            {isAfter ? (
              <select
                value={form.aftersales_lost_reason ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    aftersales_lost_reason: (e.target.value || null) as AftersalesLostReason | null,
                  })
                }
                disabled={readOnly}
                className={`${inputClass} w-full`}
              >
                <option value="">—</option>
                {(Object.keys(AFTERSALES_LOST_REASON_LABEL) as AftersalesLostReason[]).map((k) => (
                  <option key={k} value={k}>
                    {AFTERSALES_LOST_REASON_LABEL[k]}
                  </option>
                ))}
              </select>
            ) : (
              // Sales 版：用 8 類 B9 UI，onChange 反查並存 DB 9 值
              <select
                value={form.lost_reason ? mapDbToLostReasonB9(form.lost_reason) : ""}
                onChange={(e) => {
                  const b9 = e.target.value as LostReasonB9 | "";
                  if (!b9) {
                    setForm({ ...form, lost_reason: null });
                  } else {
                    setForm({ ...form, lost_reason: mapLostReasonB9ToDb(b9) });
                  }
                }}
                disabled={readOnly}
                className={`${inputClass} w-full`}
              >
                <option value="">—</option>
                {(Object.keys(LOST_REASON_B9_LABEL) as LostReasonB9[]).map((k) => (
                  <option key={k} value={k}>
                    {LOST_REASON_B9_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {/* 輪11-4：competitor 必填競品品牌（前端強制） */}
          <Field
            label={copy.competitorLabel}
            required={
              !isAfter &&
              form.lost_reason === "competitor"
            }
          >
            <input
              type="text"
              value={form.competitor_brand ?? ""}
              onChange={(e) =>
                setForm({ ...form, competitor_brand: e.target.value })
              }
              disabled={readOnly}
              placeholder={copy.competitorPlaceholder}
              className={`${inputClass} w-full ${
                !isAfter && form.lost_reason === "competitor" && !readOnly
                  ? "border-[#CC0000]"
                  : ""
              }`}
            />
            {!readOnly && !isAfter && form.lost_reason === "competitor" && !form.competitor_brand?.trim() ? (
              <span className="text-[11px] text-[#CC0000]">競品品牌必填（流失至競品原因）</span>
            ) : null}
          </Field>
          <Field label={copy.lostDateLabel}>
            <input
              type="date"
              value={toDateInput(form.lost_at)}
              onChange={(e) =>
                setForm({ ...form, lost_at: fromDateInput(e.target.value) })
              }
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label={isAfter ? "下次喚回日" : "下次再接觸日"}>
            <input
              type="date"
              value={toDateInput(form.next_revive_at)}
              onChange={(e) =>
                setForm({
                  ...form,
                  next_revive_at: fromDateInput(e.target.value),
                })
              }
              disabled={readOnly}
              className={`${inputClass} w-full`}
            />
          </Field>
          <Field label={isAfter ? "累計喚回" : "累計再接觸"}>
            <div className="h-[30px] flex items-center text-[12.5px] text-[#2C2C2A] font-mono">
              {lead?.revive_attempt_count ?? 0} 次
              {lead?.last_revive_at ? ` · 最後 ${fmtDate(lead.last_revive_at)}` : ""}
            </div>
          </Field>
        </div>
      </section>

      {/* 創建模式下隱藏 tabs */}
      {!creating && lead ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                    tab === t.key
                      ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                      : "text-[#5A5955] hover:bg-[#F8F7F4]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {tab === "history" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SectionCard title="互動歷程">
                  <ul className="text-[12.5px] text-[#2C2C2A] space-y-1.5">
                    <li>
                      <span className="font-mono text-[11px] text-[#9A9890] mr-2">
                        {fmtDate(lead.created_at)}
                      </span>
                      建立{copy.noun}（來源：{lead.source ?? "—"}）
                    </li>
                    {lead.last_visit_at ? (
                      <li>
                        <span className="font-mono text-[11px] text-[#9A9890] mr-2">
                          {fmtDate(lead.last_visit_at)}
                        </span>
                        {isAfter ? "最近一次回廠保養" : "最近到店互動"}
                      </li>
                    ) : null}
                    {lead.lost_at ? (
                      <li>
                        <span className="font-mono text-[11px] text-[#9A9890] mr-2">
                          {fmtDate(lead.lost_at)}
                        </span>
                        {isAfter ? "判定流失" : "標記為戰敗"}（
                        {isAfter
                          ? (lead.aftersales_lost_reason ? AFTERSALES_LOST_REASON_LABEL[lead.aftersales_lost_reason] : "—")
                          : (lead.lost_reason ? reasonMap[lead.lost_reason] : "—")}
                        {lead.competitor_brand ? `・${lead.competitor_brand}` : ""})
                      </li>
                    ) : null}
                    {lead.last_revive_at ? (
                      <li>
                        <span className="font-mono text-[11px] text-[#9A9890] mr-2">
                          {fmtDate(lead.last_revive_at)}
                        </span>
                        {isAfter ? "最後一次喚回" : "最後一次再接觸"}（累計
                        {lead.revive_attempt_count} 次）
                      </li>
                    ) : null}
                    {lead.next_revive_at ? (
                      <li>
                        <span className="font-mono text-[11px] text-[#185FA5] mr-2">
                          {fmtDate(lead.next_revive_at)}
                        </span>
                        {isAfter ? "排定下次喚回" : "排定下次再接觸"}
                      </li>
                    ) : null}
                  </ul>
                </SectionCard>
                <SectionCard title={isAfter ? "休眠/流失指標" : "休眠/戰敗指標"}>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                    <Kv
                      label="休眠天數"
                      value={
                        lead.dormant_days != null
                          ? `${lead.dormant_days} 天`
                          : "—"
                      }
                    />
                    <Kv label="HABC" value={lead.habc ?? "—"} mono />
                    <Kv
                      label={isAfter ? "保養車型" : "意向車型"}
                      value={lead.intent_model ?? "—"}
                    />
                    <Kv
                      label={isAfter ? "負責 SA" : "負責 RS"}
                      value={lead.rs_name ?? "—"}
                    />
                    <Kv
                      label={isAfter ? "累計喚回" : "累計接觸"}
                      value={`${lead.revive_attempt_count} 次`}
                      mono
                    />
                    <Kv
                      label="建議"
                      value={
                        lead.dormant_days != null
                          ? dormancyBucket(lead.dormant_days).hint
                          : "—"
                      }
                      small
                    />
                  </div>
                </SectionCard>
              </div>
            ) : null}
            {tab === "revive" ? (
              <SectionCard title={isAfter ? "喚回紀錄" : "喚醒紀錄"}>
                <div className="text-[12.5px] text-[#5A5955] space-y-2">
                  <p>
                    本 POC 階段先以「
                    {isAfter ? "累計喚回次數" : "累計再接觸次數"} / 最後
                    {isAfter ? "喚回日" : "接觸日"} / 下次
                    {isAfter ? "喚回日" : "接觸日"}
                    」三個欄位記錄；日後可擴 metadata.revive_events[]
                    留每次切入點與結果。
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Kv
                      label="累計次數"
                      value={`${lead.revive_attempt_count} 次`}
                      mono
                    />
                    <Kv
                      label={isAfter ? "最後喚回" : "最後接觸"}
                      value={fmtDate(lead.last_revive_at)}
                      mono
                    />
                    <Kv
                      label="下次預定"
                      value={fmtDate(lead.next_revive_at)}
                      mono
                    />
                  </div>
                </div>
              </SectionCard>
            ) : null}
            {tab === "notes" ? (
              <SectionCard title="備註與標籤">
                <textarea
                  value={form.note ?? ""}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  disabled={readOnly}
                  rows={6}
                  placeholder={
                    isAfter
                      ? "輸入喚回備註、切入點（保養優惠 / 距離 / 換車原因）…"
                      : "輸入接觸備註、切入點…"
                  }
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] disabled:bg-[#F8F7F4] disabled:text-[#5A5955]"
                />
                {readOnly ? (
                  <p className="text-[11.5px] text-[#9A9890] mt-1">
                    點上方「修改」進入編輯模式儲存備註。
                  </p>
                ) : null}
              </SectionCard>
            ) : null}
          </div>
        </>
      ) : (
        <div className="bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-lg px-4 py-6 text-[12px] text-[#5A5955]">
          建立後將跳轉到該{copy.noun}的詳情頁，可進一步維護互動歷程與
          {isAfter ? "喚回紀錄" : "喚醒紀錄"}。
        </div>
      )}

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
    </main>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label}
        {required ? <span className="text-[#CC0000] ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[#2C2C2A] ${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px]"}`}
      >
        {value}
      </div>
    </div>
  );
}
