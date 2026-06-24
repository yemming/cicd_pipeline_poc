"use client";

/**
 * ContractViewer — /sales/orders/[id]/contract
 *
 * 嵌入式合約查看頁（不跳新分頁）。
 * - 顯示合約快照（metadata.contract_snapshot）或即時欄位（快照尚未產生時）
 * - 顯示三方簽名縮圖
 * - 鎖定狀態 + 解鎖按鈕（主管限定）
 * - 列印連結 → /print/sales-order/[id]
 *
 * RS04 Stage 2 (B12 / 輪5-10)
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  CONTRACT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CHIP,
  PAYMENT_METHOD_LABELS,
  type ContractType,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain/sales-orders.constants";
import type { SalesOrderDetail } from "@/domain/sales-orders.constants";
import { lockContractAction, unlockContractAction } from "@/lib/sales/order-actions";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Props = {
  order: SalesOrderDetail;
  canEdit: boolean;
  canUnlock: boolean;
  /** 從 legal_text_templates 讀取（或快照內）的合約條款全文。null 顯示 hardcode fallback。 */
  termsText?: string | null;
  /** true 代表 termsText 來自快照（已簽合約凍結版），false 代表當前 active 版 */
  termsFromSnapshot?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  const s = String(Math.round(Number(n)));
  const neg = s.startsWith("-") ? "-" : "";
  const abs = neg ? s.slice(1) : s;
  return `NT$ ${neg}${abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${tpe.getUTCFullYear()}-${String(tpe.getUTCMonth() + 1).padStart(2, "0")}-${String(tpe.getUTCDate()).padStart(2, "0")} ${String(tpe.getUTCHours()).padStart(2, "0")}:${String(tpe.getUTCMinutes()).padStart(2, "0")}`;
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
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
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
        {children}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function ContractViewer({ order, canEdit, canUnlock, termsText, termsFromSnapshot }: Props) {
  const router = useRouter();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [isUnlocking, startUnlockTransition] = useTransition();
  const [isLocking, startLockTransition] = useTransition();

  const inputCls =
    "w-full px-2 py-1.5 rounded border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#185FA5] bg-white";

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  // 快照（優先讀凍結版本）
  type ContractSnap = {
    snapped_at?: string;
    order_no?: string;
    contract_type?: string;
    customer_name?: string;
    vehicle?: string;
    total_amount?: number | null;
    payment_method?: string | null;
    delivery_date?: string | null;
    special_notes?: string | null;
    condition_notes?: string | null;
    signature_buyer?: string | null;
    signature_seller?: string | null;
    signature_witness?: string | null;
  };
  const snap =
    (order.metadata?.contract_snapshot as ContractSnap | null | undefined) ?? null;

  const statusChip =
    ORDER_STATUS_CHIP[order.status as OrderStatus] ?? { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" };

  // ── 鎖定 ──
  function handleLock() {
    if (!confirm("確定手動鎖定合約？")) return;
    startLockTransition(async () => {
      const res = await lockContractAction(order.id);
      if (res.ok) { showBanner(true, "✓ 合約已鎖定"); router.refresh(); }
      else showBanner(false, `✗ ${res.error}`);
    });
  }

  // ── 解鎖 ──
  function handleUnlockSubmit() {
    if (!unlockReason.trim()) { showBanner(false, "請填寫解鎖原因"); return; }
    startUnlockTransition(async () => {
      const res = await unlockContractAction(order.id, unlockReason.trim());
      if (res.ok) {
        setShowUnlockModal(false);
        setUnlockReason("");
        showBanner(true, "✓ 合約已解鎖");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  return (
    <div className="px-6 py-5 space-y-3">
      {/* Banner */}
      {banner && (
        <div className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
          banner.ok
            ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
            : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
        }`}>
          {banner.msg}
        </div>
      )}

      {/* ── Breadcrumb + 工具列 ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/sales/orders" className="hover:text-[#185FA5]">訂單中心</Link>
          <span>›</span>
          <Link href={`/sales/orders/${order.id}`} className="hover:text-[#185FA5] font-mono">
            {order.order_no}
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">合約查看</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <Link
            href={`/sales/orders/${order.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center"
          >
            返回詳情
          </Link>
          <button
            type="button"
            onClick={() => window.open(`/print/sales-order/${order.id}`, "_blank")}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">print</span>
            列印
          </button>
          {/* 手動鎖定（三方全簽但未鎖時） */}
          {canEdit && !order.contract_locked && order.status !== "cancelled"
            && order.signature_buyer && order.signature_seller && order.signature_witness && (
            <button
              type="button"
              onClick={handleLock}
              disabled={isLocking}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              {isLocking ? "鎖定中⋯" : "鎖定合約"}
            </button>
          )}
          {/* 主管解鎖 */}
          {canUnlock && order.contract_locked && order.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => { setUnlockReason(""); setShowUnlockModal(true); }}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#FDF3E3] border border-[#E5C880] text-[#854F0B] hover:bg-[#faebc9] shadow-sm"
            >
              主管解鎖
            </button>
          )}
        </div>
      </div>

      {/* ── Title Card ── */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              {CONTRACT_TYPE_LABELS[order.contract_type as ContractType] ?? order.contract_type}
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {order.customer_name ?? "（無客戶）"}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{order.order_no}</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChip.bg} ${statusChip.text}`}>
                {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
              </span>
              {order.contract_locked && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-[#1A3A5C] text-white font-medium">
                  <span className="material-symbols-outlined text-[11px]">lock</span>
                  合約已鎖定
                </span>
              )}
            </div>
          </div>
          {/* 快照時間 */}
          {snap?.snapped_at && (
            <div className="text-right text-[11px] text-[#9A9890]">
              <div>合約快照凍結時間</div>
              <div className="font-mono text-[#185FA5]">{fmtDateTime(snap.snapped_at)}</div>
              <div className="text-[10.5px] mt-0.5">（簽署後版本）</div>
            </div>
          )}
        </div>
      </header>

      {/* 快照提示 */}
      {snap ? (
        <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-md px-3.5 py-2.5 text-[12px] text-[#3B6D11]">
          ✓ 此頁顯示合約簽署當下的凍結版本（快照於 {fmtDateTime(snap.snapped_at)} 產生）。若合約後續被解鎖修改，快照將在下次三方全簽後重新凍結。
        </div>
      ) : (
        <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3.5 py-2.5 text-[12px] text-[#185FA5]">
          ℹ 三方簽名完成前尚無快照，此頁顯示合約目前欄位的即時資料。
        </div>
      )}

      {/* ── 買受人資料 ── */}
      <SectionCard title="買受人資料">
        <Kv label="姓名" value={order.customer_name} />
        <Kv label="身分證字號" value={order.buyer_national_id} mono />
        <Kv label="聯絡電話" value={order.customer_phone} mono />
        <Kv label="電子郵件" value={order.customer_email} />
        <Kv label="戶籍地址" value={order.customer_address} />
        <Kv label="銷售顧問（RS）" value={order.rs_name} />
      </SectionCard>

      {/* 新車資料 */}
      {order.contract_type === "new" && (
        <>
          <SectionCard title="車輛資料（新車）">
            <Kv label="車款型號" value={order.vehicle_model_name} />
            <Kv label="車身顏色" value={order.vehicle_color} />
            <Kv label="車身號碼（VIN）" value={order.vehicle_vin} mono />
            <Kv label="引擎號碼" value={order.vehicle_engine_no} mono />
          </SectionCard>
          <SectionCard title="付款與交車">
            <Kv label="付款方式" value={PAYMENT_METHOD_LABELS[order.payment_method as PaymentMethod] ?? order.payment_method} />
            <Kv label="訂金金額" value={fmtNT(order.down_payment)} mono />
            <Kv label="預計交車日期" value={fmtDate(order.delivery_date)} mono />
          </SectionCard>
          {order.special_notes && (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 特殊約定</span>
              </header>
              <div className="px-4 py-4 text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
                {order.special_notes}
              </div>
            </section>
          )}
        </>
      )}

      {/* 中古車資料 */}
      {order.contract_type === "used" && (
        <>
          <SectionCard title="車輛資料（中古車）">
            <Kv label="廠牌/車款" value={order.used_brand_model} />
            <Kv label="出廠年份" value={order.used_year} mono />
            <Kv label="車牌號碼" value={order.used_plate} mono />
            <Kv label="排氣量（cc）" value={order.used_cc} />
            <Kv label="行駛里程（km）" value={order.used_mileage} />
            <Kv label="認證等級" value={order.used_cert_level} />
          </SectionCard>
          <SectionCard title="成交價格與過戶">
            <Kv label="成交價格" value={fmtNT(order.deal_price)} mono />
            <Kv label="訂金" value={fmtNT(order.down_payment)} mono />
            <Kv label="尾款日期" value={fmtDate(order.final_payment_date)} mono />
            <Kv label="過戶辦理" value={order.transfer_by} />
          </SectionCard>
          {order.condition_notes && (
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 車輛現況說明</span>
              </header>
              <div className="px-4 py-4 text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
                {order.condition_notes}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── 三方簽名 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 三方簽名</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              { label: "買受人簽名", sig: snap?.signature_buyer ?? order.signature_buyer },
              { label: "賣方 / 銷售顧問", sig: snap?.signature_seller ?? order.signature_seller },
              { label: "見證人 / 授權代表", sig: snap?.signature_witness ?? order.signature_witness },
            ]
          ).map(({ label, sig }) => (
            <div key={label} className="border border-[#D5D3CB] rounded-lg bg-[#FAFAF8] overflow-hidden">
              <div className="px-3 py-2 border-b border-[#EEECE6] bg-[#F4F3F0]">
                <span className="text-[11.5px] font-semibold text-[#2C2C2A]">{label}</span>
              </div>
              <div className="px-3 py-3">
                {sig ? (
                  <div className="flex flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sig}
                      alt={`${label}簽名`}
                      className="w-full max-h-[80px] object-contain border border-[#EEECE6] rounded bg-white"
                    />
                    <span className="text-[10.5px] text-[#3B6D11] font-medium">✓ 已簽名</span>
                  </div>
                ) : (
                  <div className="h-[60px] flex items-center justify-center text-[12px] text-[#9A9890]">
                    尚未簽名
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 合約重要條款 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 合約重要條款</span>
          {termsFromSnapshot && (
            <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#EAF3DE] text-[#3B6D11]">
              簽署時版本（凍結）
            </span>
          )}
        </header>
        <div className="px-4 py-4 text-[12px] text-[#4A4A48] leading-relaxed">
          {termsText ? (
            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed">{termsText}</pre>
          ) : (
            /* Fallback：本品牌尚無對應 legal_text_templates 範本。不顯示任何替代合約文字，
               避免出現未經授權的精簡版/錯誤品牌條款（Russell RS04 退回意見核心風險）。*/
            <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-md px-3.5 py-3 text-[12px] text-[#CC0000] leading-relaxed">
              <div className="font-bold mb-1">⚠ 合約條款範本未設定</div>
              本品牌尚未設定「{order.contract_type === "used" ? "中古機車買賣合約條款" : "新車訂購合約條款"}」範本，
              無法顯示合約內容。請至「管理 ＞ 法律文字範本」設定後再行檢視 / 簽署。
            </div>
          )}
        </div>
      </section>

      {/* ── 解鎖 Modal ── */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" style={{ pointerEvents: "auto" }}>
            <div className="text-[15px] font-semibold text-[#854F0B]">主管解鎖合約</div>
            <div className="text-[12px] text-[#9A9890]">
              解鎖後可修改或補簽三方簽名，操作記錄將寫入稽核日誌。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">解鎖原因 *</label>
              <textarea
                className={`${inputCls} h-[72px] resize-none`}
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                disabled={isUnlocking}
                placeholder="請說明解鎖原因（主管責任記錄）…"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setShowUnlockModal(false); setUnlockReason(""); }}
                disabled={isUnlocking}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUnlockSubmit}
                disabled={isUnlocking}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isUnlocking ? "解鎖中⋯" : "確認解鎖"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
