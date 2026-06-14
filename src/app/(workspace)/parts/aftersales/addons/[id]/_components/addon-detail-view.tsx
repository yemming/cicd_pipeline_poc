"use client";

/**
 * 追加項目 — Detail Page
 *
 * 結構（依 design pattern）：
 *  1. Breadcrumb + CRUD pill bar（返回 / 決策 / 取消）
 *  2. Title card（項目名稱 + 工單連結 + 安全等級 chip + 決策 chip）
 *  3. ▼ 基本資料 KV grid
 *  4. ▼ 決策過程 KV grid
 *  5. ▼ 連動的工單明細（agreed → ro_lines）
 *  6. Modal / Banner
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  CONFIRM_LABEL,
  DECISION_CHIP,
  DECISION_LABEL,
  REJECTION_REASON_OPTIONS,
  SAFETY_CHIP,
  SAFETY_LABEL,
  TYPE_LABEL,
  type CustomerDecision,
  type RejectionReason,
  type RepairOrderAddonWithRo,
} from "@/domain/repair-order-addons.constants";
import {
  cancelAddonAction,
  decideAddonAction,
  type AddonCancelMode,
  type ConfirmMethod,
} from "@/lib/aftersales/repair-order-addon-actions";

type Banner = { ok: boolean; msg: string } | null;

type Line = {
  id: string;
  line_no: number;
  kind: string;
  labor_name: string | null;
  part_name: string | null;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

function fmtTaipei(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function AddonDetailView({
  addon,
  lines,
  canEdit,
}: {
  addon: RepairOrderAddonWithRo;
  lines: Line[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: `追加項目 #${addon.addon_no} — ${addon.name}`,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "追加項目記錄", href: "/parts/aftersales/addons" },
      { label: `#${addon.addon_no}` },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [showDecide, setShowDecide] = useState(false);
  // RP3：agreed addon 取消時顯示三選一確認框
  const [showCancelModal, setShowCancelModal] = useState(false);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleCancelClick = () => {
    if (addon.customer_decision === "agreed") {
      // agreed addon → 需要選退料模式，彈 RP3 確認框
      setShowCancelModal(true);
    } else {
      // pending addon → 無庫存問題，直接取消
      if (!confirm("確認取消此追加項目？只有待確認的可取消。")) return;
      startTransition(async () => {
        const r = await cancelAddonAction(addon.id, { cancel_mode: "full_return" });
        if (r.ok) {
          showBanner({ ok: true, msg: "✓ 已取消" });
          router.refresh();
        } else {
          showBanner({ ok: false, msg: r.error });
        }
      });
    }
  };

  const meta = (addon.metadata ?? {}) as Record<string, unknown>;
  const requiresFollowup = Boolean(meta.requires_followup);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/addons" className="hover:text-[#185FA5]">
            追加項目記錄
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">#{addon.addon_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/addons"
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {addon.ro && (
            <Link
              href={`/parts/aftersales/repair-orders/${addon.ro_id}/lines`}
              className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            >
              查工單
            </Link>
          )}
          {canEdit && addon.customer_decision === "pending" && (
            <>
              <button
                type="button"
                onClick={() => setShowDecide(true)}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                送出車主決策
              </button>
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                取消此項
              </button>
            </>
          )}
          {/* RP3：agreed 狀態也可取消（需選退料模式） */}
          {canEdit && addon.customer_decision === "agreed" && (
            <button
              type="button"
              onClick={handleCancelClick}
              disabled={isPending}
              data-testid="cancel-agreed-btn"
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              取消（退料）
            </button>
          )}
        </div>
      </div>

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

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                追加項目記錄 · #{addon.addon_no}
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {addon.name}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">
                  工單{" "}
                  {addon.ro ? (
                    <Link
                      href={`/parts/aftersales/repair-orders/${addon.ro_id}/lines`}
                      className="text-[#185FA5] hover:underline"
                    >
                      {addon.ro.ro_code}
                    </Link>
                  ) : (
                    "—"
                  )}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[11px] ${SAFETY_CHIP[addon.safety_level]}`}
                >
                  {SAFETY_LABEL[addon.safety_level]}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[11px] ${DECISION_CHIP[addon.customer_decision]}`}
                >
                  {DECISION_LABEL[addon.customer_decision]}
                </span>
                <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                  {TYPE_LABEL[addon.addon_type]}
                </span>
                {requiresFollowup && (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                    待追蹤閉環
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-[#9A9890]">估計費用</div>
            <div className="text-[22px] font-semibold text-[#1A3A5C] font-mono">
              NT$ {Number(addon.estimated_fee).toLocaleString()}
            </div>
            {addon.customer_decision === "agreed" && addon.reserved_at && (
              <div className="text-[10.5px] text-[#3B6D11] mt-1">
                已預留 · {fmtTaipei(addon.reserved_at)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ▼ 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="項目名稱" value={addon.name} />
          <Kv label="類型" value={TYPE_LABEL[addon.addon_type]} />
          <Kv label="安全等級" value={SAFETY_LABEL[addon.safety_level]} />
          <Kv
            label="估計費用"
            value={`NT$ ${Number(addon.estimated_fee).toLocaleString()}`}
            mono
          />
          <Kv label="提議時間" value={fmtTaipei(addon.proposed_at)} mono small />
          <Kv label="技師說明" value={addon.tech_reason ?? "—"} small />
          {addon.ro && (
            <>
              <Kv label="工單編號" value={addon.ro.ro_code} mono />
              <Kv label="車主" value={addon.ro.customer_name ?? "—"} />
              <Kv label="車牌" value={addon.ro.vehicle_license_plate ?? "—"} mono />
            </>
          )}
        </div>
      </section>

      {/* ▼ 決策過程 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 決策過程</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="當前決策" value={DECISION_LABEL[addon.customer_decision]} />
          <Kv
            label="決策時間"
            value={fmtTaipei(addon.customer_decision_at)}
            mono
            small
          />
          <Kv
            label="確認方式"
            value={addon.confirm_method ? CONFIRM_LABEL[addon.confirm_method] : "—"}
          />
          <Kv label="決策備註" value={addon.decision_note ?? "—"} small />
          <Kv
            label="預留庫存時點"
            value={fmtTaipei(addon.reserved_at)}
            mono
            small
          />
          <Kv
            label="待追蹤閉環"
            value={requiresFollowup ? "是" : "否"}
            small
          />
        </div>
      </section>

      {/* ▼ 連動工單明細（agreed 才會有） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 連動工單明細（同意後自動寫入）
          </span>
          <span className="text-[11px] text-[#9A9890]">
            {lines.length > 0 ? `${lines.length} 條` : "尚未寫入"}
          </span>
        </header>
        <div className="px-4 py-3">
          {lines.length === 0 ? (
            <p className="text-[12px] text-[#9A9890] text-center py-6">
              {addon.customer_decision === "agreed"
                ? "資料異常：已同意但沒對應的工單明細，請聯絡管理員"
                : "車主同意後此區會自動填入。"}
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                  <th className="text-left py-1.5 pl-1">#</th>
                  <th className="text-left">類型</th>
                  <th className="text-left">名稱</th>
                  <th className="text-right">數量</th>
                  <th className="text-right">單價</th>
                  <th className="text-right pr-1">小計</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-[#F8F7F4] last:border-b-0">
                    <td className="py-1.5 pl-1 font-mono text-[#5A5955]">{l.line_no}</td>
                    <td>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10.5px] ${
                          l.kind === "labor"
                            ? "bg-[#EBF3FF] text-[#1A3A5C]"
                            : "bg-[#EAF4FB] text-[#185FA5]"
                        }`}
                      >
                        {l.kind === "labor" ? "工項" : "零件"}
                      </span>
                    </td>
                    <td>{l.labor_name ?? l.part_name ?? "—"}</td>
                    <td className="text-right font-mono">{l.qty ?? "—"}</td>
                    <td className="text-right font-mono">
                      {l.unit_price != null ? `NT$ ${Number(l.unit_price).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right pr-1 font-mono font-semibold text-[#1A3A5C]">
                      {l.amount != null ? `NT$ ${Number(l.amount).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* RP3 取消退料確認框（agreed addon 用） */}
      {showCancelModal && (
        <CancelAddonModal
          addon={addon}
          isPending={isPending}
          onClose={() => setShowCancelModal(false)}
          onConfirm={(mode, reason) => {
            setShowCancelModal(false);
            startTransition(async () => {
              const r = await cancelAddonAction(addon.id, {
                cancel_mode: mode,
                cancel_reason: reason,
              });
              if (r.ok) {
                const modeLabel =
                  mode === "full_return"
                    ? "完整退料完成"
                    : mode === "damage_writeoff"
                      ? "損耗核銷記錄已建立"
                      : "安裝中狀態已記錄";
                showBanner({ ok: true, msg: `✓ ${modeLabel}` });
                router.refresh();
              } else {
                showBanner({ ok: false, msg: r.error });
              }
            });
          }}
        />
      )}

      {/* Decide Modal */}
      {showDecide && (
        <DecideModal
          target={addon}
          onClose={() => setShowDecide(false)}
          onDone={(b) => {
            showBanner(b);
            setShowDecide(false);
            router.refresh();
          }}
        />
      )}
    </main>
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DecideModal({
  target,
  onClose,
  onDone,
}: {
  target: RepairOrderAddonWithRo;
  onClose: () => void;
  onDone: (b: { ok: boolean; msg: string }, decision?: CustomerDecision) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"agreed" | "deferred" | "rejected">("agreed");
  const [confirmMethod, setConfirmMethod] = useState<ConfirmMethod>(
    target.confirm_method ?? "phone",
  );
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState<RejectionReason | null>(null);

  // B-23：拒絕時必須先選結構化原因才能送出
  const blockedByReason = decision === "rejected" && !rejectionReason;

  const submit = () => {
    startTransition(async () => {
      const r = await decideAddonAction(target.id, {
        customer_decision: decision,
        confirm_method: confirmMethod,
        decision_note: note,
        rejection_reason: decision === "rejected" ? rejectionReason : null,
      });
      const msg =
        decision === "agreed"
          ? "✓ 車主已同意，已寫入維修明細"
          : decision === "deferred"
            ? "✓ 已標記為暫緩"
            : "✓ 已標記為拒絕";
      onDone(
        r.ok ? { ok: true, msg } : { ok: false, msg: r.error },
        r.ok ? decision : undefined,
      );
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[560px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
          車主決策 — {target.name}
        </h2>
        <p className="text-[11.5px] text-[#9A9890] mb-3">
          工單 {target.ro?.ro_code ?? "—"} ・ {TYPE_LABEL[target.addon_type]} ・{" "}
          {SAFETY_LABEL[target.safety_level]} ・ 估價 NT${" "}
          {Number(target.estimated_fee).toLocaleString()}
        </p>

        <div className="mb-3">
          <label className="text-[11px] text-[#9A9890] font-medium block mb-1.5">決策</label>
          <div className="flex gap-2 flex-wrap">
            {[
              ["agreed", "✅ 車主同意", "bg-[#0F6E56] text-white border-[#0F6E56]"],
              ["deferred", "⏸ 暫緩", "bg-[#854F0B] text-white border-[#854F0B]"],
              ["rejected", "❌ 拒絕（→ 增項閉環）", "bg-[#CC0000] text-white border-[#CC0000]"],
            ].map(([val, label, activeCls]) => {
              const active = decision === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDecision(val as "agreed" | "deferred" | "rejected")}
                  className={`h-[30px] px-3 rounded-full text-[12px] border ${
                    active
                      ? activeCls
                      : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* B-23：拒絕原因採集（固定標籤五選一，必填） */}
        {decision === "rejected" && (
          <div className="mb-3" data-testid="rejection-modal">
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1.5">
              拒絕原因 <span className="text-[#CC0000]">*</span>
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {REJECTION_REASON_OPTIONS.map((opt) => {
                const active = rejectionReason === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    data-testid={`reason-${opt.code}`}
                    onClick={() => setRejectionReason(opt.code)}
                    disabled={pending}
                    className={`text-left h-[32px] px-3 rounded border text-[12.5px] transition-colors ${
                      active
                        ? "bg-[#FDECEA] border-[#CC0000] text-[#CC0000] font-medium"
                        : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">確認方式</label>
            <select
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
              value={confirmMethod}
              onChange={(e) => setConfirmMethod(e.target.value as ConfirmMethod)}
              disabled={pending}
            >
              <option value="phone">電話口頭</option>
              <option value="onsite">現場本人</option>
              <option value="line">Line 文字</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 col-span-2 md:col-span-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              {decision === "rejected" ? "補充說明（選填）" : "決策備註"}
            </label>
            <input
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
              value={note}
              maxLength={50}
              data-testid="rejection-note"
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：車主表示下次再處理（最多 50 字）"
              disabled={pending}
            />
          </div>
        </div>

        {decision === "agreed" && (
          <p className="mt-3 text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2.5 py-1.5">
            同意後將自動寫入工單明細（{TYPE_LABEL[target.addon_type]}），可至「維修明細」頁查看。
          </p>
        )}
        {decision !== "agreed" && target.safety_level !== "normal" && (
          <p className="mt-3 text-[11.5px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2.5 py-1.5">
            此項屬「{SAFETY_LABEL[target.safety_level]}」，將自動標記為「待追蹤」進入增項閉環看板。
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || blockedByReason}
            data-testid="confirm-reject-btn"
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {pending ? "送出中⋯" : "送出決策"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * RP3 取消追加項目 — 三選一退料確認框（agreed addon 專用）
 *
 *  - 完整退料：釋放庫存預留 + 退回已出庫庫存 + 從 RO 費用移除
 *  - 損耗核銷：零件已開封/安裝一半不可重售，費用保留，記稽核
 *  - 安裝中  ：零件已安裝無法取出，記錄狀態，後續人工處理
 */
function CancelAddonModal({
  addon,
  isPending,
  onClose,
  onConfirm,
}: {
  addon: RepairOrderAddonWithRo;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (mode: AddonCancelMode, reason: string) => void;
}) {
  const [mode, setMode] = useState<AddonCancelMode>("full_return");
  const [reason, setReason] = useState("");

  const blockedByReason = mode === "damage_writeoff" && !reason.trim();

  const MODES: Array<{
    id: AddonCancelMode;
    label: string;
    desc: string;
    feeEffect: string;
    stockEffect: string;
  }> = [
    {
      id: "full_return",
      label: "完整退料",
      desc: "零件完好未安裝，可退回倉位重售",
      feeEffect: "費用從工單移除",
      stockEffect: "庫存預留釋放 + 已出庫料退回",
    },
    {
      id: "damage_writeoff",
      label: "損耗核銷",
      desc: "零件已開封/安裝一半，無法重售",
      feeEffect: "費用保留（向客戶收損耗費）",
      stockEffect: "庫存不退，轉損耗核銷記錄",
    },
    {
      id: "mid_install",
      label: "安裝中（暫記）",
      desc: "零件已安裝完成，人工後續確認",
      feeEffect: "費用暫保留，後續人工調整",
      stockEffect: "庫存維持現狀，記錄安裝狀態",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-[600px] p-5"
        onClick={(e) => e.stopPropagation()}
        data-testid="cancel-addon-modal"
      >
        <h2 className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
          取消追加項目 — 零件狀態確認
        </h2>
        <p className="text-[11.5px] text-[#9A9890] mb-4">
          <span className="font-medium text-[#CC0000]">{addon.name}</span>
          {" "}｜ 估價 NT$ {Number(addon.estimated_fee).toLocaleString()}
          {" "}｜ 工單 {addon.ro?.ro_code ?? "—"}
        </p>

        {/* 三選一 */}
        <div className="mb-4 space-y-2">
          <label className="text-[11px] text-[#9A9890] font-medium block">零件當前狀態</label>
          {MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                data-testid={`cancel-mode-${m.id}`}
                onClick={() => setMode(m.id)}
                disabled={isPending}
                className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                  active
                    ? "border-[#CC0000] bg-[#FDECEA]"
                    : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                      active ? "border-[#CC0000] bg-[#CC0000]" : "border-[#D5D3CB]"
                    }`}
                  />
                  <span className={`text-[13px] font-medium ${active ? "text-[#CC0000]" : "text-[#2C2C2A]"}`}>
                    {m.label}
                  </span>
                </div>
                <p className="text-[11.5px] text-[#5A5955] mt-1 ml-5">{m.desc}</p>
                <div className="flex gap-4 mt-1.5 ml-5">
                  <span className="text-[10.5px] text-[#854F0B] bg-[#FDF3E3] px-1.5 py-0.5 rounded">
                    💰 {m.feeEffect}
                  </span>
                  <span className="text-[10.5px] text-[#185FA5] bg-[#EAF4FB] px-1.5 py-0.5 rounded">
                    📦 {m.stockEffect}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 原因說明（損耗核銷必填，其他選填） */}
        <div className="mb-4">
          <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
            原因說明
            {mode === "damage_writeoff" && (
              <span className="text-[#CC0000] ml-0.5">*（損耗核銷必填）</span>
            )}
          </label>
          <input
            type="text"
            data-testid="cancel-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={100}
            disabled={isPending}
            placeholder={
              mode === "damage_writeoff"
                ? "例：油封安裝後無法復原，零件損耗（最多 100 字）"
                : mode === "mid_install"
                  ? "例：已安裝完成，客戶決定取消工單（選填）"
                  : "例：客戶取消，零件原封未動（選填）"
            }
            className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
          />
        </div>

        {/* 說明橫幅 */}
        {mode === "full_return" && (
          <p className="mb-3 text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2.5 py-1.5">
            系統將釋放庫存預留，並從工單費用中移除此項目的費用明細。
          </p>
        )}
        {mode === "damage_writeoff" && (
          <p className="mb-3 text-[11.5px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2.5 py-1.5">
            損耗核銷：費用仍保留在工單，結帳時需向客戶說明損耗費用。記錄將存入稽核日誌供主管每週查閱。
          </p>
        )}
        {mode === "mid_install" && (
          <p className="mb-3 text-[11.5px] text-[#854F0B] bg-[#FDF3E3] border border-[#F0D9B0] rounded px-2.5 py-1.5">
            安裝中記錄：狀態暫記，費用與庫存維持現狀，後續由主管確認如何處理。
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="confirm-cancel-btn"
            onClick={() => onConfirm(mode, reason)}
            disabled={isPending || blockedByReason}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] disabled:opacity-50"
          >
            {isPending ? "處理中⋯" : "確認取消"}
          </button>
        </div>
      </div>
    </div>
  );
}
