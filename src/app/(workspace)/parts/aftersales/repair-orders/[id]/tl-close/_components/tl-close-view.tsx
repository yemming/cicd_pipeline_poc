"use client";

import { useTransition, useState } from "react";
import Link from "next/link";

import { closeTlWorkOrderAction } from "@/lib/aftersales/repair-order-actions";
import type { RepairOrderListRow } from "@/domain/repair-orders";
import type { RepairOrderLineWithStock } from "@/domain/repair-order-lines";
import { SignatureCanvas } from "@/components/signature-canvas";

/* ── 型別（與 repair-order-actions.ts 的 TlLineDecision/TlLineDisposition 保持同形，
        不從 "use server" 檔 import type，避免 Turbopack re-export 雷） ── */
type TlLineDecision =
  | "transfer_to_ro"
  | "return_to_stock"
  | "charge_customer"
  | "absorb_internally";

type TlLineDispositionLocal = {
  lineId: string;
  decision: TlLineDecision;
  targetRoId?: string | null;
  customerSignatureUrl?: string | null;
};

type LineState = {
  decision: TlLineDecision | "";
  targetRoId: string;
};

type BannerState =
  | { kind: "success"; msg: string }
  | { kind: "error"; msg: string }
  | null;

/* ── Props ── */
type Props = {
  ro: RepairOrderListRow;
  partLines: RepairOrderLineWithStock[];
  laborLines: RepairOrderLineWithStock[];
  canClose: boolean;
};

/* ── 金額格式 ── */
function fmtNT(n: number) {
  return `NT$ ${Math.round(n).toLocaleString("zh-TW")}`;
}

export function TlCloseView({ ro, partLines, laborLines, canClose }: Props) {
  const [isPending, startTransition] = useTransition();

  /* 每行的處置狀態：key = lineId */
  const [lineStates, setLineStates] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    [...partLines, ...laborLines].forEach((l) => {
      init[l.id] = { decision: "", targetRoId: "" };
    });
    return init;
  });

  /* 車主簽名（共用一份，任何向車主收費行都用同一張簽名） */
  const [customerSignatureUrl, setCustomerSignatureUrl] = useState<string | null>(null);

  /* 結案成功後顯示已關單 badge */
  const [closed, setClosed] = useState(false);

  /* Banner */
  const [banner, setBanner] = useState<BannerState>(null);

  /* 前端欄位計算：是否有任何「向車主收費」行 */
  const hasChargeCustomer = Object.values(lineStates).some((s) => s.decision === "charge_customer");

  /* 結案摘要統計 */
  const allLines = [...partLines, ...laborLines];
  const transferCount = allLines.filter((l) => lineStates[l.id]?.decision === "transfer_to_ro").length;
  const returnCount = allLines.filter((l) => lineStates[l.id]?.decision === "return_to_stock").length;
  const chargeCount = allLines.filter((l) => lineStates[l.id]?.decision === "charge_customer").length;
  const absorbCount = allLines.filter((l) => lineStates[l.id]?.decision === "absorb_internally").length;

  /* 設定單一行的處置 */
  function setDecision(lineId: string, decision: TlLineDecision) {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], decision },
    }));
  }

  function setTargetRo(lineId: string, val: string) {
    setLineStates((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], targetRoId: val },
    }));
  }

  /* 前端驗證 */
  function validate(): string | null {
    for (const l of allLines) {
      if (!lineStates[l.id]?.decision) {
        const name = l.kind === "labor" ? (l.labor_name ?? "工時行") : (l.part_name ?? "零件行");
        return `請為每行選擇處置方式（第 ${l.line_no} 行「${name}」尚未選擇）`;
      }
      if (
        lineStates[l.id]?.decision === "transfer_to_ro" &&
        !lineStates[l.id]?.targetRoId?.trim()
      ) {
        const name = l.kind === "labor" ? (l.labor_name ?? "工時行") : (l.part_name ?? "零件行");
        return `第 ${l.line_no} 行「${name}」選擇轉入正式工單，請輸入目標工單號`;
      }
    }
    if (hasChargeCustomer && !customerSignatureUrl) {
      return "向車主收費必須補充車主簽名";
    }
    return null;
  }

  function handleConfirm() {
    const err = validate();
    if (err) {
      setBanner({ kind: "error", msg: err });
      return;
    }

    const dispositions: TlLineDispositionLocal[] = allLines.map((l) => {
      const state = lineStates[l.id];
      return {
        lineId: l.id,
        decision: state.decision as TlLineDecision,
        targetRoId:
          state.decision === "transfer_to_ro" ? (state.targetRoId?.trim() || null) : null,
        customerSignatureUrl:
          state.decision === "charge_customer" ? customerSignatureUrl : null,
      };
    });

    startTransition(async () => {
      const result = await closeTlWorkOrderAction(ro.id, dispositions);
      if (result.ok) {
        setClosed(true);
        setBanner({ kind: "success", msg: "TL 工單已成功結案。" });
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ kind: "error", msg: result.error });
      }
    });
  }

  /* ── TL config 從 metadata 取 ── */
  const tlConfig = (ro.metadata?.tl_config ?? {}) as Record<string, unknown>;
  const loanPurpose = typeof tlConfig.loan_purpose === "string" ? tlConfig.loan_purpose : "（未填寫）";
  const dueBy = typeof tlConfig.due_by === "string" ? tlConfig.due_by : null;

  /* ── Radio 樣式 ── */
  const radioLabelBase =
    "flex items-center gap-1.5 cursor-pointer text-[12px] text-[#5A5955] hover:text-[#2C2C2A] select-none";

  /* ── 零件行 radio 選項 ── */
  const partDecisionOptions: { value: TlLineDecision; label: string }[] = [
    { value: "transfer_to_ro", label: "轉入正式工單" },
    { value: "return_to_stock", label: "退料歸還" },
    { value: "charge_customer", label: "向車主收費" },
    { value: "absorb_internally", label: "門店吸收" },
  ];

  /* ── 工時行 radio 選項 ── */
  const laborDecisionOptions: { value: TlLineDecision; label: string }[] = [
    { value: "absorb_internally", label: "門店吸收" },
    { value: "charge_customer", label: "向車主收費" },
    { value: "transfer_to_ro", label: "轉入正式工單（可選）" },
  ];

  const isBusy = isPending || closed;

  return (
    <main
      className={`px-6 py-5 space-y-4 ${isBusy ? "pointer-events-none opacity-60" : ""}`}
      data-testid="tl-close-form"
    >
      {/* ── 麵包屑 ── */}
      <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
        <Link href="/parts/aftersales/repair-orders" className="hover:text-[#185FA5]">
          工單管理
        </Link>
        <span>›</span>
        <Link
          href={`/parts/aftersales/repair-orders/${ro.id}`}
          className="hover:text-[#185FA5] font-mono"
        >
          {ro.ro_code}
        </Link>
        <span>›</span>
        <span className="text-[#5A5955]">借用測試結案</span>
      </div>

      {/* ── 頁面標題 ── */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">TL 工單結案</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {ro.ro_code}
        </span>
        {closed && (
          <span
            className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF3DE] text-[#3B6D11] font-medium"
            data-testid="tl-ro-closed-badge"
          >
            已關單
          </span>
        )}
      </header>

      {/* ── 工單資訊卡 ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
          <div>
            <div className="text-[11px] text-[#9A9890]">工單號</div>
            <div className="text-[12.5px] font-mono font-semibold text-[#1A3A5C]">{ro.ro_code}</div>
          </div>
          <div>
            <div className="text-[11px] text-[#9A9890]">借出目的</div>
            <div className="text-[12.5px] text-[#2C2C2A]">{loanPurpose}</div>
          </div>
          {dueBy && (
            <div>
              <div className="text-[11px] text-[#9A9890]">預計歸還日</div>
              <div className="text-[12.5px] text-[#2C2C2A]">{dueBy}</div>
            </div>
          )}
          <div>
            <div className="text-[11px] text-[#9A9890]">狀態</div>
            <div className="text-[12.5px] text-[#2C2C2A]">{ro.status}</div>
          </div>
        </div>
      </section>

      {/* ── 零件明細區 ── */}
      {partLines.length > 0 && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 零件明細（請逐行選擇處置）</span>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {partLines.map((line, idx) => {
              const state = lineStates[line.id] ?? { decision: "", targetRoId: "" };
              return (
                <div key={line.id} className="px-4 py-3 space-y-2">
                  {/* 行描述 */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#9A9890] font-mono w-5 text-right shrink-0">
                        {line.line_no}
                      </span>
                      <div>
                        <div className="text-[12.5px] font-medium text-[#2C2C2A]">
                          {line.part_name ?? "（未命名零件）"}
                        </div>
                        {line.part_code && (
                          <div className="text-[11px] text-[#9A9890] font-mono">{line.part_code}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12px] text-[#5A5955]">
                        x {line.qty ?? 1} × {fmtNT(line.unit_price)}
                      </div>
                      <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                        {fmtNT(line.amount)}
                      </div>
                    </div>
                  </div>

                  {/* Radio 處置選項 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-7">
                    {partDecisionOptions.map(({ value, label }) => (
                      <label key={value} className={radioLabelBase}>
                        <input
                          type="radio"
                          name={`part-line-${idx}`}
                          value={value}
                          checked={state.decision === value}
                          onChange={() => setDecision(line.id, value)}
                          disabled={isBusy}
                          data-testid={
                            value === "transfer_to_ro"
                              ? `line-${idx}-transfer-to-ro`
                              : value === "return_to_stock"
                              ? `line-${idx}-return-to-stock`
                              : value === "charge_customer"
                              ? `line-${idx}-charge-customer`
                              : `line-${idx}-absorb`
                          }
                          className="accent-[#1A3A5C]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  {/* 轉入正式工單：目標工單 input */}
                  {state.decision === "transfer_to_ro" && (
                    <div className="pl-7">
                      <input
                        type="text"
                        placeholder="請輸入目標工單號（ro_code 或 id）"
                        value={state.targetRoId}
                        onChange={(e) => setTargetRo(line.id, e.target.value)}
                        disabled={isBusy}
                        data-testid={`line-${idx}-target-ro-input`}
                        className="h-[30px] w-full max-w-xs border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 工時明細區 ── */}
      {laborLines.length > 0 && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 工時明細（請逐行選擇處置）</span>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {laborLines.map((line, idx) => {
              const state = lineStates[line.id] ?? { decision: "", targetRoId: "" };
              return (
                <div key={line.id} className="px-4 py-3 space-y-2">
                  {/* 行描述 */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#9A9890] font-mono w-5 text-right shrink-0">
                        {line.line_no}
                      </span>
                      <div>
                        <div className="text-[12.5px] font-medium text-[#2C2C2A]">
                          {line.labor_name ?? "（未命名工時）"}
                        </div>
                        {line.labor_units != null && (
                          <div className="text-[11px] text-[#9A9890]">
                            {line.labor_units} LU
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                        {fmtNT(line.amount)}
                      </div>
                    </div>
                  </div>

                  {/* Radio 處置選項 */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-7">
                    {laborDecisionOptions.map(({ value, label }) => (
                      <label key={value} className={radioLabelBase}>
                        <input
                          type="radio"
                          name={`labor-line-${idx}`}
                          value={value}
                          checked={state.decision === value}
                          onChange={() => setDecision(line.id, value)}
                          disabled={isBusy}
                          data-testid={
                            value === "absorb_internally"
                              ? `labor-${idx}-absorb`
                              : value === "charge_customer"
                              ? `labor-${idx}-charge-customer`
                              : `labor-${idx}-transfer-to-ro`
                          }
                          className="accent-[#1A3A5C]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  {/* 轉入正式工單：目標工單 input（工時行也支援） */}
                  {state.decision === "transfer_to_ro" && (
                    <div className="pl-7">
                      <input
                        type="text"
                        placeholder="請輸入目標工單號（ro_code 或 id）"
                        value={state.targetRoId}
                        onChange={(e) => setTargetRo(line.id, e.target.value)}
                        disabled={isBusy}
                        data-testid={`labor-${idx}-target-ro-input`}
                        className="h-[30px] w-full max-w-xs border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 車主簽名（任一行選向車主收費時出現） ── */}
      {hasChargeCustomer && (
        <section
          className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
          data-testid="customer-signature-canvas"
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FDF3E3]">
            <span className="text-[13px] font-semibold text-[#854F0B]">
              ▼ 車主簽名（向車主收費必填）
            </span>
          </header>
          <div className="px-4 py-4">
            {customerSignatureUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#3B6D11] font-medium">✓ 已完成簽名</span>
                  <button
                    onClick={() => setCustomerSignatureUrl(null)}
                    className="text-[11.5px] text-[#9A9890] hover:text-[#5A5955] underline"
                  >
                    重新簽名
                  </button>
                </div>
                {/* 簽名預覽 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={customerSignatureUrl}
                  alt="車主簽名預覽"
                  className="border border-[#D5D3CB] rounded max-h-[100px] object-contain"
                />
              </div>
            ) : (
              <SignatureCanvas onSigned={(dataUrl) => setCustomerSignatureUrl(dataUrl)} />
            )}
          </div>
        </section>
      )}

      {/* ── 結案摘要預覽 ── */}
      <section
        className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
        data-testid="tl-close-summary"
      >
        <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">結案處置摘要</div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[#5A5955]">
          <span>
            轉入正式工單：<b className="text-[#1A3A5C]">{transferCount}</b> 筆
          </span>
          <span>
            退料歸還：<b className="text-[#1A3A5C]">{returnCount}</b> 筆
          </span>
          <span>
            向車主收費：<b className="text-[#1A3A5C]">{chargeCount}</b> 筆
          </span>
          <span>
            門店吸收：<b className="text-[#1A3A5C]">{absorbCount}</b> 筆
          </span>
          <span className="text-[#9A9890]">
            （共 {allLines.length} 行，已選 {transferCount + returnCount + chargeCount + absorbCount} 行）
          </span>
        </div>
      </section>

      {/* ── 車主簽名必填提示（前端阻擋） ── */}
      {hasChargeCustomer && !customerSignatureUrl && banner?.kind === "error" && (
        <div
          className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] rounded-lg px-4 py-2.5 text-[12.5px]"
          data-testid="customer-signature-required"
        >
          向車主收費必須補充車主簽名，請在上方簽名區完成簽名後再確認結案。
        </div>
      )}

      {/* ── 確認結案按鈕 ── */}
      {!closed && canClose && (
        <div className="flex justify-end">
          <button
            onClick={handleConfirm}
            disabled={isBusy}
            data-testid="confirm-tl-close-btn"
            className="h-[36px] px-6 rounded text-[13px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isPending ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                結案中⋯
              </>
            ) : (
              "確認結案"
            )}
          </button>
        </div>
      )}

      {/* ── 無結案權限提示 ── */}
      {!canClose && !closed && (
        <div className="text-[12px] text-[#9A9890]">（您的角色無法執行結案，請聯絡主管）</div>
      )}

      {/* ── Banner ── */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.kind === "success"
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
