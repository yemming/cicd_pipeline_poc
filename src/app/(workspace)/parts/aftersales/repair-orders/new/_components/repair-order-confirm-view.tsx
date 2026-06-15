"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  PREFIX_P1_DEFS,
  PREFIX_P2_DEFS,
  PREFIX_COMBO_RULES,
  RO_PRIORITY_DEFS,
  type PrefixP1,
  type PrefixP2,
  type RoPriority,
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
  const [priority, setPriority] = useState<RoPriority>("normal");
  const [markRework, setMarkRework] = useState(false);
  const [warrantyAuthName, setWarrantyAuthName] = useState("");
  const [warrantyAuthReason, setWarrantyAuthReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // PD（PDI整備）模式：選 PD 時 P2 自動鎖 IN（內部結算），費用計入整車成本、車主應付 NT$0
  const isPDI = p1 === "PD";

  // 選 P1：PD → 強制 P2=IN；離開 PD（原本是 IN）→ 還原成 CP（或保固預設 WR）
  function selectP1(code: PrefixP1) {
    setP1(code);
    if (code === "PD") {
      setP2("IN");
    } else if (p2 === "IN") {
      setP2(draft.has_warranty_concern ? "WR" : "CP");
    }
    // WC / PD 不適用返工免費（WC-FR 邏輯衝突、PD 走內部結算）→ 清掉返工標記
    if (code === "WC" || code === "PD") setMarkRework(false);
  }

  // 返工偵測：同車近 30 天「同 P1」歷史工單（排當前若已存在）
  const sameTypeRecent = useMemo(
    () => draft.recent_repairs.filter((r) => r.prefix_p1 === p1),
    [draft.recent_repairs, p1],
  );
  // 返工免費僅適用客付/費用型（MN/RP/AC/OT），WC/PD 不提供
  const reworkEligible = p1 !== "WC" && p1 !== "PD" && sameTypeRecent.length > 0;
  const reworkOriginal = sameTypeRecent[0] ?? null;

  function toggleRework(checked: boolean) {
    setMarkRework(checked);
    // 標記返工 → P2 自動切「免費施工 FR」（本店吸收返工成本）
    if (checked) setP2("FR");
    else setP2(draft.has_warranty_concern ? "WR" : "CP");
  }

  // 保固過期阻擋：開 WC（保固索賠）但保固快照已失效 → 需主管授權才放行
  const warrantyOverdue = !draft.warranty.is_valid;
  const needWarrantyAuth = p1 === "WC" && warrantyOverdue;
  const warrantyBlocked = needWarrantyAuth && !warrantyAuthName.trim();

  // 選 P2：PD 模式下鎖定、不允許手動改
  function selectP2(code: PrefixP2) {
    if (isPDI) return;
    setP2(code);
  }

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
    if (isPending || isInvalid || warrantyBlocked) return;
    startTransition(async () => {
      const res = await confirmRepairOrderAction({
        appointment_id: draft.appointment_id,
        pre_inspection_id: draft.pre_inspection_id,
        customer_id: draft.customer?.id ?? null,
        vehicle_id: draft.vehicle?.id ?? null,
        prefix_p1: p1,
        prefix_p2: p2,
        priority,
        mileage_in: draft.vehicle?.current_mileage ?? null,
        estimated_subtotal: draft.estimated_subtotal,
        estimated_labor_units: draft.estimated_labor_units,
        store_id: draft.store_id,
        subsidiary_id: draft.subsidiary_id,
        warranty_status_snapshot: draft.warranty as unknown as Record<string, unknown>,
        rework_of: markRework && reworkOriginal ? reworkOriginal.id : null,
        warranty_auth: needWarrantyAuth
          ? {
              authorized_by: warrantyAuthName.trim(),
              reason: warrantyAuthReason.trim() || null,
            }
          : null,
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

      {/* B3-01：同車多工單提示橫幅（後端已擋，前端預警讓 SA 提早知道） */}
      {draft.concurrent_ro_code && (
        <div className="rounded-lg px-4 py-3 text-[12.5px] bg-[#F0EFFE] border border-[#C5C0F0] text-[#534AB7]">
          <span className="font-semibold">⚠️ 此車輛目前有其他進行中工單（</span>
          <span className="font-mono font-bold">{draft.concurrent_ro_code}</span>
          <span className="font-semibold">），送出後系統將阻擋重複開單。</span>
          <span className="ml-1 text-[12px]">請先確認該工單狀態，或洽主管確認是否允許同車多工單。</span>
        </div>
      )}

      {/* 預檢損傷摘要橫幅（由 PI 環檢自動帶入，SA 確認後繼續） */}
      {draft.inspection_damage_summary !== null && (
        <div className="rounded-lg px-4 py-3 text-[12.5px] bg-[#EAF4FB] border border-[#A9CCE8] text-[#185FA5]">
          <div className="font-semibold mb-1">
            📋 來自預檢單的自動帶入資料 — 環境檢查摘要
          </div>
          {draft.inspection_damage_summary.length > 0 ? (
            <ul className="list-none space-y-0.5 mt-1">
              {draft.inspection_damage_summary.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 text-[#185FA5]">①</span>
                  <span className="text-[12px]">{item}（進廠前已存在）</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-[#185FA5]">已附環檢單，環檢無損傷記錄，SA 確認無誤後繼續開立工單。</p>
          )}
        </div>
      )}

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
                const isPd = d.code === "PD";
                // PD 選中 → 綠（整車成本內部結算）；其餘選中 → 深藍
                const selectedCls = isPd
                  ? "border-[#0F6E56] bg-[#E8F5F0]"
                  : "border-[#1A3A5C] bg-[#EBF3FF]";
                const codeColor = isPd ? "text-[#0F6E56]" : "text-[#1A3A5C]";
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => selectP1(d.code)}
                    disabled={isPending}
                    className={`flex-1 min-w-[150px] text-left px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${
                      selected ? selectedCls : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                    }`}
                  >
                    <div className={`text-[18px] font-bold font-mono ${codeColor}`}>{d.code}</div>
                    <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{d.name}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PD 費用說明卡（選 PD 時顯示）— 整車成本 / 車主應付 NT$0 */}
          {isPDI && (
            <div className="rounded-lg px-4 py-3 bg-[#E8F5F0] border-[1.5px] border-[#1D9E75]">
              <div className="text-[12.5px] font-bold text-[#085041] mb-1">
                ℹ️ PDI 整備工單（PD）— 費用計入整車成本
              </div>
              <div className="text-[12px] text-[#0F4A35] leading-relaxed">
                本工單類型用於<b>新車到港</b>或<b>中古車整備</b>的 PDI 作業。
                費用由<b>銷售部門整車成本</b>承擔、<b>不向車主收取任何費用</b>。
                系統將於工單完成後自動把工時費用與零件費用寫回車輛主檔、更新整車成本合計。
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  "付款性質：IN（內部結算）",
                  "費用歸屬：整車在庫成本",
                  "車主應付：NT$0",
                  "適用前綴：PD-IN（新車）/ PD-UC（中古）",
                ].map((t) => (
                  <span
                    key={t}
                    className="bg-white border border-[#1D9E75] rounded px-2.5 py-0.5 text-[11.5px] text-[#085041]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[12px] text-[#5A5955] mb-2">
              {isPDI ? "付款性質 (P2)（PDI 模式：自動鎖定為內部結算）" : "付款性質 (P2)"}
            </div>
            <div className="flex flex-wrap gap-2">
              {PREFIX_P2_DEFS.map((d) => {
                const isIn = d.code === "IN";
                // PD 模式：只顯示 IN（鎖定）；非 PD 模式：隱藏 IN（IN 只屬於 PDI）
                if (isPDI && !isIn) return null;
                if (!isPDI && isIn) return null;
                const selected = p2 === d.code;
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => selectP2(d.code)}
                    disabled={isPending || isPDI}
                    className={`relative flex-1 min-w-[180px] text-left px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${
                      isPDI
                        ? "border-[#1D9E75] bg-[#E8F5F0] cursor-not-allowed"
                        : selected
                          ? "border-[#1A3A5C] bg-[#EBF3FF]"
                          : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                    }`}
                  >
                    {isIn && (
                      <span className="absolute top-1.5 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#E8F5F0] text-[#0F6E56] border border-[#1D9E75]">
                        自動鎖定
                      </span>
                    )}
                    <div
                      className={`text-[18px] font-bold font-mono ${
                        isIn ? "text-[#0F6E56]" : "text-[#1A3A5C]"
                      }`}
                    >
                      {d.code}
                    </div>
                    <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{d.name}</div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 優先級選擇器（派工依此置頂）*/}
          <div>
            <div className="text-[12px] text-[#5A5955] mb-2">維修優先級</div>
            <div className="flex flex-wrap gap-2">
              {RO_PRIORITY_DEFS.map((d) => {
                const selected = priority === d.code;
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => setPriority(d.code)}
                    disabled={isPending}
                    className={`flex-1 min-w-[150px] text-left px-3 py-2.5 rounded-lg border-[1.5px] transition-colors ${
                      selected ? d.selected : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
                    }`}
                  >
                    <div className="text-[14px] font-bold text-[#2C2C2A]">
                      {d.emoji} {d.label}
                    </div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">{d.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 返工偵測橫幅：同車 30 天內有同類工單 → 可標記返工（P2 自動改免費 FR）*/}
          {reworkEligible && (
            <div className="rounded-lg px-4 py-3 bg-[#FDF3E3] border-[1.5px] border-[#F0C97E]">
              <div className="text-[12.5px] font-bold text-[#854F0B] mb-1">
                ⚠️ 偵測到返工可能：此車近 30 天內有 {sameTypeRecent.length} 張同類（{p1}）工單
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {sameTypeRecent.slice(0, 4).map((r) => (
                  <span
                    key={r.id}
                    className="bg-white border border-[#F0C97E] rounded px-2 py-0.5 text-[11px] font-mono text-[#854F0B]"
                  >
                    {r.ro_code} · {r.issue_date} · {r.status}
                  </span>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-[#854F0B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={markRework}
                  disabled={isPending}
                  onChange={(e) => toggleRework(e.target.checked)}
                  className="w-4 h-4 accent-[#854F0B]"
                />
                標記為返工 → 付款性質自動改「免費施工 FR」（本店吸收返工成本{reworkOriginal ? `，關聯原單 ${reworkOriginal.ro_code}` : ""}）
              </label>
            </div>
          )}

          {/* 組合結果 */}
          <div
            className={`rounded-lg px-4 py-3 text-[13px] font-medium border-[1.5px] ${
              isInvalid
                ? "bg-[#FDECEA] border-[#F5AEAD] text-[#CC0000]"
                : isWarning
                  ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]"
                  : isPDI
                    ? "bg-[#E8F5F0] border-[#1D9E75] text-[#085041]"
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

          {/* 保固過期阻擋：選 WC 但保固已失效 → 紅警示 + 主管授權才放行 */}
          {needWarrantyAuth && (
            <div className="rounded-lg px-4 py-3 bg-[#FDECEA] border-[1.5px] border-[#F5AEAD]">
              <div className="text-[12.5px] font-bold text-[#CC0000] mb-1">
                ⛔ 保固已過期 / 無效，無法直接開立保固索賠（WC）工單
              </div>
              <div className="text-[12px] text-[#CC0000] leading-relaxed mb-2">
                此車保固快照為「{draft.warranty.is_valid ? "有效" : "已過期 / 無"}」
                {draft.warranty.expires_at ? `（到期 ${draft.warranty.expires_at}）` : ""}。
                若仍要以保固索賠處理（例如原廠特案、延長保固），須<b>主管授權</b>後放行。
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#CC0000] font-medium">授權主管姓名 *</label>
                  <input
                    value={warrantyAuthName}
                    disabled={isPending}
                    onChange={(e) => setWarrantyAuthName(e.target.value)}
                    placeholder="例：王店長"
                    className="h-[30px] border border-[#F5AEAD] rounded px-2 text-[12.5px] bg-white focus:border-[#CC0000] focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#CC0000] font-medium">授權理由（選填）</label>
                  <input
                    value={warrantyAuthReason}
                    disabled={isPending}
                    onChange={(e) => setWarrantyAuthReason(e.target.value)}
                    placeholder="例：原廠特案延長保固 / 公報召回"
                    className="h-[30px] border border-[#F5AEAD] rounded px-2 text-[12.5px] bg-white focus:border-[#CC0000] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Confirm — PD 模式下按鈕轉綠（整車成本內部結算） */}
          <button
            type="button"
            onClick={confirm}
            disabled={isInvalid || isPending || warrantyBlocked}
            className={`w-full h-[52px] rounded-lg text-white text-[15px] font-semibold disabled:bg-[#D5D3CB] disabled:text-[#9A9890] disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${
              isPDI ? "bg-[#0F6E56] hover:bg-[#085041]" : "bg-[#1A3A5C] hover:bg-[#0F2A45]"
            }`}
          >
            {isPending
              ? "建立中⋯"
              : isInvalid
                ? "請先選擇正確組合"
                : warrantyBlocked
                  ? "需主管授權才能開立（請填授權主管）"
                  : `確認開立工單 ${previewCode} →`}
          </button>
          <div className="text-center text-[11px] text-[#9A9890]">
            {isPDI
              ? "確認後 PDI 工單狀態設為「進行中」、技師可開始作業；完工後費用自動計入整車成本（車主應付 NT$0）"
              : "確認後工單狀態設為「進行中」、預約狀態同步切「維修中」、技師可開始作業並打卡"}
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
