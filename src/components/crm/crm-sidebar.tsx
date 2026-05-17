"use client";

/**
 * <CrmSidebar> — CRM 模組共用左側側欄。
 *
 * 三層 group 結構：每組頂部 caption (text-[11px] uppercase 灰) + 下方
 * item list（active 深藍底白字、count badge 右靠齊）。最底層可選擇放
 * 「快速工具」連結（icon + label）。
 *
 * 視覺對齊 DealerOS design tokens（CLAUDE.md §Design Pattern）。
 * 純展示元件、由 caller 提供 onClick / active 狀態。
 */

import Link from "next/link";

export type CrmSidebarItem = {
  /** 唯一 key（caller 可用任意字串） */
  key: string;
  /** 顯示文字 */
  label: string;
  /** 右靠齊的數字徽章；undefined 不顯示 */
  count?: number;
  /** 是否為當前 active 項 */
  active?: boolean;
  /** 點擊時呼叫；不傳代表純展示 */
  onClick?: () => void;
  /** 選用：item 前綴的 material icon name（24px） */
  icon?: string;
};

export type CrmSidebarGroup = {
  /** 唯一 key（用於 React list key） */
  key: string;
  /** 組標題；undefined 代表不顯示 caption（少見） */
  title?: string;
  items: CrmSidebarItem[];
};

export type CrmSidebarQuickTool = {
  key: string;
  label: string;
  href: string;
  icon?: string;
};

export type CrmSidebarProps = {
  groups: CrmSidebarGroup[];
  quickTools?: CrmSidebarQuickTool[];
  /** 整體外層 className override（少用） */
  className?: string;
};

const itemBaseClass =
  "group flex items-center w-full text-left px-2.5 py-1.5 rounded text-[12.5px] transition-colors";
const itemActiveClass = "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]";
const itemIdleClass = "text-[#2C2C2A] hover:bg-[#F8F7F4]";

const countBadgeBase =
  "ml-auto inline-flex items-center justify-center min-w-[22px] h-[18px] px-1.5 rounded-full text-[11px] font-medium";
const countBadgeIdle = "bg-[#F2F2F2] text-[#5A5955]";
const countBadgeActive = "bg-white/20 text-white";

export function CrmSidebar({ groups, quickTools, className }: CrmSidebarProps) {
  return (
    <aside
      className={
        className ??
        "w-[240px] shrink-0 bg-white border border-[#EEECE6] rounded-lg p-3 flex flex-col gap-4"
      }
      aria-label="CRM 側欄"
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {group.title ? (
            <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#9A9890] uppercase">
              {group.title}
            </div>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const cls = `${itemBaseClass} ${item.active ? itemActiveClass : itemIdleClass}`;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={item.onClick}
                    disabled={!item.onClick}
                    aria-pressed={item.active ? true : undefined}
                    className={`${cls} disabled:cursor-default`}
                  >
                    {item.icon ? (
                      <span
                        className="material-symbols-outlined mr-1.5 text-[18px] leading-none"
                        aria-hidden
                      >
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{item.label}</span>
                    {typeof item.count === "number" ? (
                      <span
                        className={`${countBadgeBase} ${item.active ? countBadgeActive : countBadgeIdle}`}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {quickTools && quickTools.length > 0 ? (
        <div className="flex flex-col gap-1 mt-auto pt-3 border-t border-[#EEECE6]">
          <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-[#9A9890] uppercase">
            快速工具
          </div>
          <ul className="flex flex-col gap-0.5">
            {quickTools.map((tool) => (
              <li key={tool.key}>
                <Link
                  href={tool.href}
                  className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12.5px] text-[#185FA5] hover:bg-[#EAF4FB]"
                >
                  {tool.icon ? (
                    <span
                      className="material-symbols-outlined text-[18px] leading-none"
                      aria-hidden
                    >
                      {tool.icon}
                    </span>
                  ) : null}
                  <span className="truncate">{tool.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

export default CrmSidebar;
