"use client";

/**
 * 樣板 sidebar 的「三層樹」渲染共用元件 — section header → parent group → child page。
 *
 * 兩個 shell 都吃這個：
 *   - ModernSidebar / ModernNavItem：active module 內部
 *   - ClassicShell PagesPanel：當前 module 內容
 *
 * 樣式對應 `docs/DUCATI_庫存管理模組_正式版/01_*.html` 的 `.ng / .ngl / .ni.parent / .nsi`。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ModulePage, ParentGroup, SectionGroup } from "@/lib/modules";

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
              <div className="px-3.5 pt-3 pb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.09em] uppercase text-[#9A9890]">
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

  // 預設：含 active child 才展開；後續 active 變動時自動展開（但不強制收回手動展的）
  const [open, setOpen] = useState<boolean>(hasActiveChild);
  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  if (isDirectLink) {
    return (
      <Link
        href={parent.href!}
        className={`mx-2 my-px flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] transition-colors ${
          selfActive
            ? "bg-[#F0FAF6] text-[#0F6E56] font-medium"
            : "text-[#2C2C2A] hover:bg-[#F8F7F4]"
        }`}
      >
        {parent.emoji && (
          <span className="text-[13px] w-[18px] text-center shrink-0">{parent.emoji}</span>
        )}
        <span className="truncate flex-1">{parent.name}</span>
        {parent.badge && <Badge tone="warn">{parent.badge}</Badge>}
      </Link>
    );
  }

  const sectionActive = hasActiveChild;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mx-2 my-px w-[calc(100%-1rem)] flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12.5px] transition-colors ${
          sectionActive
            ? "bg-[#F0FAF6] text-[#0F6E56] font-medium"
            : "text-[#2C2C2A] hover:bg-[#F8F7F4]"
        }`}
      >
        {parent.emoji && (
          <span className="text-[13px] w-[18px] text-center shrink-0">{parent.emoji}</span>
        )}
        <span className="truncate flex-1 text-left">{parent.name}</span>
        {parent.badge && <Badge tone="warn">{parent.badge}</Badge>}
        <span
          className={`text-[9px] text-[#9A9890] transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
      </button>

      <div
        className={`overflow-hidden transition-[max-height] duration-200 ${
          open ? "max-h-[1200px]" : "max-h-0"
        }`}
      >
        {parent.children.map((c) => (
          <NestedChild
            key={c.href}
            page={c}
            isActive={
              activePageHref === c.href || activePageHref?.startsWith(c.href + "/") === true
            }
          />
        ))}
      </div>
    </div>
  );
}

function NestedChild({ page, isActive }: { page: ModulePage; isActive: boolean }) {
  return (
    <Link
      href={page.href}
      className={`flex items-center gap-1.5 ml-7 mr-2 my-px px-2.5 py-[5px] rounded text-[12px] transition-colors ${
        isActive
          ? "bg-[#F0F6FF] text-[#185FA5] font-medium"
          : "text-[#9A9890] hover:bg-[#F8F7F4] hover:text-[#2C2C2A]"
      }`}
    >
      <span className="truncate flex-1">{page.name}</span>
      {page.badge && <Badge tone="danger">{page.badge}</Badge>}
    </Link>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "warn" | "new";
}) {
  const cls =
    tone === "danger"
      ? "bg-[#FDECEA] text-[#CC0000]"
      : tone === "warn"
        ? "bg-[#FDF3E3] text-[#854F0B]"
        : "bg-[#E8F5F0] text-[#0F6E56]";
  return (
    <span
      className={`text-[10px] font-mono font-medium px-1.5 py-px rounded-lg leading-none ${cls}`}
    >
      {children}
    </span>
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
