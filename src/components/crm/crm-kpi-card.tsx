"use client";

/**
 * <CrmKpiCard> — CRM 模組共用 KPI 卡片（5 種 accent 色）。
 *
 * 視覺：白卡 rounded-lg border、左側 36×36 圓形 icon（accent 底色 + 白字
 * material icon）、右側 label / value / sub 堆疊。可選 `onClick` 變成可點
 * 快篩按鈕，按下加 active 邊框 + aria-pressed。
 *
 * accent 對映 design tokens（CLAUDE.md §Design Pattern）：
 *   navy  #1A3A5C  — 主操作 / 預設
 *   amber #854F0B  — 警告 / 即將到期
 *   red   #CC0000  — 危險 / 已逾期
 *   teal  #0F6E56  — 成功 / 已完成
 *   blue  #185FA5  — 資訊 / RS05 同步
 */

export type CrmKpiAccent = "navy" | "amber" | "red" | "teal" | "blue";

export type CrmKpiCardProps = {
  /** material icon name（顯示在左側圓形 icon 內） */
  icon: string;
  /** 卡片標題（11px 灰） */
  label: string;
  /** 主數值（22px 主色），可給字串以支援 "—" / 百分比格式 */
  value: string | number;
  /** 副標（11.5px 次色），單行 truncate */
  sub?: string;
  /** 配色（預設 navy） */
  accent?: CrmKpiAccent;
  /** 點擊整張卡片（可當快篩按鈕用） */
  onClick?: () => void;
  /** active 狀態：邊框加粗 + 同色、ARIA pressed */
  active?: boolean;
  /** disable 點擊 */
  disabled?: boolean;
};

const ACCENT_BG: Record<CrmKpiAccent, string> = {
  navy: "bg-[#1A3A5C]",
  amber: "bg-[#854F0B]",
  red: "bg-[#CC0000]",
  teal: "bg-[#0F6E56]",
  blue: "bg-[#185FA5]",
};

const ACCENT_BORDER: Record<CrmKpiAccent, string> = {
  navy: "border-[#1A3A5C]",
  amber: "border-[#854F0B]",
  red: "border-[#CC0000]",
  teal: "border-[#0F6E56]",
  blue: "border-[#185FA5]",
};

const ACCENT_BORDER_LEFT: Record<CrmKpiAccent, string> = {
  navy: "border-l-[#1A3A5C]",
  amber: "border-l-[#854F0B]",
  red: "border-l-[#CC0000]",
  teal: "border-l-[#0F6E56]",
  blue: "border-l-[#185FA5]",
};

export function CrmKpiCard({
  icon,
  label,
  value,
  sub,
  accent = "navy",
  onClick,
  active = false,
  disabled = false,
}: CrmKpiCardProps) {
  const isInteractive = typeof onClick === "function" && !disabled;
  const baseCls = [
    "flex items-center gap-3 bg-white rounded-lg p-3 border-l-4",
    ACCENT_BORDER_LEFT[accent],
    "border-y border-r",
    active ? `${ACCENT_BORDER[accent]} border-y-2 border-r-2` : "border-[#EEECE6]",
    isInteractive ? "cursor-pointer hover:bg-[#F8F7F4] transition-colors" : "",
    disabled ? "opacity-60 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div
        className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white ${ACCENT_BG[accent]}`}
        aria-hidden
      >
        <span className="material-symbols-outlined text-[20px] leading-none">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[#9A9890] truncate">{label}</div>
        <div className="text-[22px] font-semibold text-[#2C2C2A] leading-tight">
          {value}
        </div>
        {sub ? (
          <div className="text-[11.5px] text-[#5A5955] truncate">{sub}</div>
        ) : null}
      </div>
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        className={`${baseCls} text-left w-full`}
      >
        {content}
      </button>
    );
  }
  return <div className={baseCls}>{content}</div>;
}

export default CrmKpiCard;
