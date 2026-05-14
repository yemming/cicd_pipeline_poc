"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  returnConsignmentAction,
  transferConsignmentInAction,
} from "@/domain/consignment";
import type { ConsignmentDetail } from "@/domain/consignment";
import {
  STATUS_CHIP,
  fmtDate,
  fmtMoney,
} from "@/domain/consignment.constants";

type Banner = { ok: boolean; msg: string } | null;

function fmtDateTime(d: string | null): string {
  return d ? new Date(d).toLocaleString("zh-TW") : "—";
}

export function ConsignmentDetailView({
  detail,
  canEdit,
}: {
  detail: ConsignmentDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { con, stockItems, events } = detail;
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const def =
    STATUS_CHIP[con.due_bucket === "expired" ? "expired" : con.status] ??
    STATUS_CHIP.active;
  const canTransfer =
    canEdit && con.status === "active" && Number(con.remaining_qty ?? 0) > 0;
  const canReturn = canEdit && con.status === "active";

  const handleTransfer = () => {
    if (!canTransfer) return;
    if (!confirm(`確認將 ${con.con_no} 轉入正式庫存？\n會自動產生 PARTS_PURCHASE 分錄。`)) {
      return;
    }
    startTransition(async () => {
      const res = await transferConsignmentInAction(con.id);
      if (res.ok) {
        flash({ ok: true, msg: `✓ ${con.con_no} 已轉入正式庫存` });
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  const confirmReturn = () => {
    const reason = returnReason.trim();
    startTransition(async () => {
      const res = await returnConsignmentAction(con.id, reason || undefined);
      if (res.ok) {
        flash({ ok: true, msg: `✓ ${con.con_no} 已退還、記錄保留 90 天` });
        setReturnOpen(false);
        setReturnReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: res.error });
      }
    });
  };

  return (
    <main
      className={`px-6 py-5 space-y-3 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/operations/consignment"
            className="hover:text-[#185FA5]"
          >
            寄存管理
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{con.con_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/consignment"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {canEdit ? (
            <Link
              href="/parts/operations/consignment/new"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              ＋ 新登錄
            </Link>
          ) : null}
          {canTransfer ? (
            <button
              type="button"
              onClick={handleTransfer}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              📦 {isPending ? "處理中⋯" : "確認轉入"}
            </button>
          ) : null}
          {canReturn ? (
            <button
              type="button"
              onClick={() => {
                setReturnOpen(true);
                setReturnReason("");
              }}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDF3E3] border border-[#FAC775] text-[#854F0B] hover:bg-[#fbe9c8] shadow-sm disabled:opacity-50"
            >
              ↩ 退還
            </button>
          ) : null}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                寄存單
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {con.item_name ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{con.con_no}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
                >
                  {def.icon} {def.label}
                </span>
                {con.due_bucket === "near" ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    🟠 {con.days_remaining} 天後到期
                  </span>
                ) : null}
                {con.due_bucket === "expired" ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                    🔴 已逾期 {Math.abs(con.days_remaining)} 天
                  </span>
                ) : null}
              </div>
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
          <Kv label="寄存單號" value={con.con_no} mono />
          <Kv label="供應商" value={con.supplier_name ?? "—"} />
          <Kv label="寄存倉" value={con.warehouse_name ?? "—"} mono />
          <Kv
            label="備件代碼"
            value={con.item_code ?? "—"}
            mono
          />
          <Kv label="商品名稱" value={con.item_name ?? "—"} />
          <Kv
            label="單價"
            value={
              con.unit_cost != null
                ? fmtMoney(Number(con.unit_cost))
                : "—"
            }
            mono
          />
          <Kv label="寄存開始" value={fmtDate(con.start_date)} mono />
          <Kv label="寄存到期" value={fmtDate(con.end_date)} mono />
          <Kv label="建立時間" value={fmtDateTime(con.created_at)} mono small />
          {con.transferred_at ? (
            <Kv
              label="轉入時間"
              value={fmtDateTime(con.transferred_at)}
              mono
              small
            />
          ) : null}
          {con.notes ? <Kv label="備註" value={con.notes} /> : null}
        </div>
      </section>

      {/* 數量明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 數量
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-3 gap-3 text-center">
          <QtyCell label="寄存" value={Number(con.initial_qty ?? 0)} />
          <QtyCell label="剩餘" value={Number(con.remaining_qty ?? 0)} />
          <QtyCell label="已轉購" value={Number(con.transferred_qty ?? 0)} />
        </div>
      </section>

      {/* stock_items 連動行 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 寄存品庫存（stock_items，{stockItems.length}）
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                <th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2 text-right">單價</th>
                <th className="px-3 py-2">序列號 / 批號</th>
                <th className="px-3 py-2">最後異動</th>
                <th className="px-3 py-2">備註</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-10 text-center text-[12px] text-[#9A9890]"
                  >
                    無對應 stock_items（寄存單已退還 / 異常）
                  </td>
                </tr>
              ) : (
                stockItems.map((s) => (
                  <tr key={s.id} className="border-t border-[#EEECE6]">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5] font-mono">
                        {s.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{s.qty}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {s.unit_cost != null ? fmtMoney(Number(s.unit_cost)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                      {s.serial_no || s.batch_no ? (
                        <>
                          {s.serial_no ? (
                            <span className="font-mono">SN:{s.serial_no}</span>
                          ) : null}
                          {s.serial_no && s.batch_no ? <span> / </span> : null}
                          {s.batch_no ? (
                            <span className="font-mono">B:{s.batch_no}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">
                      {fmtDateTime(s.last_movement_at)}
                    </td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                      {s.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* audit trail */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 異動軌跡（stock_movements，{events.length}）
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                <th className="px-3 py-2">時間</th>
                <th className="px-3 py-2">方向</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2">原因</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-10 text-center text-[12px] text-[#9A9890]"
                  >
                    尚無異動紀錄
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="border-t border-[#EEECE6]">
                    <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955]">
                      {fmtDateTime(e.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      {e.direction === "in" ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                          ↑ 進
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
                          ↓ 出
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {e.qty}
                    </td>
                    <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A]">
                      {e.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Return modal */}
      {returnOpen ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setReturnOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[460px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                退還寄存品 {con.con_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                退還後寄存品庫存（stock_items）會被刪除、寄存單狀態 → 已退還、保留 90 天。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  退還原因（選填）
                </label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={3}
                  placeholder="例：供應商召回、品質不符⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReturn}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#FDF3E3] border border-[#FAC775] text-[#854F0B] hover:bg-[#fbe9c8] disabled:opacity-50"
              >
                {isPending ? "退還中⋯" : "確認退還"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
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

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`${mono ? "font-mono " : ""}${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function QtyCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg p-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-semibold font-mono text-[#2C2C2A]">
        {value}
      </div>
    </div>
  );
}
