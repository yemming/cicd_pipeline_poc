"use client";

/**
 * Modern shell 的一級導航項目 — 對應新 HTML 的 `.ni.parent` + `.nsub` 結構。
 *
 * - 一級：emoji icon + module name + 展開箭頭
 * - 二級：縮排 28px 的 page list
 * - active group：底色 `--shell-active-bg`，文字 navy；active page：底色淺藍
 */

import Link from "next/link";
import type { ModuleDef, ModulePage } from "@/lib/modules";

type Props = {
  module: ModuleDef;
  activePageHref: string | null;
  expanded: boolean;
  isActiveModule: boolean;
  onToggle: () => void;
};

export function ModernNavItem({
  module,
  activePageHref,
  expanded,
  isActiveModule,
  onToggle,
}: Props) {
  const emoji = (module as ModuleDef & { emoji?: string }).emoji ?? moduleEmojiFallback(module);
  const pages = module.pages ?? [];

  return (
    <div className="px-2">
      <button
        type="button"
        onClick={onToggle}
        className={`group w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
          isActiveModule
            ? "bg-[#F0FAF6] text-[#0F6E56] font-medium"
            : "text-[#5A5955] hover:bg-[#F8F7F4] hover:text-[#2C2C2A]"
        }`}
        aria-expanded={expanded}
      >
        <span className="text-[13px] w-[18px] text-center shrink-0">{emoji}</span>
        <span className="truncate">{module.name}</span>
        <span
          className={`ml-auto text-[9px] text-[#9A9890] transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      </button>

      <div
        className={`overflow-hidden transition-[max-height] duration-200 ${
          expanded ? "max-h-[600px]" : "max-h-0"
        }`}
      >
        {pages.map((page) => (
          <SubItem
            key={page.href}
            page={page}
            isActive={activePageHref === page.href || activePageHref?.startsWith(page.href + "/") === true}
          />
        ))}
      </div>
    </div>
  );
}

function SubItem({ page, isActive }: { page: ModulePage; isActive: boolean }) {
  return (
    <Link
      href={page.href}
      className={`flex items-center gap-1.5 ml-7 mr-1 px-2.5 py-1 my-0.5 rounded text-[12px] transition-colors ${
        isActive
          ? "bg-[#F0F6FF] text-[#185FA5] font-medium"
          : "text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#2C2C2A]"
      }`}
    >
      <span className="truncate">{page.name}</span>
    </Link>
  );
}

/**
 * Module emoji fallback — 在 nav_nodes 還沒補 emoji 欄之前，根據 module key 給預設值。
 * 之後 nav_nodes seed 帶 emoji 後，這個函式只剩 cold-path fallback。
 */
function moduleEmojiFallback(module: ModuleDef): string {
  const key = module.key.toLowerCase();
  if (key.includes("parts") || key.includes("inventory")) return "📦";
  if (key.includes("sales")) return "🛒";
  if (key.includes("service")) return "🔧";
  if (key.includes("feedback")) return "💬";
  if (key.includes("admin")) return "⚙️";
  if (key.includes("pos")) return "💳";
  if (key.includes("crm")) return "👥";
  if (key.includes("dashboard") || key.includes("home")) return "🏠";
  return "📁";
}
