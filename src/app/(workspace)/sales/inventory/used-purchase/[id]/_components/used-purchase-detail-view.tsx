"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  confirmDirectBuyAction,
  rejectUsedPurchaseAction,
  deleteUsedPurchaseAction,
} from "@/lib/vehicle-inventory/used-purchase-actions";
import {
  SOURCE_TYPE_LABELS,
  DECISION_LABELS,
  type UsedPurchaseRequestRow,
} from "@/domain/used-purchase-requests.constants";

const BASE = "/sales/inventory/used-purchase";

function fmtNT(v: number | null | undefined): string {
  if (v == null) return "—";
  return `NT$${Number(v).toLocaleString("en-US")}`;
}

type UsedCarLite = {
  id: string;
  model_display_name: string;
  status: string;
  recon_workorder_code: string | null;
};

export default function UsedPurchaseDetailView({
  request,
  canEdit,
  usedCar,
}: {
  request: UsedPurchaseRequestRow;
  canEdit: boolean;
  usedCar: UsedCarLite | null;
}) {
  const router = useRouter();
  useSetPageHeader({
    breadcrumb: [
      { label: "中古車收購申請", href: BASE },
      { label: request.application_no },
    ],
  });

  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const meta = (request.metadata ?? {}) as Record<string, unknown>;
  const modelName =
    (typeof meta.vehicle_model_name === "string" && meta.vehicle_model_name) ||
    request.vin ||
    "—";
  const decided = !!request.decision || !!request.used_car_id;

  function handleConfirm(decision: "approved" | "conditional") {
    startTransition(async () => {
      const r = await confirmDirectBuyAction({ request_id: request.id, decision });
      if (!r.ok) {
        setBanner({ ok: false, msg: `❌ ${r.error}` });
        return;
      }
      setBanner({
        ok: true,
        msg: `✓ 已收購 · 中古車主檔已建立 · 整備工單 ${r.data.ro_code}`,
      });
      setTimeout(() => router.refresh(), 800);
    });
  }

  function handleReject() {
    if (!confirm("確定標記為「不收購」？此申請單將不建立任何主檔。")) return;
    startTransition(async () => {
      const r = await rejectUsedPurchaseAction({ request_id: request.id });
      if (!r.ok) {
        setBanner({ ok: false, msg: `❌ ${r.error}` });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已標記為不收購" });
      setTimeout(() => router.refresh(), 800);
    });
  }

  function handleDelete() {
    if (!confirm(`確定刪除收購申請 ${request.application_no}？無法復原。`)) return;
    startTransition(async () => {
      const r = await deleteUsedPurchaseAction(request.id);
      if (!r.ok) {
        setBanner({ ok: false, msg: `❌ ${r.error}` });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已刪除" });
      setTimeout(() => router.push(BASE), 700);
    });
  }

  const decisionChip = (() => {
    if (request.decision === "approved")
      return { label: "已收購", cls: "bg-[#EAF3DE] text-[#3B6D11]" };
    if (request.decision === "conditional")
      return { label: "條件收購", cls: "bg-[#FDF3E3] text-[#854F0B]" };
    if (request.decision === "rejected")
      return { label: "不收購", cls: "bg-[#FDECEA] text-[#CC0000]" };
    return { label: "待決策", cls: "bg-[#F2F2F2] text-[#6B6A68]" };
  })();

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            中古車收購申請
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{request.application_no}</span>
          <span className={`ml-1 px-2 py-0.5 rounded-md text-[11px] ${decisionChip.cls}`}>
            {decisionChip.label}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={BASE}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {!decided && canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              刪除
            </button>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">直購收購申請</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
          {modelName}
          {request.year ? <span className="text-[#9A9890] text-[14px]"> · {request.year}</span> : null}
        </h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="font-mono text-[#5A5955]">{request.application_no}</span>
          {request.source_type && (
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
              {SOURCE_TYPE_LABELS[request.source_type]}
            </span>
          )}
        </div>
      </header>

      {/* 已收購：成功結果卡 */}
      {usedCar && (
        <section className="rounded-lg bg-gradient-to-br from-[#0F6E56] to-[#185FA5] text-white p-4 shadow">
          <div className="text-[14px] font-bold mb-2">
            ✅ 收購已確認 — 中古車主檔 + 整備工單已建立
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/usedcar/stock"
              className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12px]"
            >
              🏍️ 中古車主檔：<b>{usedCar.model_display_name}</b>（{usedCar.status}）
            </Link>
            {usedCar.recon_workorder_code && (
              <Link
                href="/parts/aftersales/repair-orders"
                className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12px]"
              >
                🔧 整備工單：<b className="font-mono">{usedCar.recon_workorder_code}</b>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* 賣方資料 */}
      <Section title="▼ 賣方資料">
        <Kv label="賣方姓名 / 公司" value={request.seller_name ?? "—"} />
        <Kv label="聯絡電話" value={request.seller_phone ?? "—"} mono />
        <Kv label="身分證 / 統編" value={request.seller_id_no ?? "—"} mono />
      </Section>

      {/* 車輛資料 */}
      <Section title="▼ 車輛資料">
        <Kv label="VIN" value={request.vin ?? "—"} mono />
        <Kv label="車型" value={modelName} />
        <Kv label="出廠年份" value={request.year != null ? String(request.year) : "—"} />
        <Kv label="車身顏色" value={request.color ?? "—"} />
        <Kv label="里程數" value={request.mileage_km != null ? `${request.mileage_km.toLocaleString("en-US")} km` : "—"} mono />
        <Kv label="外觀等級" value={request.grade_ext ?? "—"} />
        <Kv label="機械等級" value={request.grade_mech ?? "—"} />
      </Section>

      {/* 鑑價與成本 */}
      <Section title="▼ 鑑價與成本">
        <Kv label="市場行情" value={fmtNT(request.market_ref_price)} mono />
        <Kv label="整備成本估算" value={fmtNT(request.recon_estimate)} mono />
        <Kv label="建議收購報價" value={fmtNT(request.suggested_price)} mono />
        <Kv label="實際收購報價" value={fmtNT(request.actual_price)} mono />
        <Kv label="收購決策" value={request.decision ? DECISION_LABELS[request.decision] : "待決策"} />
      </Section>

      {/* 車輛流向：自家品牌 vs 批售外部（B1） */}
      <Section title="▼ 車輛流向">
        <Kv
          label="流向"
          value={
            request.is_own_brand === false
              ? "批售外部買家"
              : request.is_own_brand === true
                ? "自家品牌（整備上架）"
                : "—"
          }
        />
        {request.is_own_brand === false && (
          <>
            <Kv label="外部買家姓名" value={request.external_buyer_name ?? "—"} />
            <Kv label="外部買家電話" value={request.external_buyer_phone ?? "—"} mono />
            <Kv label="批售成交金額" value={fmtNT(request.wholesale_price)} mono />
            <Kv label="批售成交日期" value={request.wholesale_date ?? "—"} mono />
          </>
        )}
      </Section>

      {/* 尚未決策 → 提供收購 / 不收購 */}
      {!decided && canEdit && (
        <section className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-1">收購決策</div>
          <div className="text-[12px] text-[#9A9890] mb-3">
            確認後系統自動建立中古車主檔（待整備）並觸發 PD-UC 整備工單，費用計入整車成本。
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
            >
              {isPending ? "處理中⋯" : "❌ 不收購"}
            </button>
            <button
              type="button"
              onClick={() => handleConfirm("conditional")}
              disabled={isPending}
              className="h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fbe9ce] disabled:opacity-60"
            >
              {isPending ? "建立中⋯" : "⚠️ 條件收購"}
            </button>
            <button
              type="button"
              onClick={() => handleConfirm("approved")}
              disabled={isPending}
              className="h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              {isPending ? "建立中⋯" : "✅ 確認收購"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
        {children}
      </div>
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
