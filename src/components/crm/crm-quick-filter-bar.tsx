"use client";

/**
 * <CrmQuickFilterBar> — CRM 模組共用快篩 chip 列。
 *
 * 視覺：橫列 pill button（h-[28px] px-3 rounded-full text-[12px]）、
 * active 深藍底白字、inactive 白底灰邊；可選右靠齊「⚙ 管理篩選」button。
 * 適合放在 KPI 列下方、列表 / 卡片上方。
 *
 * 元件純展示、由 caller 提供 onClick + active 狀態（搭配 URL searchParams
 * 自管 state）。
 */

export type CrmQuickFilterChip = {
  /** 唯一 key（也是 caller 識別用） */
  key: string;
  /** 顯示文字（可含 emoji） */
  label: string;
  /** 右側括號內的數字；undefined 不顯示 */
  count?: number;
  /** 是否為當前 active */
  active?: boolean;
  /** 點擊時呼叫；不傳代表純展示 */
  onClick?: () => void;
};

export type CrmQuickFilterBarProps = {
  chips: CrmQuickFilterChip[];
  /** 右側「⚙ 管理篩選」按鈕的 callback；不傳代表不顯示 */
  onManage?: () => void;
  /** 整列 disable（pending 時用） */
  disabled?: boolean;
  /** 外層 className override */
  className?: string;
};

const chipBase =
  "inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[12px] transition-colors whitespace-nowrap";
const chipActive =
  "bg-[#1A3A5C] text-white border border-[#1A3A5C] hover:bg-[#0F2A45]";
const chipIdle =
  "bg-white text-[#5A5955] border border-[#D5D3CB] hover:border-[#9A9890] hover:bg-[#F8F7F4]";
const chipCountActive =
  "inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-white/20 text-white text-[10.5px] font-medium";
const chipCountIdle =
  "inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full bg-[#F2F2F2] text-[#5A5955] text-[10.5px] font-medium";

export function CrmQuickFilterBar({
  chips,
  onManage,
  disabled = false,
  className,
}: CrmQuickFilterBarProps) {
  return (
    <div
      className={
        className ??
        `flex items-center gap-1.5 flex-wrap ${disabled ? "opacity-60 pointer-events-none" : ""}`
      }
      role="toolbar"
      aria-label="快篩條件"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onClick}
          disabled={!chip.onClick}
          aria-pressed={chip.active ? true : undefined}
          className={`${chipBase} ${chip.active ? chipActive : chipIdle} disabled:cursor-default`}
        >
          <span>{chip.label}</span>
          {typeof chip.count === "number" ? (
            <span className={chip.active ? chipCountActive : chipCountIdle}>
              {chip.count}
            </span>
          ) : null}
        </button>
      ))}
      {onManage ? (
        <button
          type="button"
          onClick={onManage}
          disabled={disabled}
          className="ml-auto inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full text-[12px] text-[#5A5955] bg-white border border-dashed border-[#9A9890] hover:border-[#185FA5] hover:text-[#185FA5] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden>
            settings
          </span>
          管理篩選
        </button>
      ) : null}
    </div>
  );
}

export default CrmQuickFilterBar;
