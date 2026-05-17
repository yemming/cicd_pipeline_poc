"use client";

/**
 * <CrmCustomerCard> — CRM 模組共用客戶卡片。
 *
 * 視覺：白卡 rounded-lg border、左側 4px traffic 色條（紅 / 黃 / 綠）、
 * 上方 name + code + chips、中間 fields 2 欄 KV grid、右側 actions、
 * 可展開時下方顯示 children。
 *
 * 用於 CRM01A 銷售客戶基盤、CRM01B 售後客戶基盤、CRM03A/B 電訪工作台、
 * CRM04A/B 休眠 / 流失管理 — 都是「一筆客戶/任務 + 多欄資訊 + 右側操作」
 * 的卡片型 list。
 *
 * 視覺對齊 DealerOS design tokens（CLAUDE.md §Design Pattern 字級階梯）。
 */

import type { ReactNode } from "react";

export type CrmCustomerCardTraffic = "red" | "amber" | "green";

export type CrmCustomerCardChip = {
  /** 唯一 key */
  key: string;
  /** 顯示文字（可含 emoji） */
  label: string;
  /** chip 顏色：5 種 accent + 預設 gray */
  color?: "red" | "amber" | "teal" | "blue" | "navy" | "gray";
};

export type CrmCustomerCardField = {
  /** label 11px 灰 */
  label: string;
  /** value 12.5px 主色（可含 emoji 或數字） */
  value: ReactNode;
  /** 選用：value 變色（warn 紅 / soon 黃 / ok 綠） */
  tone?: "default" | "warn" | "soon" | "ok";
};

export type CrmCustomerCardProps = {
  /** 左側 4px 色條 */
  traffic: CrmCustomerCardTraffic;
  /** 主名稱（13px font-semibold） */
  name: string;
  /** 客戶代碼 / 車牌（11.5px mono 次色） */
  code?: string;
  /** 主資訊區 KV pair list（grid 2 欄） */
  fields: CrmCustomerCardField[];
  /** 上方右靠齊 chip 列（標籤 / 來源 badge） */
  chips?: CrmCustomerCardChip[];
  /** 右側 actions 區（caller 自行渲染 button） */
  actions?: ReactNode;
  /** 是否處於展開狀態 */
  expanded?: boolean;
  /** 點 chevron 切換展開；不傳代表不可展開 */
  onToggle?: () => void;
  /** 展開後顯示的內容（caller 自由） */
  children?: ReactNode;
  /** note 一行 truncate（fields 下方、children 上方） */
  note?: string | null;
  /** 整張卡 disable（pending 時用） */
  disabled?: boolean;
  /** 點卡片任一處的 callback（不含 actions 區）— 用於開 drawer */
  onClick?: () => void;
};

const TRAFFIC_BG: Record<CrmCustomerCardTraffic, string> = {
  red: "bg-[#CC0000]",
  amber: "bg-[#D4820A]",
  green: "bg-[#0F6E56]",
};

const CHIP_CLS: Record<NonNullable<CrmCustomerCardChip["color"]>, string> = {
  red: "bg-[#FDECEA] text-[#CC0000]",
  amber: "bg-[#FDF3E3] text-[#854F0B]",
  teal: "bg-[#E8F5F0] text-[#0F6E56]",
  blue: "bg-[#EAF4FB] text-[#185FA5]",
  navy: "bg-[#EBF3FF] text-[#1A3A5C]",
  gray: "bg-[#F2F2F2] text-[#6B6A68]",
};

const TONE_CLS: Record<NonNullable<CrmCustomerCardField["tone"]>, string> = {
  default: "text-[#2C2C2A]",
  warn: "text-[#CC0000] font-medium",
  soon: "text-[#854F0B] font-medium",
  ok: "text-[#0F6E56] font-medium",
};

export function CrmCustomerCard({
  traffic,
  name,
  code,
  fields,
  chips,
  actions,
  expanded = false,
  onToggle,
  children,
  note,
  disabled = false,
  onClick,
}: CrmCustomerCardProps) {
  const isClickable = typeof onClick === "function" && !disabled;
  return (
    <article
      className={`relative bg-white border border-[#EEECE6] rounded-lg overflow-hidden flex ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className={`shrink-0 w-1 ${TRAFFIC_BG[traffic]}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <div
          className={`flex items-start gap-3 px-4 py-3 ${isClickable ? "cursor-pointer hover:bg-[#F8F7F4]" : ""}`}
          onClick={isClickable ? onClick : undefined}
          role={isClickable ? "button" : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onKeyDown={
            isClickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick?.();
                  }
                }
              : undefined
          }
        >
          {/* 主資訊區（flex:1） */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* 標題列：name + code + chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold text-[#2C2C2A] leading-tight">
                {name}
              </h3>
              {code ? (
                <span className="text-[11.5px] font-mono text-[#5A5955]">
                  {code}
                </span>
              ) : null}
              {chips && chips.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${CHIP_CLS[chip.color ?? "gray"]}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* fields grid 2 欄 */}
            {fields.length > 0 ? (
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                {fields.map((field, idx) => (
                  <div key={idx} className="flex items-baseline gap-2 min-w-0">
                    <dt className="text-[11px] text-[#9A9890] shrink-0">
                      {field.label}
                    </dt>
                    <dd
                      className={`text-[12.5px] truncate ${TONE_CLS[field.tone ?? "default"]}`}
                    >
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {/* note 一行 truncate */}
            {note ? (
              <p className="text-[11.5px] text-[#5A5955] truncate">📝 {note}</p>
            ) : null}
          </div>

          {/* 右側 actions（不被 onClick 觸發） */}
          {actions ? (
            <div
              className="shrink-0 flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}

          {/* 展開 chevron */}
          {onToggle ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label={expanded ? "收合" : "展開"}
              aria-expanded={expanded}
              className="shrink-0 w-6 h-6 rounded text-[#9A9890] hover:bg-[#F2F2F2] hover:text-[#2C2C2A] flex items-center justify-center"
            >
              <span
                className={`material-symbols-outlined text-[20px] leading-none transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden
              >
                expand_more
              </span>
            </button>
          ) : null}
        </div>

        {/* 展開內容區 */}
        {expanded && children ? (
          <div className="border-t border-[#EEECE6] bg-[#F8F7F4] px-4 py-3">
            {children}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default CrmCustomerCard;
