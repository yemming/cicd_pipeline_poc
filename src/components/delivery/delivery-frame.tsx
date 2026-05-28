"use client";

/**
 * DeliveryFrame — RS05 交車管理 6 step 共用 shell
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS05_交車管理_v1.html
 *
 * 結構（自上而下）：
 *   1. Page header（標題 + sprint chip + caption）
 *   2. Step bar（6 個 step，active / done / pending）
 *   3. Info card（深藍底，客戶 + 車輛 + 合約 + RS 資訊）
 *   4. children — 該 step 的具體內容
 *   5. Footer 動作列（← 上一步 / 下一步 →）
 *
 * 資料：吃 server 載入的真實 `delivery` row（deliveries 表）；info card 與 step bar
 * 進度都讀它。已退役舊的 client mock store。各 step 的「下一步」由 view 透過
 * updateDeliveryStepAction 寫 DB 後推進。
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import type { DeliveryRow } from "@/lib/deliveries";
// 已退役 mock：DeliveryFrame 不再依賴 delivery-store / DemoBanner，改吃 delivery prop
import type { DeliveryStepName } from "@/lib/deliveries.constants";
import { DELIVERY_STEPS } from "./delivery-constants";

/** step id（1-6）→ deliveries.step_completion 的 key */
const STEP_KEY: Record<number, DeliveryStepName> = {
  1: "confirm1",
  2: "pdi",
  3: "accessories",
  4: "confirm2",
  5: "warranty",
  6: "ceremony",
};

export type DeliveryFrameProps = {
  stepId: 1 | 2 | 3 | 4 | 5 | 6;
  /** 真實交車單（取代舊 mock store）— info card / step bar 進度都讀它 */
  delivery: DeliveryRow;
  children: ReactNode;
  /** 該 step 是否已完成（影響 step bar 「done」狀態） */
  stepDone?: boolean;
  /** 下一步按鈕文字；不傳則用預設 */
  nextLabel?: string;
  /** 下一步 disabled 條件 */
  nextDisabled?: boolean;
  /** 下一步覆寫導向（預設下一個 step）；若回傳 false 表示要 prevent */
  onNext?: () => boolean | void | Promise<boolean | void>;
};

const STEP_TITLES: Record<number, { title: string; caption: string }> = {
  1: { title: "訂單覆核", caption: "交車前資料核對 · 確認客戶與車輛資訊正確" },
  2: { title: "PDI 完成確認", caption: "確認本車到港時的 PDI 整備已完成（29 項）· 交車前不再建立工單" },
  3: { title: "PDI 配件安裝", caption: "依客戶訂單安裝 Ducati Performance 配件並確認操作正常" },
  4: { title: "客戶交車確認表", caption: "DUCATI Check List — BIKE DELIVERY TO CUSTOMER · 36 項點交" },
  5: { title: "保固條款簽署", caption: "DUCATI Warranty Terms — 交車登記表 · 三方簽署" },
  6: { title: "完成交車 · 觸發 D+3", caption: "完成交車程序 · 自動觸發 CRM03A 滿意度回訪任務" },
};

export function DeliveryFrame({
  stepId,
  delivery,
  children,
  stepDone,
  nextLabel,
  nextDisabled,
  onNext,
}: DeliveryFrameProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deliveryId = searchParams.get("deliveryId") ?? delivery.id;
  const meta = STEP_TITLES[stepId];
  const sprint = DELIVERY_STEPS.find((s) => s.id === stepId)?.sprint ?? "";

  useSetPageHeader({
    title: meta.title,
    breadcrumb: [
      { label: "交車管理", href: "/sales/delivery" },
      { label: meta.title },
    ],
  });

  const prev = DELIVERY_STEPS.find((s) => s.id === stepId - 1);
  const next = DELIVERY_STEPS.find((s) => s.id === stepId + 1);
  const [isPending, startTransition] = useTransition();

  // 若有 deliveryId，導航時帶上 query param
  function stepHref(href: string) {
    if (!deliveryId) return href;
    return `${href}?deliveryId=${deliveryId}`;
  }

  const handleNext = () => {
    if (nextDisabled || isPending) return;
    startTransition(async () => {
      if (onNext) {
        const r = await onNext();
        if (r === false) return;
      }
      if (next) router.push(stepHref(next.href));
    });
  };

  // 滾到頂（切 step 時）
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepId]);

  return (
    <main className="px-6 py-5 space-y-3" data-testid={`delivery-frame-step-${stepId}`}>
      {/* Page header */}
      <header className="flex items-center gap-2.5" data-testid="delivery-page-header">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          交車管理 — {meta.title}
        </h1>
        <span
          className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
          data-testid="delivery-sprint-chip"
        >
          {sprint}
        </span>
        <span className="text-[12px] text-[#9A9890]">{meta.caption}</span>
      </header>

      {/* Step bar */}
      <nav
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden flex"
        data-testid="delivery-step-bar"
      >
        {DELIVERY_STEPS.map((s, i) => {
          const isActive = s.id === stepId;
          // done 判定：來自真實交車單的 step_completion（或已交車則全完成）
          const done =
            delivery.status === "delivered" ||
            Boolean(delivery.step_completion?.[STEP_KEY[s.id]]);
          return (
            <Link
              key={s.id}
              href={stepHref(s.href)}
              data-testid={`delivery-step-link-${s.id}`}
              className={`flex-1 px-2 py-2.5 text-center text-[11.5px] font-medium transition-colors ${
                i < DELIVERY_STEPS.length - 1
                  ? "border-r border-[#EEECE6]"
                  : ""
              } ${
                isActive
                  ? "bg-[#1A3A5C] text-white font-semibold"
                  : done
                    ? "bg-[#E1F5EE] text-[#0F6E56] font-semibold"
                    : "text-[#9A9890] hover:bg-[#F8F7F4]"
              }`}
            >
              <span className="block text-[10px] font-mono opacity-70 mb-0.5">
                {s.num}
              </span>
              {s.label}
            </Link>
          );
        })}
      </nav>

      {/* Info card */}
      <section
        className="bg-[#1A3A5C] rounded-lg px-5 py-3 text-white flex flex-wrap items-center gap-x-5 gap-y-2"
        data-testid="delivery-info-card"
      >
        <InfoItem label="客戶姓名" value={delivery.customer_name ?? ""} />
        <Div />
        <InfoItem label="訂購車款" value={delivery.vehicle_model_name ?? ""} />
        <Div />
        <InfoItem label="車身顏色" value={delivery.vehicle_color ?? ""} />
        <Div />
        <InfoItem
          label="交車單號"
          value={delivery.delivery_no}
          mono
          testId="delivery-info-contract"
        />
        <Div />
        <InfoItem label="銷售顧問" value={delivery.rs_name ?? ""} />
        <Div />
        <InfoItem label="預定交車日" value={delivery.scheduled_delivery_date ?? ""} />
      </section>

      <div className="space-y-3">{children}</div>

      {/* 下方動作列 */}
      <div
        className="flex flex-wrap justify-end gap-2 pt-1"
        data-testid="delivery-frame-actions"
      >
        {prev && (
          <Link
            href={stepHref(prev.href)}
            data-testid="delivery-prev-btn"
            className="h-[30px] inline-flex items-center px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            ← {prev.label}
          </Link>
        )}
        {next && (
          <button
            type="button"
            data-testid="delivery-next-btn"
            disabled={nextDisabled || isPending}
            onClick={handleNext}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending
              ? "儲存中⋯"
              : (nextLabel ?? `${stepDone ? "完成" : "進入"} ${next.label} →`)}
          </button>
        )}
      </div>
    </main>
  );
}

function InfoItem({
  label,
  value,
  mono,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  testId?: string;
}) {
  return (
    <div className="text-center min-w-[80px]" data-testid={testId}>
      <div className="text-[10px] opacity-60 mb-0.5">{label}</div>
      <div
        className={`text-[13px] font-semibold ${
          mono ? "font-mono text-[12px]" : ""
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function Div() {
  return <span className="w-px h-7 bg-white/20 shrink-0" />;
}
