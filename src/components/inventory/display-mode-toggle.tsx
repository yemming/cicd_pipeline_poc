"use client";

import { useEffect } from "react";

/**
 * 庫存看板顯示模式 — 卡片 / 列表雙模式。
 * 第九輪 BDN Batch A T1+T2 引入；供 newcar / usedcar 看板共用。
 */
export type DisplayMode = "card" | "list";

const TOGGLE_BTN_BASE =
  "h-[28px] px-3 rounded text-[12px] border transition inline-flex items-center gap-1";

function btnClass(active: boolean) {
  return (
    TOGGLE_BTN_BASE +
    " " +
    (active
      ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
      : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]")
  );
}

/**
 * 雙模式 toggle button group。
 *
 * @param value     當前模式
 * @param onChange  切換 callback
 * @param persistKey  選填；若給，會把模式存到 localStorage[`inventory-display-mode:${persistKey}`]。
 *                    元件本身不負責 hydrate，由 caller 在初始化 useState 時用 `readPersistedMode(persistKey)` 讀回。
 *                    （這樣才能避免 SSR / 第一次 render 跟 localStorage 不同步閃爍）
 */
export function DisplayModeToggle({
  value,
  onChange,
  persistKey,
}: {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
  persistKey?: string;
}) {
  useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`inventory-display-mode:${persistKey}`, value);
    } catch {
      // ignore (private mode / quota)
    }
  }, [value, persistKey]);

  return (
    <div className="flex gap-1" data-testid="view-toggle" role="group" aria-label="顯示模式切換">
      <button
        type="button"
        className={btnClass(value === "card")}
        onClick={() => onChange("card")}
        data-testid="view-toggle-card"
        aria-pressed={value === "card"}
      >
        ⊞ 卡片
      </button>
      <button
        type="button"
        className={btnClass(value === "list")}
        onClick={() => onChange("list")}
        data-testid="view-toggle-list"
        aria-pressed={value === "list"}
      >
        ☰ 列表
      </button>
    </div>
  );
}

/**
 * 從 localStorage 讀回先前儲存的模式；無 / 異常時回 fallback（預設 "card"）。
 * 給 useState 初始化用：`useState<DisplayMode>(() => readPersistedMode("sales/showroom/new-cars"))`。
 */
export function readPersistedMode(
  persistKey: string,
  fallback: DisplayMode = "card",
): DisplayMode {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(`inventory-display-mode:${persistKey}`);
    if (v === "card" || v === "list") return v;
  } catch {
    // ignore
  }
  return fallback;
}
