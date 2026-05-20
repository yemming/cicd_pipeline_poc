"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  approvePurchaseReturn,
  cancelPurchaseReturn,
  completePurchaseReturn,
  deletePurchaseReturn,
  shipPurchaseReturn,
  updatePurchaseReturn,
} from "@/domain/parts-purchase-returns";
import type { PurchaseReturnDetail } from "@/domain/procurement";
import {
  RETURN_REASONS,
  RETURN_STATUSES,
  fmtDateTime,
} from "@/domain/parts-purchase-returns.constants";

type Mode = "view" | "edit";
type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`;
}

function statusChip(status: string) {
  const def = RETURN_STATUSES.find((s) => s.value === status);
  if (!def)
    return (
      <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68]">
        {status}
      </span>
    );
  const cls =
    def.chip === "pend"
      ? "bg-[#FDF3E3] text-[#854F0B]"
      : def.chip === "navy"
        ? "bg-[#EBF3FF] text-[#1A3A5C]"
        : def.chip === "done"
          ? "bg-[#EAF3DE] text-[#3B6D11]"
          : def.chip === "teal"
            ? "bg-[#E8F5F0] text-[#0F6E56]"
            : "bg-[#F2F2F2] text-[#6B6A68]";
  return <span className={`px-1.5 py-0.5 text-[11px] rounded-md ${cls}`}>{def.label}</span>;
}

function reasonLabel(value: string) {
  return RETURN_REASONS.find((r) => r.value === value)?.label ?? value;
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className={labelClass}>{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] mt-0.5 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ {title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function ReturnDetailView({
  detail,
  canEdit,
  canApprove,
}: {
  detail: PurchaseReturnDetail;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [banner, setBanner] = useState<Banner>(null);
  const [pending, startTransition] = useTransition();
  const [showShip, setShowShip] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tab, setTab] = useState<"lines" | "history">("lines");

  // edit form state（Phase 1 只允許改 reason / notes）
  const [returnReason, setReturnReason] = useState(detail.return_reason);
  const [notes, setNotes] = useState(detail.notes ?? "");

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function save() {
    startTransition(async () => {
      const res = await updatePurchaseReturn(detail.id, {
        return_reason: returnReason,
        notes: notes.trim() || null,
      });
      if (res.ok) {
        showBanner(true, "✓ 已更新");
        setMode("view");
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  function approve() {
    startTransition(async () => {
      const res = await approvePurchaseReturn(detail.id);
      if (res.ok) {
        showBanner(true, "✓ 已審核 · 庫存已回沖");
        router.refresh();
      } else {
        showBanner(false, `審核失敗：${res.error}`);
      }
    });
  }

  function doCancel() {
    setCancelReason("");
    setShowCancelModal(true);
  }
  function confirmCancel() {
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      showBanner(false, "請填寫作廢原因");
      return;
    }
    startTransition(async () => {
      const res = await cancelPurchaseReturn(detail.id, trimmed);
      if (res.ok) {
        showBanner(true, "✓ 已作廢");
        setShowCancelModal(false);
        router.refresh();
      } else {
        showBanner(false, `作廢失敗：${res.error}`);
      }
    });
  }

  function doDelete() {
    setShowDeleteModal(true);
  }
  function confirmDelete() {
    startTransition(async () => {
      const res = await deletePurchaseReturn(detail.id);
      if (res.ok) {
        showBanner(true, "✓ 已刪除");
        setShowDeleteModal(false);
        router.push("/parts/purchase/returns");
      } else {
        showBanner(false, `刪除失敗：${res.error}`);
        setShowDeleteModal(false);
      }
    });
  }

  const status = detail.status;
  const issuedGiNo =
    (detail.metadata as Record<string, unknown> | null)?.["issued_gi_no"] ?? null;

  return (
    <main className={`px-6 py-5 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/purchase/returns" className="hover:text-[#185FA5]">
            採購退貨
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{detail.rt_no}</span>
          {mode === "edit" && (
            <span className="ml-2 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <>
              <Link
                href="/parts/purchase/returns"
                className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              {status === "pending" && canEdit && (
                <button
                  onClick={() => setMode("edit")}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                >
                  修改
                </button>
              )}
              {status === "pending" && canApprove && (
                <button
                  onClick={approve}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
                >
                  審核通過
                </button>
              )}
              {status === "approved" && canEdit && (
                <button
                  onClick={() => setShowShip(true)}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                >
                  填物流
                </button>
              )}
              {status === "shipped" && canEdit && (
                <button
                  onClick={() => setShowComplete(true)}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
                >
                  標完成
                </button>
              )}
              {status === "pending" && canEdit && (
                <>
                  <button
                    onClick={doCancel}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                  >
                    作廢
                  </button>
                  <button
                    onClick={doDelete}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm"
                  >
                    刪除
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setReturnReason(detail.return_reason);
                  setNotes(detail.notes ?? "");
                  setMode("view");
                }}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                onClick={save}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">採購退貨單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {detail.vendor?.name ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{detail.rt_no}</span>
                {statusChip(detail.status)}
                <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                  {reasonLabel(detail.return_reason)}
                </span>
                {detail.po && (
                  <Link
                    href={`/parts/purchase/orders/${detail.po.id}`}
                    className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#EBF3FF] text-[#1A3A5C] hover:underline font-mono"
                  >
                    ← {detail.po.po_no}
                  </Link>
                )}
                {issuedGiNo && (
                  <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#E8F5F0] text-[#0F6E56] font-mono">
                    出庫單 {String(issuedGiNo)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-1">
            <div className="text-[11px] text-[#9A9890]">總退貨金額</div>
            <div className="text-[22px] font-mono font-semibold text-[#1A3A5C]">
              {fmtNT(Number(detail.amount_total ?? 0))}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {Number(detail.qty_return_total ?? 0).toLocaleString("en-US")} 件
              {detail.refund_amount != null && (
                <>
                  {" · 已退款 "}
                  <b className="text-[#0F6E56]">{fmtNT(Number(detail.refund_amount))}</b>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 3. 區段：退貨資訊 */}
      <SectionCard title="退貨資訊">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="退貨單號" value={detail.rt_no} mono />
          <Kv label="原採購單" value={detail.po?.po_no ?? "—"} mono />
          <Kv label="供應商" value={detail.vendor?.name ?? "—"} />
          <Kv label="出貨倉" value={detail.warehouse?.name ?? "—"} />
          <Kv label="退貨日期" value={detail.return_date ?? "—"} mono />
          <Kv
            label="退貨原因"
            value={
              mode === "edit" ? (
                <select
                  className={inputClass}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              ) : (
                reasonLabel(detail.return_reason)
              )
            }
          />
          <Kv label="申請時間" value={fmtDateTime(detail.created_at)} mono />
          <Kv label="審核時間" value={fmtDateTime(detail.approved_at)} mono />
          <Kv
            label="退貨說明"
            value={
              mode === "edit" ? (
                <textarea
                  className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] w-full focus:border-[#185FA5] focus:outline-none"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              ) : (
                detail.notes || "—"
              )
            }
          />
        </div>
      </SectionCard>

      {/* 4. 區段：物流資訊 */}
      <SectionCard title="物流資訊">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="物流商" value={detail.logistics_provider || "—"} />
          <Kv label="追蹤號" value={detail.logistics_tracking_no || "—"} mono />
          <Kv
            label="出貨時間"
            value={fmtDateTime(
              ((detail.metadata as Record<string, unknown> | null)?.["shipped_at"] as
                | string
                | undefined) ?? null,
            )}
            mono
          />
        </div>
      </SectionCard>

      {/* 5. Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {[
            { key: "lines" as const, label: `退貨明細（${detail.lines.length}）` },
            { key: "history" as const, label: "狀態歷程" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
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
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4">
        {tab === "lines" ? (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="px-2 py-2 text-left w-[40px]">#</th>
                <th className="px-2 py-2 text-left">料號</th>
                <th className="px-2 py-2 text-left">商品名稱</th>
                <th className="px-2 py-2 text-right">退貨數</th>
                <th className="px-2 py-2 text-right">單價</th>
                <th className="px-2 py-2 text-right">小計</th>
                <th className="px-2 py-2 text-left">PO line 進度</th>
                <th className="px-2 py-2 text-left">序號</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((ln) => {
                const serials =
                  (ln.metadata as Record<string, unknown> | null)?.["selected_serial_nos"];
                const serialsArr = Array.isArray(serials) ? (serials as string[]) : [];
                return (
                  <tr key={ln.id} className="border-b border-[#EEECE6] last:border-b-0">
                    <td className="px-2 py-2 font-mono">{ln.line_no}</td>
                    <td className="px-2 py-2 font-mono font-semibold text-[#1A3A5C]">
                      {ln.item?.code ?? "—"}
                    </td>
                    <td className="px-2 py-2">{ln.item?.name ?? "—"}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {Number(ln.qty_return).toLocaleString("en-US")} {ln.uom ?? ""}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{fmtNT(Number(ln.unit_price))}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtNT(Number(ln.line_amount))}</td>
                    <td className="px-2 py-2 text-[11.5px] text-[#5A5955] font-mono">
                      {ln.po_line
                        ? `已收 ${Number(ln.po_line.qty_received).toLocaleString("en-US")} / 訂 ${Number(ln.po_line.qty_ordered).toLocaleString("en-US")}`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-[11.5px] font-mono">
                      {serialsArr.length > 0 ? serialsArr.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
              {detail.lines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-[#9A9890]">
                    沒有明細
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="space-y-2 text-[12.5px]">
            <HistoryRow label="建立" at={detail.created_at} who={detail.created_by} />
            {detail.approved_at && (
              <HistoryRow label="審核通過" at={detail.approved_at} who={detail.approved_by} />
            )}
            {(() => {
              const md = (detail.metadata ?? {}) as Record<string, unknown>;
              const shipped = md.shipped_at ? String(md.shipped_at) : null;
              const completed = md.completed_at ? String(md.completed_at) : null;
              const cancelled = md.cancelled_at ? String(md.cancelled_at) : null;
              const cancelReason = md.cancel_reason ? String(md.cancel_reason) : "—";
              return (
                <>
                  {shipped && <HistoryRow label="物流寄出" at={shipped} who={null} />}
                  {completed && <HistoryRow label="完成" at={completed} who={null} />}
                  {cancelled && (
                    <HistoryRow label={`作廢（${cancelReason}）`} at={cancelled} who={null} />
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modals */}
      {showShip && (
        <ShipModal
          rtId={detail.id}
          onClose={() => setShowShip(false)}
          onSuccess={() => {
            showBanner(true, "✓ 物流資訊已填");
            setShowShip(false);
            router.refresh();
          }}
          onError={(msg) => showBanner(false, `填物流失敗：${msg}`)}
        />
      )}
      {showComplete && (
        <CompleteModal
          rtId={detail.id}
          onClose={() => setShowComplete(false)}
          onSuccess={() => {
            showBanner(true, "✓ 退貨單已標記完成");
            setShowComplete(false);
            router.refresh();
          }}
          onError={(msg) => showBanner(false, `標完成失敗：${msg}`)}
        />
      )}

      {/* Cancel Modal (作廢、要填原因) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[450px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#854F0B]">
                作廢退貨單 {detail.rt_no}
              </h3>
            </header>
            <div className="px-4 py-3 space-y-2">
              <label className="text-[11px] text-[#9A9890] font-medium">
                作廢原因 *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="請填寫作廢原因（必填）..."
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                autoFocus
              />
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={pending || !cancelReason.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDF3E3] border border-[#FAC775] text-[#854F0B] hover:bg-[#fbe9c4] disabled:opacity-60"
              >
                {pending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete confirm Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#CC0000]">確認刪除退貨單</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              確定要刪除 <b className="font-mono">{detail.rt_no}</b>？此動作無法復原。
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                {pending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      )}

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
    </main>
  );
}

function HistoryRow({
  label,
  at,
  who,
}: {
  label: string;
  at: string | null;
  who: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-[#F8F7F4] rounded">
      <span className="font-medium text-[#2C2C2A] min-w-[100px]">{label}</span>
      <span className="font-mono text-[11.5px] text-[#5A5955]">{fmtDateTime(at)}</span>
      {who && (
        <span className="text-[11px] text-[#9A9890] font-mono">by {who.slice(0, 8)}</span>
      )}
    </div>
  );
}

// inline modals — 跟 board.tsx 同款
function ShipModal({
  rtId,
  onClose,
  onSuccess,
  onError,
}: {
  rtId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [provider, setProvider] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [submitting, startSubmit] = useTransition();

  function submit() {
    if (!provider || !trackingNo) return onError("物流商與追蹤號必填");
    startSubmit(async () => {
      const res = await shipPurchaseReturn(rtId, {
        logistics_provider: provider,
        logistics_tracking_no: trackingNo,
      });
      if (res.ok) onSuccess();
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-24"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[420px] rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold">填寫物流資訊</h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>物流商 *</label>
            <input
              className={inputClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="如：黑貓宅急便、新竹物流"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>追蹤號 *</label>
            <input
              className={`${inputClass} font-mono`}
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="物流追蹤單號"
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {submitting ? "送出中⋯" : "確認出貨"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CompleteModal({
  rtId,
  onClose,
  onSuccess,
  onError,
}: {
  rtId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [refund, setRefund] = useState<string>("");
  const [submitting, startSubmit] = useTransition();

  function submit() {
    startSubmit(async () => {
      const refundNum = refund ? Number(refund) : undefined;
      const res = await completePurchaseReturn(
        rtId,
        refundNum != null ? { refund_amount: refundNum } : undefined,
      );
      if (res.ok) onSuccess();
      else onError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-24"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-[420px] rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold">標記退貨完成</h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="text-[12px] text-[#9A9890]">
            可選：填寫實際退款金額（留空則用退貨單原金額）
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>實際退款金額（NT$）</label>
            <input
              type="number"
              className={`${inputClass} font-mono`}
              value={refund}
              onChange={(e) => setRefund(e.target.value)}
              placeholder="留空 = 用原退貨金額"
              disabled={submitting}
            />
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {submitting ? "處理中⋯" : "標完成"}
          </button>
        </footer>
      </div>
    </div>
  );
}
