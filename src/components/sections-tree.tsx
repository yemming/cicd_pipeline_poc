"use client";

/**
 * Sidebar 三層樹渲染共用元件 — section header → parent group → child page。
 * PagesPanel 在有 sections 時用這個；沒 sections 時 fallback 到 dock magnification。
 *
 * 視覺：所有顏色都讀 sidebar theme CSS 變數（見 src/lib/brands/sidebar-themes.ts），
 * 9 套 theme 切換時會跟著變色。**禁止寫 hardcoded 顏色**，否則 theme 會在這層斷掉。
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { ModulePage, ParentGroup, SectionGroup } from "@/lib/modules";

// Material Symbol icon 渲染器：active 用 sidebar-text，inactive 用 sidebar-text-muted；
// 任何 theme 切換都跟著走。
function NodeIcon({
  icon,
  emoji,
  size = 16,
  active = false,
}: {
  icon?: string;
  emoji?: string;
  size?: number;
  active?: boolean;
}) {
  if (icon) {
    return (
      <span
        className="material-symbols-outlined leading-none shrink-0 transition-colors"
        style={{
          fontSize: `${size}px`,
          width: `${size + 4}px`,
          textAlign: "center",
          color: active ? "var(--sidebar-text)" : "var(--sidebar-text-muted)",
        }}
      >
        {icon}
      </span>
    );
  }
  if (emoji) {
    return (
      <span
        className="leading-none shrink-0 text-center"
        style={{ fontSize: `${size - 2}px`, width: `${size + 4}px` }}
      >
        {emoji}
      </span>
    );
  }
  return null;
}

// motion preset：輕量 hover 互動（淡淡 lift + scale），給人「活潑但不浮誇」的感覺
const rowMotion = {
  whileHover: { x: 2, transition: { type: "spring" as const, stiffness: 380, damping: 26 } },
  whileTap: { scale: 0.98 },
};

export function SectionedTree({
  sections,
  activePageHref,
}: {
  sections: SectionGroup[];
  activePageHref: string | null;
}) {
  return (
    <>
      {sections.map((sec, si) => {
        // L2 沒設 section_group 時 loader fallback 為「(其他)」— 視作未命名分區，不渲染標題
        const showHeader = sec.title && sec.title !== "(其他)";
        return (
          <div key={`${sec.title}-${si}`}>
            {showHeader && (
              <div
                className="px-3.5 pt-3 pb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.09em] uppercase"
                style={{ color: "var(--sidebar-text-muted)" }}
              >
                <span
                  className="w-[5px] h-[5px] rounded-full shrink-0"
                  style={{ background: sectionColor(sec.color) }}
                />
                {sec.title}
              </div>
            )}
            {sec.parents.map((p, pi) => (
              <ParentGroupItem
                key={`${p.name}-${pi}`}
                parent={p}
                activePageHref={activePageHref}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function ParentGroupItem({
  parent,
  activePageHref,
}: {
  parent: ParentGroup;
  activePageHref: string | null;
}) {
  // direct-link parent — 自己有 href、無 children，整列當 link（樣板「庫存查詢」「模組導覽總覽」）
  const isDirectLink = !!parent.href && parent.children.length === 0;

  // direct-link parent 的 active 判斷必須 strict — parent.href 通常是 module 的 root
  // （如 /parts），用 startsWith 會把整個 module 子樹誤判為 active。
  const selfActive = isDirectLink && parent.href ? activePageHref === parent.href : false;

  const hasActiveChild = useMemo(() => {
    if (!activePageHref) return false;
    return parent.children.some(
      (c) => activePageHref === c.href || activePageHref.startsWith(c.href + "/"),
    );
  }, [parent.children, activePageHref]);

  // 預設：含 active child 才展開；後續 active 變動時自動展開（但不強制收回手動展的）。
  // collapsed=true 的群組（設定類）即使含 active child 也預設收起，讓日常操作優先入眼，
  // 使用者仍可手動點開。
  // 用 prev-state 比對在 render 階段觸發 setOpen，避免 useEffect 內 setState 的 cascading render
  const [open, setOpen] = useState<boolean>(hasActiveChild && !parent.collapsed);
  const [prevHasActiveChild, setPrevHasActiveChild] = useState(hasActiveChild);
  if (hasActiveChild !== prevHasActiveChild) {
    setPrevHasActiveChild(hasActiveChild);
    if (hasActiveChild) setOpen(true);
  }

  if (isDirectLink) {
    return (
      <motion.div {...rowMotion}>
        <Link
          href={parent.href!}
          className={`mx-2 my-px flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] font-medium transition-colors sidebar-row ${
            selfActive ? "sidebar-row-active" : ""
          }`}
          style={{ color: "var(--sidebar-text)" }}
        >
          <NodeIcon icon={parent.icon} emoji={parent.emoji} size={18} active={selfActive} />
          <span className="truncate flex-1">{parent.name}</span>
        </Link>
      </motion.div>
    );
  }

  const sectionActive = hasActiveChild;

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        whileHover={{ x: 2, transition: { type: "spring", stiffness: 380, damping: 26 } }}
        whileTap={{ scale: 0.98 }}
        className={`mx-2 my-px w-[calc(100%-1rem)] flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] font-medium transition-colors sidebar-row ${
          sectionActive ? "sidebar-row-active" : ""
        }`}
        style={{ color: "var(--sidebar-text)" }}
      >
        <NodeIcon icon={parent.icon} emoji={parent.emoji} size={18} active={sectionActive} />
        <span className="truncate flex-1 text-left">{parent.name}</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="text-[9px] inline-block"
          style={{ color: "var(--sidebar-text-muted)" }}
        >
          ▶
        </motion.span>
      </motion.button>

      <div
        className={`overflow-hidden transition-[max-height] duration-200 ${
          open ? "max-h-[1200px]" : "max-h-0"
        }`}
      >
        {renderChildrenWithSubLabels(parent.children, activePageHref)}
      </div>
    </div>
  );
}

/**
 * 在同一 parent group 內、依 leaf 的 page.section（分類註記）插入灰色小標。
 * 規範 v3.0 §二：「── xxx ──」是純視覺分組、不可點選；section 相同時只在第一筆上方顯示一次。
 */
function renderChildrenWithSubLabels(
  children: ModulePage[],
  activePageHref: string | null,
) {
  let lastSection: string | undefined;
  return children.map((c) => {
    const showSub = !!c.section && c.section !== lastSection;
    lastSection = c.section;
    return (
      <div key={c.href}>
        {showSub && (
          <div
            className="ml-7 mr-2 mt-2 mb-0.5 px-2.5 text-[10px] tracking-[0.06em] italic select-none"
            style={{ color: "var(--sidebar-text-muted)", opacity: 0.75, pointerEvents: "none" }}
          >
            ── {c.section} ──
          </div>
        )}
        {/* 子頁 active 判定走 strict equality；activePageHref 在 PagesPanel 那層已挑好
            「most specific match」(最長 href 優先)，這裡再做 startsWith 會誤判同前綴頁。 */}
        <NestedChild page={c} isActive={activePageHref === c.href} />
      </div>
    );
  });
}

function NestedChild({ page, isActive }: { page: ModulePage; isActive: boolean }) {
  return (
    <motion.div {...rowMotion}>
      <Link
        href={page.href}
        className={`flex items-center gap-1.5 ml-7 mr-2 my-px px-2.5 py-[5px] rounded text-[12px] transition-colors sidebar-row ${
          isActive ? "sidebar-row-active font-medium" : ""
        }`}
        style={{ color: isActive ? "var(--sidebar-text)" : "var(--sidebar-text-muted)" }}
      >
        <NodeIcon icon={page.icon} size={15} active={isActive} />
        <span className="truncate flex-1">{page.name}</span>
      </Link>
    </motion.div>
  );
}

function sectionColor(key: string | undefined): string {
  switch (key) {
    case "blue":
      return "#1A3A5C";
    case "purple":
      return "#7F77DD";
    case "amber":
      return "#EF9F27";
    case "coral":
      return "#D85A30";
    case "gray":
      return "#9A9890";
    case "teal":
      return "#0F6E56";
    case "red":
      return "#CC0000";
    default:
      return key && key.startsWith("#") ? key : "#9A9890";
  }
}
