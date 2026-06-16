"use client";

/**
 * 追加項目取消頁 — AddonCancelView
 *
 * 功能：
 *  1. 整筆取消（cancelAddonAction）— agreed/pending 追加，選取消模式後確認
 *  2. 逐行取消（partialCancelAddonLineAction）— source='addon' 的明細行，勾選後批次取消
 *
 * testid 命名與規格一致，自動化測試會打。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  DECISION_CHIP,
  DECISION_LABEL,
  TYPE_LABEL,
  type CustomerDecision,
  type RepairOrderAddonWithRo,
} from "@/domain/repair-order-addons.constants";
import {
  cancelAddonAction,
  partialCancelAddonLineAction,
  type AddonCancelMode,
} from "@/lib/aftersales/repair-order-addon-actions";
import type { RepairOrderLineWithStock } from "@/domain/repair-order-lines";

// ── 型別擴展（source 欄位在 DB 存在但未在 RepairOrderLineRow 定義）
type AddonLineRow = RepairOrderLineWithStock & { source?: string | null };

type Props = {
  roId: string;
  roCode: string;
  /** 只含 pending / agreed 的追加項目 */
  cancelableAddons: RepairOrderAddonWithRo[];
  /** source='addon' 的明細行 */
  addonLines: AddonLineRow[];
  canEdit: boolean;
};

type BannerKind = "cancel" | "partial";
type Banner = { ok: boolean; msg: string; kind: BannerKind } | null;

// ── 格式化金額
function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$${Math.round(Number(n)).toLocaleString()}`;
}

// ── 取消模式標籤
const CANCEL_MODE_LABEL: Record<AddonCancelMode, string> = {
  full_return: "整筆退料（費用移除、庫存建退料待確認）",
  damage_writeoff: "損耗核銷（費用保留、庫存不退）",
  mid_install: "安裝中（暫記、不動庫存及費用）",
};

// ──────────────────────────────────────────────────────────────
// Modal 元件
// ──────────────────────────────────────────────────────────────
function Modal({
  open,
  title,
  onClose,
  children,
  testid,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testid?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* 內容 */}
      <div
        data-testid={testid}
        className="relative z-10 bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 整筆取消 Modal
// ──────────────────────────────────────────────────────────────
function CancelAddonModal({
  addon,
  onClose,
  onSuccess,
}: {
  addon: RepairOrderAddonWithRo;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const isAgreed = addon.customer_decision === "agreed";
  // pending 強制 full_return，不需選擇
  const [mode, setMode] = useState<AddonCancelMode>("full_return");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const requireReason = mode === "damage_writeoff";

  function handleConfirm() {
    startTransition(async () => {
      const res = await cancelAddonAction(addon.id, {
        cancel_mode: isAgreed ? mode : undefined,
        cancel_reason: reason.trim() || null,
      });
      if (res.ok) {
        onSuccess(`✓ 追加項目「${addon.name}」已取消`);
      } else {
        onSuccess(`✗ 取消失敗：${res.error}`);
      }
    });
  }

  return (
    <Modal
      open
      title={`取消追加項目：${addon.name}`}
      onClose={onClose}
      testid="cancel-addon-modal"
    >
      {/* 追加項目基本資訊 */}
      <div className="mb-4 p-3 bg-[#F8F7F4] rounded border border-[#EEECE6] space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">類型</span>
          <span className="text-[12px] text-[#2C2C2A]">{TYPE_LABEL[addon.addon_type]}</span>
          <span
            className={`ml-auto text-[11px] px-1.5 py-0.5 rounded-md font-medium ${DECISION_CHIP[addon.customer_decision as CustomerDecision]}`}
          >
            {DECISION_LABEL[addon.customer_decision as CustomerDecision]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">估計費用</span>
          <span className="text-[12px] font-semibold text-[#2C2C2A]">
            {fmtNT(addon.estimated_fee)}
          </span>
        </div>
      </div>

      {/* agreed 才顯示取消模式選擇；pending 直接 full_return */}
      {isAgreed ? (
        <div className="mb-4 space-y-2">
          <p className="text-[12px] font-medium text-[#2C2C2A]">取消模式</p>
          <div className="space-y-2">
            {(["full_return", "damage_writeoff", "mid_install"] as AddonCancelMode[]).map(
              (m) => (
                <label
                  key={m}
                  className="flex items-start gap-2 cursor-pointer"
                  data-testid={m === "full_return" ? "cancel-mode-full-return" : undefined}
                >
                  <input
                    type="radio"
                    name="cancel_mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    disabled={isPending}
                    className="mt-0.5"
                  />
                  <span className="text-[12px] text-[#2C2C2A]">{CANCEL_MODE_LABEL[m]}</span>
                </label>
              ),
            )}
          </div>
        </div>
      ) : (
        <p className="mb-4 text-[12px] text-[#5A5955]">
          此追加項目為「待確認」狀態，將以整筆退料方式取消。
        </p>
      )}

      {/* 損耗核銷必填原因 */}
      {requireReason && (
        <div className="mb-4">
          <label className="block text-[11px] text-[#9A9890] font-medium mb-1">
            核銷原因
            <span className="text-[#CC0000] ml-0.5">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isPending}
            rows={3}
            placeholder="請說明損耗核銷原因（稽核用）"
            className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12px] focus:border-[#185FA5] outline-none resize-none disabled:opacity-60"
          />
        </div>
      )}

      {/* 操作按鈕 */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          返回
        </button>
        <button
          data-testid="confirm-cancel-btn"
          onClick={handleConfirm}
          disabled={isPending || (requireReason && !reason.trim())}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#b30000] disabled:opacity-50"
        >
          {isPending ? "取消中⋯" : "確認取消"}
        </button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────
// 逐行取消 Modal
// ──────────────────────────────────────────────────────────────
function PartialCancelModal({
  lines,
  onClose,
  onSuccess,
}: {
  lines: AddonLineRow[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const lineIds = lines.map((l) => l.id);

  function handleConfirm() {
    startTransition(async () => {
      const res = await partialCancelAddonLineAction(lineIds);
      if (res.ok) {
        onSuccess(
          `✓ 已取消 ${res.data.removed_line_ids.length} 筆明細行，退料待確認建立 ${res.data.created_rts_ids.length} 筆`,
        );
      } else {
        onSuccess(`✗ 逐行取消失敗：${res.error}`);
      }
    });
  }

  return (
    <Modal
      open
      title={`確認取消 ${lines.length} 筆明細行`}
      onClose={onClose}
      testid="partial-cancel-modal"
    >
      <div className="mb-4 space-y-1.5 max-h-[200px] overflow-y-auto">
        {lines.map((l) => (
          <div
            key={l.id}
            className="flex items-center justify-between text-[12px] py-1 border-b border-[#EEECE6] last:border-0"
          >
            <span className="text-[#2C2C2A]">
              {l.kind === "labor" ? (l.labor_name ?? "工項") : (l.part_name ?? "零件")}
            </span>
            <span className="text-[#5A5955]">
              {l.kind === "part" ? `×${l.qty ?? 1}` : `${l.labor_units ?? 1} 工時`}
              {" · "}
              {fmtNT(l.amount)}
            </span>
          </div>
        ))}
      </div>
      <p className="mb-4 text-[12px] text-[#5A5955]">
        零件行將建立「退料待確認」記錄（需倉管實物核對後確認，庫存不立即回補）。
        工時行費用直接移除。
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          返回
        </button>
        <button
          data-testid="confirm-partial-cancel-btn"
          onClick={handleConfirm}
          disabled={isPending}
          className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#b30000] disabled:opacity-50"
        >
          {isPending ? "取消中⋯" : "確認逐行取消"}
        </button>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────
// 主元件
// ──────────────────────────────────────────────────────────────
export function AddonCancelView({
  roId,
  roCode,
  cancelableAddons,
  addonLines,
  canEdit,
}: Props) {
  const router = useRouter();

  // 整筆取消狀態
  const [cancelTarget, setCancelTarget] = useState<RepairOrderAddonWithRo | null>(null);

  // 逐行取消狀態
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set());
  const [showPartialModal, setShowPartialModal] = useState(false);

  // Toast banner
  const [banner, setBanner] = useState<Banner>(null);

  // 頁面 Header
  useSetPageHeader({
    breadcrumb: [
      { label: "工單管理", href: "/parts/aftersales/repair-orders" },
      { label: roCode, href: `/parts/aftersales/repair-orders/${roId}/lines` },
      { label: "追加項目取消" },
    ],
    hideSearch: true,
  });

  // 顯示 toast，成功 2.2 秒後自動消；失敗留著
  function showBanner(msg: string, kind: BannerKind) {
    const ok = msg.startsWith("✓");
    setBanner({ ok, msg, kind });
    if (ok) {
      setTimeout(() => {
        setBanner(null);
        router.refresh();
      }, 2200);
    }
  }

  // 整筆取消成功後關 modal 並 refresh
  function handleCancelSuccess(msg: string) {
    setCancelTarget(null);
    showBanner(msg, "cancel");
  }

  // 逐行取消成功後清勾選、關 modal、refresh
  function handlePartialSuccess(msg: string) {
    setShowPartialModal(false);
    setCheckedLineIds(new Set());
    showBanner(msg, "partial");
  }

  function toggleLine(id: string) {
    setCheckedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectedLines = addonLines.filter((l) => checkedLineIds.has(l.id));

  return (
    <main className="px-6 py-5 space-y-5">
      {/* ── 麵包屑 ── */}
      <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
        <Link
          href="/parts/aftersales/repair-orders"
          className="hover:text-[#185FA5]"
        >
          工單管理
        </Link>
        <span>›</span>
        <Link
          href={`/parts/aftersales/repair-orders/${roId}/lines`}
          className="hover:text-[#185FA5] font-mono"
        >
          {roCode}
        </Link>
        <span>›</span>
        <span className="text-[#5A5955]">追加項目取消</span>
      </div>

      {/* ── 整筆取消區塊 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 追加項目（整筆取消）
          </span>
          <span className="ml-2 text-[11px] text-[#9A9890]">
            僅顯示「待確認」或「車主同意」的可取消項目
          </span>
        </header>

        {cancelableAddons.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-[#9A9890] text-center">
            目前沒有可取消的追加項目
          </div>
        ) : (
          <div className="divide-y divide-[#EEECE6]">
            {cancelableAddons.map((addon) => (
              <div
                key={addon.id}
                className="px-4 py-3 flex items-center gap-3"
              >
                {/* 決策狀態 chip */}
                <span
                  className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-md font-medium ${DECISION_CHIP[addon.customer_decision as CustomerDecision]}`}
                >
                  {DECISION_LABEL[addon.customer_decision as CustomerDecision]}
                </span>

                {/* 名稱 + 類型 + 費用 */}
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-[#2C2C2A]">
                    {addon.name}
                  </span>
                  <span className="ml-2 text-[11px] text-[#9A9890]">
                    {TYPE_LABEL[addon.addon_type]}
                  </span>
                </div>
                <span className="text-[12.5px] text-[#5A5955] shrink-0">
                  {fmtNT(addon.estimated_fee)}
                </span>

                {/* 取消按鈕 */}
                {canEdit && (
                  <button
                    data-testid="cancel-agreed-btn"
                    onClick={() => setCancelTarget(addon)}
                    className="shrink-0 h-[28px] px-3 rounded text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                  >
                    取消此項
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 逐行取消區塊 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 已寫入明細行（逐行取消）
          </span>
          <span className="text-[11px] text-[#9A9890]">
            僅顯示來源為「追加項目」的明細行（source=addon）
          </span>
          {canEdit && (
            <button
              data-testid="partial-cancel-btn"
              disabled={checkedLineIds.size === 0}
              onClick={() => setShowPartialModal(true)}
              className="ml-auto h-[28px] px-3 rounded text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40 disabled:pointer-events-none"
            >
              取消勾選項目（{checkedLineIds.size} 筆）
            </button>
          )}
        </header>

        {addonLines.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-[#9A9890] text-center">
            沒有來自追加項目的明細行
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                {canEdit && (
                  <th className="w-10 px-3 py-2 text-left text-[11px] text-[#9A9890]">
                    勾選
                  </th>
                )}
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890]">類型</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890]">品名</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890]">
                  數量 / 工時
                </th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890]">金額</th>
              </tr>
            </thead>
            <tbody>
              {addonLines.map((line, idx) => (
                <tr
                  key={line.id}
                  className="border-b border-[#EEECE6] last:border-0 hover:bg-[#F8F7F4]"
                >
                  {canEdit && (
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        data-testid={`line-${idx}-cancel-checkbox`}
                        checked={checkedLineIds.has(line.id)}
                        onChange={() => toggleLine(line.id)}
                        className="w-4 h-4 accent-[#CC0000]"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                        line.kind === "labor"
                          ? "bg-[#EAF4FB] text-[#185FA5]"
                          : "bg-[#FDF3E3] text-[#854F0B]"
                      }`}
                    >
                      {line.kind === "labor" ? "工時" : "零件"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#2C2C2A]">
                    {line.kind === "labor"
                      ? (line.labor_name ?? "—")
                      : (line.part_name ?? "—")}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#5A5955]">
                    {line.kind === "part"
                      ? `×${line.qty ?? 1}`
                      : `${line.labor_units ?? 1} 工時`}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-[#2C2C2A]">
                    {fmtNT(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Modals ── */}
      {cancelTarget && (
        <CancelAddonModal
          addon={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSuccess={handleCancelSuccess}
        />
      )}

      {showPartialModal && (
        <PartialCancelModal
          lines={selectedLines}
          onClose={() => setShowPartialModal(false)}
          onSuccess={handlePartialSuccess}
        />
      )}

      {/* ── Toast banner ── */}
      {banner && (
        <div
          data-testid={
            banner.ok && banner.kind === "cancel"
              ? "cancel-success-toast"
              : banner.ok && banner.kind === "partial"
                ? "partial-cancel-success"
                : banner.kind === "cancel"
                  ? "cancel-error-toast"
                  : "partial-cancel-error"
          }
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
