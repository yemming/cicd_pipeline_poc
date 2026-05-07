"use client";

/**
 * Modern single-sidebar — 220 px 寬白色 sidebar，沿用 53 頁 HTML 設計（單層、二級展開）。
 *
 * 行為（plan §3.3）：
 *   - active module 永遠展開、不可手動收（避免使用者卡死）
 *   - 其他 module 各自獨立 toggle，狀態存 localStorage
 *   - 跟著 SidebarContext 的 collapsed (RWD 平板手機收合) / fullHidden (完全隱藏)
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useNav } from "@/components/nav-provider";
import { useActiveModule } from "@/lib/use-active-module";
import { useSidebar } from "@/components/sidebar-context";
import { ModernNavItem } from "./modern-nav-item";

const STORAGE_KEY = "dealeros:modern-nav-expanded";

export function ModernSidebar() {
  const { modules } = useNav();
  const activeModule = useActiveModule();
  const pathname = usePathname();
  const { collapsed, fullHidden } = useSidebar();

  // 每個 module 自己的 expand state；active 強制展開
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // localStorage 載入（一次）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setExpanded(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // localStorage 取不到（隱私模式 / SSR）→ 用空白預設
    }
  }, []);

  function toggle(key: string) {
    if (key === activeModule?.key) return; // active 不可收
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 寫不進去就算了，不影響功能
      }
      return next;
    });
  }

  if (fullHidden) return null;

  return (
    <aside
      className={`fixed left-0 top-[var(--shell-topbar-h,52px)] bottom-0 z-[100] w-[var(--shell-sidebar-w,220px)] bg-white border-r border-[#EEECE6] overflow-y-auto transition-transform duration-200 ${
        collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
      }`}
      aria-label="導航"
    >
      <nav className="py-3">
        {modules.map((module) => (
          <ModernNavItem
            key={module.key}
            module={module}
            activePageHref={pathname}
            expanded={module.key === activeModule?.key ? true : expanded[module.key] ?? false}
            isActiveModule={module.key === activeModule?.key}
            onToggle={() => toggle(module.key)}
          />
        ))}
      </nav>
    </aside>
  );
}
