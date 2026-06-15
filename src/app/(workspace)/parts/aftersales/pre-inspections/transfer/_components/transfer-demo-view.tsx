"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

/**
 * Transfer Overlay Demo View
 * 對應 04_預檢單_RO串接_v3.html `.transfer-overlay`（line 564–573）
 * + showTransfer() 動態 summary 7 欄（line 1309–1326）
 *
 * Mock data 來自 demo HTML：車主 鄭宗勳 / 車型 Diavel V4 / VIN ZDM1XXX...
 */

const MOCK_SUMMARY: Array<{ label: string; value: string; tone?: "amber" | "red" | "mono" }> = [
  { label: "車主姓名", value: "鄭宗勳" },
  { label: "車型", value: "Diavel V4 (2024)" },
  { label: "VIN 碼", value: "ZDM1ABCDEF1234567", tone: "mono" },
  { label: "來廠目的", value: "定期保養、剎車異音" },
  { label: "SA 報價項目", value: "5 項（1 項已刪除）" },
  { label: "技師同意增項", value: "2 項" },
  { label: "暫緩/拒絕項目", value: "1 項（建立增項閉環）", tone: "amber" },
  { label: "預估總費用", value: "NT$24,650", tone: "red" },
];

const PROPOSAL_BULLETS: Array<{ title: string; body: string }> = [
  {
    title: "本頁定位",
    body: "預檢單（PI）→ 正式工單（RO）的 transfer 契約 + 一張 audit 表 pi_ro_transfers。不是獨立 route，是 PI wizard Tab 5 的 inline overlay；本頁為 demo 預覽，等 PI/RO 主場落地後 overlay 會嵌進去。",
  },
  {
    title: "資料快照策略",
    body: "凡是構成「合約內容」的欄位都要值傳遞快照（mileage_in / warranty_snapshot / quote_items / lu_rate）；凡是「人/車的識別資訊」走 reference（customer_id / vehicle_id）。雙重快照：repair_orders 端（合約 SSOT、可被追加擾動）+ pi_ro_transfers.snapshot（append-only event log、永不變）。",
  },
  {
    title: "副作用（atomic 跨表事務）",
    body: "INSERT pi_ro_transfers → INSERT repair_orders（advisory_lock 算流水號）→ INSERT ro_lines × N → UPDATE pre_inspections.linked_ro_id → UPDATE appointments.metadata.linked_ro_id → INSERT loop_cases × M（deferred 項）→ after() 推 LINE。任一步失敗整段 rollback。",
  },
  {
    title: "流程閘門",
    body: "PI status = confirmed、SA + 車主雙簽完成、quote_items ≥ 1、無未決 tech_findings、該 PI 沒既存 confirmed transfer（partial unique index 把關）、p1/p2 前綴合法、操作者有 aftersales.ro.create 權限。",
  },
];

export function TransferDemoView() {
  useSetPageHeader({
    title: "預檢單轉 RO（Transfer Overlay）",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "預檢單轉 RO" },
    ],
    hideSearch: true,
  });

  const [open, setOpen] = useState(true);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 醒目 DEMO 橫幅（admin 才看得到此頁，SA 已被擋在 server component） */}
      <div className="bg-[#CC0000] text-white px-4 py-2.5 rounded-lg flex items-center gap-3">
        <span className="text-[13px] font-bold tracking-wider">⚠ DEMO 頁面</span>
        <span className="text-[12px] opacity-90">
          此頁含 mock 假資料，僅限系統管理員（admin）存取・SA 帳號已被擋在入口外。
          正式轉 RO 流程請在預檢單詳情頁 Tab 5 操作。
        </span>
      </div>

      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">預檢單 → RO 串接 Demo</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Aftersales · 04
        </span>
        <span className="text-[12px] text-[#9A9890]">
          PI Tab 5 inline overlay 預覽（mock 資料）
        </span>
      </header>

      {/* Banner — demo 性質提醒 */}
      <div className="bg-[#FDF3E3] border border-[#E8C682] rounded-lg px-4 py-2.5 text-[12.5px] text-[#854F0B]">
        <strong>Demo only：</strong>
        本頁為 transfer overlay 視覺預覽，未連 DB、未建 server action。
        正式落地時會嵌進 <code className="px-1 py-0.5 bg-white/60 rounded text-[11.5px] font-mono">/parts/aftersales/pre-inspections/[id]</code>{" "}
        wizard 的 Tab 5，搭配 <code className="px-1 py-0.5 bg-white/60 rounded text-[11.5px] font-mono">src/domain/pi-ro-transfer.ts</code> helper。
      </div>

      {/* 主預覽區 — 兩欄：左 demo trigger / 右 proposal 摘要 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 左：trigger card */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ Overlay 觸發</span>
          </header>
          <div className="px-4 py-4 space-y-3">
            <div className="text-[12px] text-[#5A5955] leading-relaxed">
              在 PI wizard Tab 5（雙簽完成）按下{" "}
              <span className="font-semibold text-[#CC0000]">「確認並轉入正式工單 RO →」</span>{" "}
              時，會跑 <code className="text-[11.5px] font-mono">verifyTransferEligibility()</code>{" "}
              → 通過後彈出此 overlay。
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            >
              再次顯示 Overlay
            </button>
          </div>
        </section>

        {/* 中右：proposal 摘要 — 跨 2 欄 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden lg:col-span-2">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ Phase 1 Proposal 摘要</span>
            <span className="text-[11px] text-[#9A9890] font-mono">
              feature-aftersales-precheck-ro-phase1.md
            </span>
          </header>
          <div className="px-4 py-3 space-y-2.5">
            {PROPOSAL_BULLETS.map((b) => (
              <div key={b.title} className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <div className="text-[11.5px] font-semibold text-[#185FA5] pt-0.5">
                  {b.title}
                </div>
                <div className="text-[12px] text-[#2C2C2A] leading-relaxed">{b.body}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Overlay — 重現 .transfer-overlay 視覺 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-title"
        >
          <div className="bg-white rounded-2xl p-7 max-w-[480px] w-full shadow-2xl">
            <div id="transfer-title" className="text-[18px] font-bold text-[#2C2C2A] mb-2">
              ✅ 預檢單確認完成
            </div>
            <p className="text-[12.5px] text-[#5A5955] mb-5 leading-relaxed">
              以下資料將自動帶入正式工單(RO)。
              <br />
              車主尚需在 RO 上完成
              <strong className="text-[#1A3A5C]"> 第二次簽名</strong>
              （整體服務授權），方可正式開工。
            </p>

            <div className="bg-[#F8F7F4] rounded-lg px-3 py-2 mb-5">
              {MOCK_SUMMARY.map((row, idx) => (
                <div
                  key={row.label}
                  className={`flex justify-between items-center text-[12px] py-1 ${
                    idx === MOCK_SUMMARY.length - 1
                      ? "font-semibold pt-2 border-t border-[#EEECE6] mt-1"
                      : "border-b border-[#EEECE6] last:border-b-0"
                  }`}
                >
                  <span className="text-[#5A5955]">{row.label}</span>
                  <span
                    className={
                      row.tone === "amber"
                        ? "text-[#854F0B]"
                        : row.tone === "red"
                          ? "text-[#CC0000] text-[14px] font-bold"
                          : row.tone === "mono"
                            ? "font-mono text-[11px] text-[#2C2C2A]"
                            : "text-[#2C2C2A]"
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 h-[40px] rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                返回修改
              </button>
              <button
                type="button"
                disabled
                title="Demo 不接 server action;正式落地接 confirmTransferToRO()"
                className="flex-[2] h-[40px] rounded text-[13px] font-semibold bg-[#1A3A5C] text-white opacity-60 cursor-not-allowed"
              >
                確認　開立正式工單 RO →
              </button>
            </div>

            <div className="mt-3 text-[10.5px] text-[#9A9890] text-center">
              Demo 模式 · 確認 button 已禁用，正式版會跑{" "}
              <code className="font-mono">confirmTransferToRO()</code> atomic transaction
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
