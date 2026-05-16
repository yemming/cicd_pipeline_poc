"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  PREFIX_P1_DEFS,
  PREFIX_P2_DEFS,
  PREFIX_COMBO_RULES,
  type PrefixP1,
  type PrefixP2,
} from "@/domain/repair-orders.constants";
import type { RoDraft } from "@/domain/repair-orders";
import { confirmRepairOrderAction } from "@/lib/aftersales/repair-order-actions";

function comboLookup(p1: PrefixP1, p2: PrefixP2) {
  return PREFIX_COMBO_RULES.find((r) => r.p1 === p1 && r.p2 === p2);
}

export function RepairOrderConfirmView({ draft }: { draft: RoDraft }) {
  useSetPageHeader({
    title: "正式工單 RO — 開立確認",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "正式工單 RO", href: "/parts/aftersales/repair-orders" },
      { label: "開立確認" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  // 拍板紀錄 §11 Q4 option A：PI 勾「疑似保固 / 公報召回」→ 預設 P1=WC（保固索賠）
  const [p1, setP1] = useState<PrefixP1>(draft.has_warranty_concern ? "WC" : "MN");
  const [p2, setP2] = useState<PrefixP2>(draft.has_warranty_concern ? "WR" : "CP");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const rule = comboLookup(p1, p2);
  const verdict = rule?.verdict ?? "needs_supervisor";
  const description =
    rule?.description ?? `⚠️ ${p1}-${p2} 此組合需主管確認（白名單外）`;
  const accounting = rule?.accounting ?? null;
  const isInvalid = verdict === "invalid";
  const isWarning = verdict === "needs_supervisor";

  const previewCode = useMemo(() => {
    const yymmdd = draft.arrived_date.replace(/-/g, "").slice(2);
    return `${p1}-${p2}-${yymmdd}-NNN`;
  }, [p1, p2, draft.arrived_date]);

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function confirm() {
    if (isPending || isInvalid) return;
    startTransition(async () => {
      const res = await confirmRepairOrderAction({
        appointment_id: draft.appointment_id,
        pre_inspection_id: draft.pre_inspection_id,
        customer_id: draft.customer?.id ?? null,
        vehicle_id: draft.vehicle?.id ?? null,
        prefix_p1: p1,
        prefix_p2: p2,
        mileage_in: draft.vehicle?.current_mileage ?? null,
        estimated_subtotal: draft.estimated_subtotal,
        estimated_labor_units: draft.estimated_labor_units,
        store_id: draft.store_id,
        subsidiary_id: draft.subsidiary_id,
        warranty_status_snapshot: draft.warranty as unknown as Record<string, unknown>,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 工單 ${res.data.ro_code} 已開立` });
        router.push(`/parts/aftersales/repair-orders/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3 max-w-[920px] mx-auto">
      {/* Breadcrumb pill row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/repair-orders" className="hover:text-[#185FA5]">
            正式工單 RO
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">開立確認</span>
          <span className="px-2 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/repair-orders"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            取消
          </Link>
        </div>
      </div>

      {/* PI 勾「疑似保固 / 公報召回」→ amber 提示（Q4 option A） */}
      {draft.has_warranty_concern && (
        <div className="rounded-lg px-4 py-2.5 text-[12.5px] bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B]">
          ⚠️ 預檢單勾了「疑似保固問題 / 公報召回通知」、已預設工單類型為
          <b className="font-mono mx-1">WC</b>（保固索賠）+
          <b className="font-mono mx-1">WR</b>（保固）。若實際為自費或其他類型、SA 可手動改下面 P1/P2。
        </div>
      )}

      {/* RO ID 預覽卡 */}
      <header className="bg-[#1A3A5C] text-white rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="text-[22px] font-bold font-mono tracking-wide">{previewCode}</div>
          <div className="text-[12px] opacity-65 mt-1">
            正式維修工單（RO）· {draft.arrived_date} · 由預檢單/預約自動帶入
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] opacity-65 mb-1">
            來源{draft.source === "pre_inspection" ? "預檢單" : "預約"}
          </div>
          <div className="text-[12px] bg-white/15 px-2.5 py-0.5 rounded font-mono">
            {(draft.source_id || "").slice(0, 8)}…
          </div>
        </div>
      </header>

      {/* 自動帶入資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▌ 車主與車輛資料（由預檢單/預約自動帶入）
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <div className="text-[11px] text-[#9A9890]">車主姓名</div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              {draft.customer?.name ?? <span className="text-[#9A9890]">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">聯絡電話</div>
            <div className="text-[13px] font-mono text-[#2C2C2A]">
              {draft.customer?.phone ?? <span className="text-[#9A9890]">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">進廠日期</div>
            <div className="text-[13px] text-[#2C2C2A]">{draft.arrived_date}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">車型</div>
            <div className="text-[13px] text-[#2C2C2A]">
              {draft.vehicle?.model_name ?? <span className="text-[#9A9890]">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">車牌號碼</div>
            <div className="text-[13px] font-mono text-[#2C2C2A]">
              {draft.vehicle?.license_plate ?? <span className="text-[#9A9890]">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">進廠里程</div>
            <div className="text-[13px] font-mono text-[#2C2C2A]">
              {draft.vehicle?.current_mileage != null
                ? `${draft.vehicle.current_mileage.toLocaleString()} km`
                : "—"}
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div
            className={`rounded px-3 py-2 text-[12px] ${
              draft.warranty.is_valid
                ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
                : "bg-[#F2F2F2] text-[#6B6A68] border border-[#E0DFDB]"
            }`}
          >
            🛡 保固狀態：<b>{draft.warranty.is_valid ? "有效" : "已過期 / 無"}</b>
            {draft.warranty.expires_at && <> · 到期：{draft.warranty.expires_at}</>}
            {" · "}里程：{draft.warranty.mileage_limit}
          </div>
        </div>
      </section>

      {/* 維修項目摘要 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▌ 本次維修項目（共 {draft.preview_items.length} 項）
          </span>
        </header>
        <div className="px-4 py-3 bg-[#F8F7F4]">
          {draft.preview_items.map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-[#EEECE6] last:border-0 text-[12.5px]"
            >
              <span>
                {String.fromCharCode(0x2460 + i)} {it.label}
              </span>
              <span className="font-mono text-[12px]">
                {it.lu} LU · NT${it.amount.toLocaleString()}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-[#1A3A5C] text-[14px] font-bold text-[#1A3A5C]">
            <span>預估合計（含稅）</span>
            <span className="font-mono">NT${draft.estimated_subtotal.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* SA 唯一操作 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▌ SA 選擇工單類型（必填）
          </span>
        </header>
        <div className="px-4 py-4 space-y-4">
          <div>
            <div className="text-[12px] text-[#5A5955] mb-2">業務類型 (P1)</div>
            <div className="flex flex-wrap gap-2">
              {PREFIX_P1_DEFS.map((d) => {
                const selected = p1 === d.code;
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => setP1(d.code)}
                    disabled={isPending}
                    className={`flex-1 min-w-[150px] text-left px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${
                      selected
                        ? "border-[#1A3A5C] bg-[#EBF3FF]"
                        : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                    }`}
                  >
                    <div className="text-[18px] font-bold font-mono text-[#1A3A5C]">{d.code}</div>
                    <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{d.name}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[12px] text-[#5A5955] mb-2">付款性質 (P2)</div>
            <div className="flex flex-wrap gap-2">
              {PREFIX_P2_DEFS.map((d) => {
                const selected = p2 === d.code;
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => setP2(d.code)}
                    disabled={isPending}
                    className={`flex-1 min-w-[180px] text-left px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${
                      selected
                        ? "border-[#1A3A5C] bg-[#EBF3FF]"
                        : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                    }`}
                  >
                    <div className="text-[18px] font-bold font-mono text-[#1A3A5C]">{d.code}</div>
                    <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{d.name}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 組合結果 */}
          <div
            className={`rounded-lg px-4 py-3 text-[13px] font-medium border-[1.5px] ${
              isInvalid
                ? "bg-[#FDECEA] border-[#F5AEAD] text-[#CC0000]"
                : isWarning
                  ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]"
                  : "bg-[#EAF3DE] border-[#C5DC9F] text-[#3B6D11]"
            }`}
          >
            {description}
            {accounting && !isInvalid && (
              <span className="ml-2 text-[11px] inline-flex px-2 py-0.5 rounded-md bg-white/60">
                會計類別：{accounting}
              </span>
            )}
          </div>

          {/* Confirm */}
          <button
            type="button"
            onClick={confirm}
            disabled={isInvalid || isPending}
            className="w-full h-[52px] rounded-lg bg-[#1A3A5C] text-white text-[15px] font-semibold hover:bg-[#0F2A45] disabled:bg-[#D5D3CB] disabled:text-[#9A9890] disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {isPending
              ? "建立中⋯"
              : isInvalid
                ? "請先選擇正確組合"
                : `確認開立工單 ${previewCode} →`}
          </button>
          <div className="text-center text-[11px] text-[#9A9890]">
            確認後工單狀態設為「進行中」、預約狀態同步切「維修中」、技師可開始作業並打卡
          </div>
        </div>
      </section>

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
